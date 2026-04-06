# backend/services/pdf_parser.py
"""
Parses PDF files into structured chunks ready for embedding.
Uses PyMuPDF for text extraction and pdfplumber for tables.
"""
import fitz  # PyMuPDF
import pdfplumber
import re
from pathlib import Path
from typing import Generator
from dataclasses import dataclass


@dataclass
class TextChunk:
    text: str
    page: int
    chunk_index: int
    section_hint: str  # abstract, introduction, methodology, etc.


@dataclass
class PaperMetadata:
    title: str
    authors: str
    abstract: str
    year: int | None
    total_pages: int


# Heuristic section headers found in academic papers
SECTION_PATTERNS = {
    "abstract": re.compile(r"^\s*(abstract)\s*$", re.I),
    "introduction": re.compile(r"^\s*\d*\.?\s*(introduction|background)\s*$", re.I),
    "related_work": re.compile(r"^\s*\d*\.?\s*(related work|prior work|literature review)\s*$", re.I),
    "methodology": re.compile(r"^\s*\d*\.?\s*(method(ology)?|approach|proposed method)\s*$", re.I),
    "results": re.compile(r"^\s*\d*\.?\s*(results?|experiments?|evaluation)\s*$", re.I),
    "discussion": re.compile(r"^\s*\d*\.?\s*(discussion|analysis)\s*$", re.I),
    "conclusion": re.compile(r"^\s*\d*\.?\s*(conclusion|summary|future work)\s*$", re.I),
    "references": re.compile(r"^\s*\d*\.?\s*(references|bibliography)\s*$", re.I),
}


def extract_metadata(filepath: str) -> PaperMetadata:
    """Extract title, authors, abstract, year from first 2 pages."""
    doc = fitz.open(filepath)
    first_pages_text = ""
    for i in range(min(2, len(doc))):
        first_pages_text += doc[i].get_text("text") + "\n"
    doc.close()

    lines = [l.strip() for l in first_pages_text.split("\n") if l.strip()]

    # Title: first non-empty line that's not a URL/number and is long enough
    title = ""
    for line in lines[:10]:
        if len(line) > 15 and not line.startswith("http") and not line[0].isdigit():
            title = line
            break

    # Abstract: text between "Abstract" header and next section
    abstract = ""
    abstract_start = -1
    for i, line in enumerate(lines):
        if re.match(r"^\s*abstract\s*$", line, re.I):
            abstract_start = i + 1
            break
    if abstract_start > 0:
        abstract_lines = []
        for line in lines[abstract_start:abstract_start + 30]:
            if any(p.match(line) for p in SECTION_PATTERNS.values()):
                break
            abstract_lines.append(line)
        abstract = " ".join(abstract_lines)[:1200]

    # Authors: heuristic — lines between title and abstract with commas/and
    authors = ""
    for line in lines[1:8]:
        if re.search(r",|\band\b", line) and len(line) < 200 and not re.search(r"university|department|abstract", line, re.I):
            authors = line
            break

    # Year: 4-digit year in first pages
    year = None
    year_match = re.search(r"\b(20\d{2}|19\d{2})\b", first_pages_text)
    if year_match:
        year = int(year_match.group(1))

    total_pages = fitz.open(filepath).page_count

    return PaperMetadata(
        title=title or Path(filepath).stem,
        authors=authors,
        abstract=abstract,
        year=year,
        total_pages=total_pages,
    )


def detect_section(line: str) -> str | None:
    for section, pattern in SECTION_PATTERNS.items():
        if pattern.match(line):
            return section
    return None


def chunk_text(text: str, max_tokens: int = 512, overlap: int = 64) -> list[str]:
    """
    Split text into overlapping chunks by approximate token count.
    Uses word-level splitting (1 token ≈ 0.75 words).
    """
    max_words = int(max_tokens * 0.75)
    overlap_words = int(overlap * 0.75)

    words = text.split()
    if not words:
        return []

    chunks = []
    start = 0
    while start < len(words):
        end = min(start + max_words, len(words))
        chunk = " ".join(words[start:end])
        if len(chunk.strip()) > 50:   # skip tiny fragments
            chunks.append(chunk)
        start += max_words - overlap_words
        if start >= len(words):
            break

    return chunks


def iter_chunks(filepath: str, max_chunk_size: int = 512, overlap: int = 64) -> Generator[TextChunk, None, None]:
    """
    Main entry point: parse a PDF and yield TextChunk objects.
    Skips reference sections (mostly citation lists, low semantic value).
    """
    doc = fitz.open(filepath)
    current_section = "body"
    chunk_idx = 0
    skip_from_here = False

    for page_num in range(len(doc)):
        page = doc[page_num]
        page_text = page.get_text("text")

        lines = page_text.split("\n")
        page_buffer = []

        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue

            section = detect_section(stripped)
            if section:
                current_section = section
                # Once we hit references, stop chunking (pure citation lists aren't useful for RAG)
                if section == "references":
                    skip_from_here = True
                continue

            if skip_from_here:
                continue

            page_buffer.append(stripped)

        page_text_clean = " ".join(page_buffer)
        if not page_text_clean.strip():
            continue

        for chunk_text_str in chunk_text(page_text_clean, max_chunk_size, overlap):
            yield TextChunk(
                text=chunk_text_str,
                page=page_num + 1,
                chunk_index=chunk_idx,
                section_hint=current_section,
            )
            chunk_idx += 1

    doc.close()
