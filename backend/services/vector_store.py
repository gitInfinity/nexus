# backend/services/vector_store.py
"""
Qdrant vector store wrapper.
Handles collection creation, upsert, and similarity search.
Each point stored = one text chunk from a paper.

Point payload schema:
  paper_id: str
  chunk_index: int
  page: int
  section: str
  text: str
  title: str
  authors: str
  year: int
"""
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct,
    Filter, FieldCondition, MatchValue,
    SearchRequest, ScoredPoint,
)
from core.config import settings
from services.embedder import get_embedding_dim
import logging
import uuid

logger = logging.getLogger(__name__)

_client: QdrantClient | None = None


def get_client() -> QdrantClient:
    global _client
    if _client is None:
        _client = QdrantClient(url=settings.qdrant_url)
    return _client


def ensure_collection():
    """Create collection if it doesn't exist."""
    client = get_client()
    existing = [c.name for c in client.get_collections().collections]
    if settings.qdrant_collection not in existing:
        dim = get_embedding_dim()
        client.create_collection(
            collection_name=settings.qdrant_collection,
            vectors_config=VectorParams(size=dim, distance=Distance.COSINE),
        )
        logger.info(f"Created Qdrant collection '{settings.qdrant_collection}' dim={dim}")


def upsert_chunks(
    paper_id: str,
    chunks: list[dict],   # [{"text":..,"page":..,"chunk_index":..,"section":..}]
    embeddings: list[list[float]],
    paper_meta: dict,     # {title, authors, year}
):
    """Upsert all chunks for a paper into Qdrant."""
    client = get_client()
    ensure_collection()

    points = []
    for chunk, vector in zip(chunks, embeddings):
        point_id = str(uuid.uuid4())
        points.append(PointStruct(
            id=point_id,
            vector=vector,
            payload={
                "paper_id": paper_id,
                "chunk_index": chunk["chunk_index"],
                "page": chunk["page"],
                "section": chunk["section_hint"],
                "text": chunk["text"],
                "title": paper_meta.get("title", ""),
                "authors": paper_meta.get("authors", ""),
                "year": paper_meta.get("year"),
            }
        ))

    # Qdrant recommends batches of ~100
    batch_size = 100
    for i in range(0, len(points), batch_size):
        client.upsert(
            collection_name=settings.qdrant_collection,
            points=points[i:i + batch_size],
        )
    logger.info(f"Upserted {len(points)} chunks for paper {paper_id}")


def search(
    query_vector: list[float],
    top_k: int = 8,
    paper_ids: list[str] | None = None,
) -> list[ScoredPoint]:
    """
    Similarity search. Optionally filter to specific paper IDs (session scope).
    Returns top_k scored points with full payloads.
    """
    client = get_client()
    ensure_collection()

    query_filter = None
    if paper_ids:
        query_filter = Filter(
            must=[FieldCondition(key="paper_id", match=MatchValue(any=paper_ids))]
        )

    results = client.search(
        collection_name=settings.qdrant_collection,
        query_vector=query_vector,
        limit=top_k,
        with_payload=True,
        query_filter=query_filter,
    )
    return results


def delete_paper_chunks(paper_id: str):
    """Remove all chunks for a paper (e.g. if paper is deleted)."""
    client = get_client()
    client.delete(
        collection_name=settings.qdrant_collection,
        points_selector=Filter(
            must=[FieldCondition(key="paper_id", match=MatchValue(value=paper_id))]
        ),
    )
    logger.info(f"Deleted chunks for paper {paper_id}")
