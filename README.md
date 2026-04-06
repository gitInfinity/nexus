# NEXUS — AI Research Intelligence System
> Full-stack RAG-powered research assistant: ingest 100s of PDFs, get AI insights, write papers.

## Stack
| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + Tailwind (dark theme) |
| Backend | FastAPI (Python 3.11) |
| LLM | Anthropic Claude (claude-3-5-sonnet) |
| Embeddings | sentence-transformers (BGE-M3) |
| Vector DB | Qdrant (local Docker or cloud) |
| Relational DB | SQLite (dev) / PostgreSQL (prod) |
| PDF Parsing | PyMuPDF (fitz) + pdfplumber |
| Task Queue | Background threads (dev) / Celery+Redis (prod) |
| Export | python-docx, reportlab (PDF) |

## Quick Start

### 1. Clone & install backend
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
```

### 2. Set environment variables
```bash
cp .env.example .env
# Edit .env — add your ANTHROPIC_API_KEY
```

### 3. Start Qdrant (Docker)
```bash
docker run -p 6333:6333 -v $(pwd)/qdrant_data:/qdrant/storage qdrant/qdrant
```

### 4. Run backend
```bash
cd backend
uvicorn main:app --reload --port 8000
```

### 5. Run frontend
```bash
cd frontend
npm install && npm run dev
# Open http://localhost:5173
```

## Features
- **PDF Ingestion** — Upload 100s of papers; auto-chunked, embedded, indexed
- **Research Chat** — RAG-powered Q&A with citations back to exact paper passages
- **Insights Engine** — Auto-detect gaps, consensus, contradictions, trends
- **Paper Writer** — AI drafts each section grounded in your library
- **Export** — Download full paper as DOCX or PDF
