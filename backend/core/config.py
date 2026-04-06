# backend/core/config.py
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2:3b"
    qdrant_url: str = "http://localhost:6333"
    qdrant_collection: str = "nexus_papers"
    database_url: str = "sqlite+aiosqlite:///./nexus.db"
    embedding_model: str = "BAAI/bge-m3"
    max_chunk_size: int = 512
    chunk_overlap: int = 64
    top_k_retrieval: int = 8
    upload_dir: str = "./uploads"
    cors_origins: List[str] = ["http://localhost:5173", "http://localhost:3000"]

    class Config:
        env_file = ".env"


settings = Settings()
