# backend/api/routes.py
"""
All API endpoints for NEXUS.

POST /api/papers/upload          — Upload + queue ingestion of PDFs
GET  /api/papers                 — List all papers
GET  /api/papers/{id}            — Get single paper
DELETE /api/papers/{id}          — Delete paper + vectors

POST /api/sessions               — Create session
GET  /api/sessions               — List sessions
GET  /api/sessions/{id}          — Get session + messages
DELETE /api/sessions/{id}        — Delete session

POST /api/sessions/{id}/query    — RAG query (SSE streaming)
GET  /api/sessions/{id}/insights — Generate insight report
POST /api/sessions/{id}/draft    — Draft a paper section

GET  /api/sessions/{id}/sections          — Get all paper sections
PUT  /api/sessions/{id}/sections/{type}   — Save edited section
GET  /api/sessions/{id}/export/{fmt}      — Export paper (docx|pdf)
"""
import os
import uuid
import shutil
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel

from models.database import get_db, Paper, Session, Message, PaperSection
from services.ingestion import run_ingestion
from services.rag import rag_query_stream, generate_insights, draft_section
from services.vector_store import delete_paper_chunks
from services.exporter import export_docx, export_pdf
from core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

os.makedirs(settings.upload_dir, exist_ok=True)


# ─────────────────────────────────────────
# PYDANTIC SCHEMAS
# ─────────────────────────────────────────

class SessionCreate(BaseModel):
    title: str = "New Research Session"
    paper_ids: list[str] = []

class QueryRequest(BaseModel):
    query: str
    history: list[dict] = []   # [{"role": "user"|"assistant", "content": "..."}]

class SectionUpdate(BaseModel):
    content: str

class DraftRequest(BaseModel):
    section_type: str
    paper_title: str = ""


# ─────────────────────────────────────────
# PAPERS
# ─────────────────────────────────────────

