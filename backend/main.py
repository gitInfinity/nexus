# backend/main.py
"""
NEXUS Research Intelligence — FastAPI Backend
Run: uvicorn main:app --reload --port 8000
"""
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from core.config import settings
from models.database import init_db
from api.routes import router

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Initializing database...")
    await init_db()
    os.makedirs(settings.upload_dir, exist_ok=True)
    logger.info("NEXUS backend ready.")
    yield
    # Shutdown
    logger.info("NEXUS backend shutting down.")


app = FastAPI(
    title="NEXUS Research Intelligence API",
    description="AI-powered research assistant: ingest papers, RAG chat, write papers.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/health")
async def health():
    return {"status": "ok", "model": settings.ollama_model}
