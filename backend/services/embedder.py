# backend/services/embedder.py
"""
Singleton embedding service using BGE-M3 (1024-dim, multilingual).
Caches model in memory after first load.
"""
from sentence_transformers import SentenceTransformer
from core.config import settings
import numpy as np
import logging

logger = logging.getLogger(__name__)

_model: SentenceTransformer | None = None


def get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        logger.info(f"Loading embedding model: {settings.embedding_model}")
        _model = SentenceTransformer(settings.embedding_model)
        logger.info("Embedding model loaded.")
    return _model


def embed_texts(texts: list[str], batch_size: int = 32) -> list[list[float]]:
    """
    Embed a list of strings. Returns list of float vectors.
    Uses BGE-M3 instruction prefix for better retrieval quality.
    """
    model = get_model()
    # BGE models benefit from instruction prefix for queries
    vectors = model.encode(
        texts,
        batch_size=batch_size,
        normalize_embeddings=True,
        show_progress_bar=len(texts) > 50,
    )
    return vectors.tolist()


def embed_query(query: str) -> list[float]:
    """
    Embed a single query string with retrieval instruction prefix.
    BGE-M3 improves recall when queries use this prefix.
    """
    model = get_model()
    prefixed = f"Represent this sentence for searching relevant passages: {query}"
    vector = model.encode(prefixed, normalize_embeddings=True)
    return vector.tolist()


def get_embedding_dim() -> int:
    return get_model().get_sentence_embedding_dimension()
