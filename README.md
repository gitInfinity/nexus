# NEXUS — AI Research Intelligence System

a comprehensive research platform for ingesting academic documents, building retrieval-augmented research sessions, generating structured insights, and drafting grounded academic content.

## Overview

NEXUS combines a React/Vite frontend with a FastAPI backend to deliver a full-stack research assistant. It ingests PDF papers, indexes them in Qdrant, and uses an Ollama-compatible LLM for:

- RAG Q&A with inline source citations
- Research intelligence reports (consensus, gaps, contradictions, trends)
- Drafting academic paper sections (abstract, intro, methodology, etc.)
- Exporting final outputs as DOCX or PDF

## Technology Stack

- Frontend: React 18 + Vite
- Backend: FastAPI (Python)
- Vector store: Qdrant
- Embeddings: BAAI/BGE-M3
- LLM: Ollama-compatible model via local Ollama API
- Storage: SQLite by default, with PostgreSQL recommended for production
- PDF processing: PyMuPDF + pdfplumber
- Export: python-docx, reportlab

## Key Features

- PDF ingestion and automated chunking
- Persistent paper metadata and session management
- Retrieval-augmented question answering with source attribution
- Session-scoped paper libraries and chat history
- Insight report generation for literature synthesis
- Paper section drafting and export to DOCX/PDF
- Docker Compose configuration for local deployment

## Repository Layout

```text
.
├── backend/
│   ├── .env
│   ├── .env.example
│   ├── api/
│   ├── core/
│   ├── Dockerfile
│   ├── main.py
│   ├── models/
│   ├── requirements.txt
│   ├── services/
│   └── uploads/
├── frontend/
│   ├── Dockerfile
│   ├── index.html
│   ├── package.json
│   ├── src/
│   └── vite.config.js
├── docker-compose.yml
├── requirements.txt
└── README.md
```

## Prerequisites

- Python 3.11+
- Node.js 18+ / npm
- Docker & Docker Compose
- Local Ollama server or compatible OpenAI-style model endpoint
- Qdrant accessible on `http://localhost:6333`

## Quick Start (Docker)

1. Build and start the stack:

```bash
docker compose up --build
```

2. Open the frontend:

```text
http://localhost:5173
```

3. Backend API ready at:

```text
http://localhost:8000
```

## Local Development

### Backend

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Create a `.env` file at `backend/.env` with the required runtime settings.

### Frontend

```bash
cd frontend
npm install
npm run dev -- --host
```

## Environment Configuration

Create `backend/.env` with values like:

```env
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=nexus_papers
DATABASE_URL=sqlite+aiosqlite:///./nexus.db
EMBEDDING_MODEL=BAAI/bge-m3
MAX_CHUNK_SIZE=512
CHUNK_OVERLAP=64
TOP_K_RETRIEVAL=8
UPLOAD_DIR=./uploads
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

> Note: The backend uses `pydantic-settings` so environment variables should match the field names when uppercased.

## API Summary

### Papers

- `POST /api/papers/upload` — Upload PDF/TXT files
- `GET /api/papers` — List ingested papers
- `GET /api/papers/{paper_id}` — Get paper metadata
- `DELETE /api/papers/{paper_id}` — Remove paper and indexed vectors

### Sessions

- `POST /api/sessions` — Create a new research session
- `GET /api/sessions` — List sessions
- `GET /api/sessions/{session_id}` — Get session details and messages
- `DELETE /api/sessions/{session_id}` — Delete a session
- `PUT /api/sessions/{session_id}/papers` — Update paper list for a session

### RAG & Insights

- `POST /api/sessions/{session_id}/query` — Stream a RAG-style chat response
- `GET /api/sessions/{session_id}/insights` — Generate research intelligence report
- `POST /api/sessions/{session_id}/draft` — Draft a paper section
- `GET /api/sessions/{session_id}/sections` — Retrieve saved sections
- `PUT /api/sessions/{session_id}/sections/{type}` — Save edited section
- `GET /api/sessions/{session_id}/export/{fmt}` — Export paper as `docx` or `pdf`

## Production Considerations

- Replace SQLite with PostgreSQL for reliability and concurrent use.
- Use a managed or dedicated Qdrant deployment for scale.
- Host Ollama on a production server or use a compatible LLM API.
- Serve the frontend build output from a CDN or web server.
- Add authentication, authorization, and request throttling for multi-user deployments.

## Testing

- Backend routes can be validated with Postman, curl, or automated FastAPI tests.
- Frontend served by Vite for development and `npm run build` for production packaging.

## Deployment Checklist

- [ ] Configure `.env` for production endpoints
- [ ] Run Qdrant with persistent storage
- [ ] Build frontend: `npm run build`
- [ ] Serve frontend from a static host or reverse proxy
- [ ] Use HTTPS for all API traffic
- [ ] Monitor model and vector store health

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests and documentation
4. Submit a pull request

## License

This repository does not include a license file. Add an appropriate open source license before sharing publicly.