@router.post("/papers/upload")
async def upload_papers(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload one or more PDFs. Each is saved and queued for background indexing."""
    results = []
    for file in files:
        if not file.filename.lower().endswith((".pdf", ".txt")):
            results.append({"filename": file.filename, "error": "Only PDF and TXT supported"})
            continue

        paper_id = str(uuid.uuid4())
        dest = Path(settings.upload_dir) / f"{paper_id}_{file.filename}"

        with open(dest, "wb") as f:
            shutil.copyfileobj(file.file, f)

        paper = Paper(
            id=paper_id,
            title=Path(file.filename).stem,
            filename=file.filename,
            filepath=str(dest),
            status="queued",
        )
        db.add(paper)
        await db.commit()

        # Kick off background ingestion
        background_tasks.add_task(run_ingestion, paper_id, str(dest))

        results.append({"paper_id": paper_id, "filename": file.filename, "status": "queued"})

    return {"uploaded": results}


@router.get("/papers")
async def list_papers(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Paper).order_by(Paper.created_at.desc()))
    papers = result.scalars().all()
    return {"papers": [_paper_dict(p) for p in papers]}


@router.get("/papers/{paper_id}")
async def get_paper(paper_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Paper).where(Paper.id == paper_id))
    paper = result.scalar_one_or_none()
    if not paper:
        raise HTTPException(404, "Paper not found")
    return _paper_dict(paper)


@router.delete("/papers/{paper_id}")
async def delete_paper(paper_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Paper).where(Paper.id == paper_id))
    paper = result.scalar_one_or_none()
    if not paper:
        raise HTTPException(404, "Paper not found")
    # Delete file
    if os.path.exists(paper.filepath):
        os.remove(paper.filepath)
    # Delete vectors
    delete_paper_chunks(paper_id)
    # Delete DB record
    await db.execute(delete(Paper).where(Paper.id == paper_id))
    await db.commit()
    return {"deleted": paper_id}


# ─────────────────────────────────────────
# SESSIONS
# ─────────────────────────────────────────

@router.post("/sessions")
async def create_session(body: SessionCreate, db: AsyncSession = Depends(get_db)):
    session = Session(id=str(uuid.uuid4()), title=body.title, paper_ids=body.paper_ids)
    db.add(session)
    await db.commit()
    return {"session_id": session.id, "title": session.title}


@router.get("/sessions")
async def list_sessions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Session).order_by(Session.created_at.desc()))
    sessions = result.scalars().all()
    return {"sessions": [{"id": s.id, "title": s.title, "paper_ids": s.paper_ids, "created_at": s.created_at.isoformat()} for s in sessions]}


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Session not found")

    msg_result = await db.execute(select(Message).where(Message.session_id == session_id).order_by(Message.created_at))
    messages = msg_result.scalars().all()

    return {
        "session": {"id": session.id, "title": session.title, "paper_ids": session.paper_ids},
        "messages": [{"id": m.id, "role": m.role, "content": m.content, "sources": m.sources, "confidence": m.confidence, "timestamp": m.created_at.isoformat()} for m in messages],
    }


@router.put("/sessions/{session_id}/papers")
async def update_session_papers(session_id: str, body: dict, db: AsyncSession = Depends(get_db)):
    """Add or remove papers from a session."""
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404)
    session.paper_ids = body.get("paper_ids", session.paper_ids)
    await db.commit()
    return {"paper_ids": session.paper_ids}


# ─────────────────────────────────────────
# CHAT (Streaming RAG)
# ─────────────────────────────────────────

@router.post("/sessions/{session_id}/query")
async def query_session(session_id: str, body: QueryRequest, db: AsyncSession = Depends(get_db)):
    """
    Streaming SSE endpoint.
    Retrieves relevant chunks → streams Claude response → saves message to DB.
    """
    # Get session's paper IDs
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Session not found")

    paper_ids = session.paper_ids

    # Save user message
    user_msg = Message(id=str(uuid.uuid4()), session_id=session_id, role="user", content=body.query)
    db.add(user_msg)
    await db.commit()

    # Accumulate full response for DB save
    accumulated_text = []
    accumulated_sources = []
    accumulated_confidence = None

    async def event_generator():
        nonlocal accumulated_sources, accumulated_confidence
        async for chunk in rag_query_stream(body.query, paper_ids, body.history):
            yield chunk
            # Parse SSE to accumulate
            if chunk.startswith("data: "):
                import json as _json
                try:
                    payload = _json.loads(chunk[6:])
                    if payload.get("type") == "chunk":
                        accumulated_text.append(payload.get("text", ""))
                    elif payload.get("type") == "sources":
                        accumulated_sources = payload.get("sources", [])
                    elif payload.get("type") == "confidence":
                        accumulated_confidence = payload.get("score")
                    elif payload.get("type") == "done":
                        # Save assistant message to DB after streaming completes
                        full_text = "".join(accumulated_text)
                        async with __import__("models.database", fromlist=["AsyncSessionLocal"]).AsyncSessionLocal() as save_db:
                            assistant_msg = Message(
                                id=str(uuid.uuid4()),
                                session_id=session_id,
                                role="assistant",
                                content=full_text,
                                sources=accumulated_sources,
                                confidence=accumulated_confidence,
                            )
                            save_db.add(assistant_msg)
                            await save_db.commit()
                except Exception:
                    pass

    return StreamingResponse(event_generator(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ─────────────────────────────────────────
# INSIGHTS
# ─────────────────────────────────────────

@router.get("/sessions/{session_id}/insights")
async def get_insights(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404)
    if not session.paper_ids:
        raise HTTPException(400, "No papers in session")
    insights = await generate_insights(session.paper_ids)
    return insights


# ─────────────────────────────────────────
# PAPER WRITING
# ─────────────────────────────────────────

@router.get("/sessions/{session_id}/sections")
async def get_sections(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PaperSection).where(PaperSection.session_id == session_id))
    sections = result.scalars().all()
    return {"sections": {s.section_type: {"content": s.content, "word_count": s.word_count, "is_done": s.is_done} for s in sections}}


@router.put("/sessions/{session_id}/sections/{section_type}")
async def save_section(session_id: str, section_type: str, body: SectionUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PaperSection).where(PaperSection.session_id == session_id, PaperSection.section_type == section_type))
    sec = result.scalar_one_or_none()
    word_count = len(body.content.split())
    if sec:
        sec.content = body.content
        sec.word_count = word_count
        sec.is_done = word_count > 10
    else:
        sec = PaperSection(session_id=session_id, section_type=section_type, content=body.content, word_count=word_count, is_done=word_count > 10)
        db.add(sec)
    await db.commit()
    return {"saved": True, "word_count": word_count}


@router.post("/sessions/{session_id}/draft")
async def draft_paper_section(session_id: str, body: DraftRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404)

    # Load existing sections for coherence
    sec_result = await db.execute(select(PaperSection).where(PaperSection.session_id == session_id))
    existing = {s.section_type: s.content for s in sec_result.scalars().all() if s.content}

    drafted = await draft_section(body.section_type, session.paper_ids, body.paper_title, existing)

    # Auto-save drafted content
    result2 = await db.execute(select(PaperSection).where(PaperSection.session_id == session_id, PaperSection.section_type == body.section_type))
    sec = result2.scalar_one_or_none()
    wc = len(drafted.split())
    if sec:
        sec.content = drafted
        sec.word_count = wc
        sec.is_done = True
    else:
        sec = PaperSection(session_id=session_id, section_type=body.section_type, content=drafted, word_count=wc, is_done=True)
        db.add(sec)
    await db.commit()

    return {"content": drafted, "word_count": wc}


# ─────────────────────────────────────────
# EXPORT
# ─────────────────────────────────────────

@router.get("/sessions/{session_id}/export/{fmt}")
async def export_paper(session_id: str, fmt: str, db: AsyncSession = Depends(get_db)):
    if fmt not in ("docx", "pdf"):
        raise HTTPException(400, "Format must be docx or pdf")

    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404)

    sec_result = await db.execute(select(PaperSection).where(PaperSection.session_id == session_id))
    sections = {s.section_type: s.content for s in sec_result.scalars().all()}

    title = session.title
    authors = ""  # Could be stored per session

    if fmt == "docx":
        data = export_docx(title, authors, sections)
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        filename = f"{title.replace(' ', '_')}.docx"
    else:
        data = export_pdf(title, authors, sections)
        media_type = "application/pdf"
        filename = f"{title.replace(' ', '_')}.pdf"

    return Response(content=data, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


# ─────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────

def _paper_dict(p: Paper) -> dict:
    return {
        "id": p.id,
        "title": p.title,
        "authors": p.authors,
        "year": p.year,
        "journal": p.journal,
        "abstract": p.abstract,
        "filename": p.filename,
        "pages": p.pages,
        "total_chunks": p.total_chunks,
        "status": p.status,
        "tags": p.tags or [],
        "error_message": p.error_message,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }
