# backend/services/ingestion.py
"""
Full ingestion pipeline for a single PDF:
  1. Parse PDF → extract metadata + chunks
  2. Embed chunks in batches
  3. Upsert to Qdrant
  4. Update paper status in DB

Designed to run in a background task (FastAPI BackgroundTasks).
"""
import asyncio
import logging
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from models.database import Paper, AsyncSessionLocal
from services.pdf_parser import extract_metadata, iter_chunks
from services.embedder import embed_texts
from services.vector_store import upsert_chunks
from core.config import settings

logger = logging.getLogger(__name__)


async def run_ingestion(paper_id: str, filepath: str):
    """
    Background task: parse, embed, and index a paper.
    Updates DB status throughout.
    """
    async with AsyncSessionLocal() as db:
        try:
            # Mark as processing
            await _update_status(db, paper_id, "processing")

            # --- Step 1: Parse PDF ---
            logger.info(f"[{paper_id}] Parsing PDF: {filepath}")
            meta = extract_metadata(filepath)

            chunks_list = []
            for chunk in iter_chunks(filepath, settings.max_chunk_size, settings.chunk_overlap):
                chunks_list.append({
                    "text": chunk.text,
                    "page": chunk.page,
                    "chunk_index": chunk.chunk_index,
                    "section_hint": chunk.section_hint,
                })

            if not chunks_list:
                raise ValueError("No text chunks extracted — PDF may be image-only or encrypted.")

            # --- Step 2: Embed in batches ---
            logger.info(f"[{paper_id}] Embedding {len(chunks_list)} chunks...")
            texts = [c["text"] for c in chunks_list]

            # Run embedding in executor (CPU-bound)
            loop = asyncio.get_event_loop()
            embeddings = await loop.run_in_executor(
                None,
                lambda: embed_texts(texts, batch_size=32)
            )

            # --- Step 3: Upsert to Qdrant ---
            logger.info(f"[{paper_id}] Upserting to Qdrant...")
            paper_meta = {
                "title": meta.title,
                "authors": meta.authors,
                "year": meta.year,
            }
            await loop.run_in_executor(
                None,
                lambda: upsert_chunks(paper_id, chunks_list, embeddings, paper_meta)
            )

            # --- Step 4: Update DB with metadata ---
            await db.execute(
                update(Paper)
                .where(Paper.id == paper_id)
                .values(
                    status="indexed",
                    title=meta.title or (await _get_field(db, paper_id, "title")),
                    authors=meta.authors,
                    abstract=meta.abstract,
                    year=meta.year,
                    pages=meta.total_pages,
                    total_chunks=len(chunks_list),
                    error_message=None,
                )
            )
            await db.commit()
            logger.info(f"[{paper_id}] ✓ Indexed successfully ({len(chunks_list)} chunks)")

        except Exception as e:
            logger.error(f"[{paper_id}] Ingestion failed: {e}", exc_info=True)
            async with AsyncSessionLocal() as db2:
                await _update_status(db2, paper_id, "failed", str(e))


async def _update_status(db: AsyncSession, paper_id: str, status: str, error: str | None = None):
    await db.execute(
        update(Paper)
        .where(Paper.id == paper_id)
        .values(status=status, error_message=error)
    )
    await db.commit()


async def _get_field(db: AsyncSession, paper_id: str, field: str):
    result = await db.execute(select(Paper).where(Paper.id == paper_id))
    paper = result.scalar_one_or_none()
    return getattr(paper, field, "") if paper else ""
