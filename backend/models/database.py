# backend/models/database.py
from sqlalchemy import Column, String, Integer, Float, DateTime, Text, JSON, Boolean
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from datetime import datetime
from core.config import settings
import uuid


engine = create_async_engine(settings.database_url, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Paper(Base):
    __tablename__ = "papers"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, nullable=False)
    authors = Column(String, default="")
    year = Column(Integer, nullable=True)
    journal = Column(String, default="")
    abstract = Column(Text, default="")
    filename = Column(String, nullable=False)
    filepath = Column(String, nullable=False)
    pages = Column(Integer, default=0)
    total_chunks = Column(Integer, default=0)
    status = Column(String, default="queued")   # queued | processing | indexed | failed
    tags = Column(JSON, default=list)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Session(Base):
    __tablename__ = "sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, default="New Research Session")
    paper_ids = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)


class Message(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, nullable=False)
    role = Column(String, nullable=False)   # user | assistant
    content = Column(Text, nullable=False)
    sources = Column(JSON, default=list)    # [{paper_id, chunk_text, page, score}]
    confidence = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class PaperSection(Base):
    __tablename__ = "paper_sections"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, nullable=False)
    section_type = Column(String, nullable=False)  # abstract|intro|related|method|results|discussion|conclusion|references
    content = Column(Text, default="")
    word_count = Column(Integer, default=0)
    is_done = Column(Boolean, default=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
