# backend/services/rag.py
"""
RAG (Retrieval-Augmented Generation) pipeline.

Flow for every query:
  1. Embed user query
  2. Search Qdrant for top-K relevant chunks (filtered to session's papers)
  3. Build a grounded context block with citations
  4. Stream response from Ollama with source attribution
  5. Compute a confidence score from retrieval scores

Also provides:
  - generate_insights()  → consensus, gaps, contradictions, trends
  - draft_section()      → write a paper section grounded in the library
"""
import asyncio
import json
import logging
from typing import AsyncGenerator

from openai import AsyncOpenAI

from core.config import settings
from services.embedder import embed_query
from services.vector_store import search

logger = logging.getLogger(__name__)

_ollama_client: AsyncOpenAI | None = None


def get_ollama_client() -> AsyncOpenAI:
    global _ollama_client
    if _ollama_client is None:
        _ollama_client = AsyncOpenAI(
            base_url=settings.ollama_url + "/v1",
            api_key="ollama",  # Ollama doesn't require auth
        )
    return _ollama_client


# ──────────────────────────────────────────
# CORE RAG QUERY  (streaming)
# ──────────────────────────────────────────

async def rag_query_stream(
    query: str,
    session_paper_ids: list[str],
    chat_history: list[dict],    # [{"role": "user"|"assistant", "content": "..."}]
) -> AsyncGenerator[str, None]:
    """
    Yields Server-Sent Event strings:
      data: {"type": "chunk", "text": "..."}
      data: {"type": "sources", "sources": [...]}
      data: {"type": "confidence", "score": 0.87}
      data: {"type": "done"}
    """
    # 1. Retrieve relevant chunks
    q_vector = await asyncio.get_event_loop().run_in_executor(None, lambda: embed_query(query))
    hits = search(q_vector, top_k=settings.top_k_retrieval, paper_ids=session_paper_ids or None)

    if not hits:
        yield _sse({"type": "chunk", "text": "No relevant content found in your library for this query. Try uploading more papers or rephrasing your question."})
        yield _sse({"type": "done"})
        return

    # 2. Build context block
    context_parts = []
    source_map = {}   # source_label → {paper_id, title, page, text, score}
    for i, hit in enumerate(hits):
        label = f"[{i+1}]"
        p = hit.payload
        context_parts.append(
            f"{label} (Paper: \"{p['title']}\", {p.get('authors','')}, {p.get('year','')}, Page {p['page']}, Section: {p['section']})\n"
            f"{p['text']}"
        )
        source_map[label] = {
            "label": label,
            "paper_id": p["paper_id"],
            "title": p["title"],
            "authors": p.get("authors", ""),
            "year": p.get("year"),
            "page": p["page"],
            "section": p["section"],
            "text": p["text"][:300],
            "score": round(hit.score, 3),
        }

    context_block = "\n\n---\n\n".join(context_parts)

    # 3. Compute confidence from retrieval scores
    scores = [h.score for h in hits]
    confidence = round((sum(scores[:3]) / min(3, len(scores))) * 100, 1)

    # 4. Build system prompt
    system_prompt = f"""You are NEXUS, an elite AI research intelligence system embedded in the Underground Pay Research Platform.

You help researchers analyze academic papers, synthesize insights, identify research gaps, and write papers.

INSTRUCTIONS:
- Ground ALL claims in the provided source passages below
- Use citation labels like [1], [2], [3] referencing the numbered sources  
- If information isn't in the sources, say so rather than hallucinating
- Be precise, academic, and insightful
- Use **bold** for key terms and findings
- Structure long answers with clear headings

RETRIEVED SOURCE PASSAGES:
{context_block}

Cite sources inline as [1], [2], etc. when making claims."""

    # 5. Build messages (include recent chat history for context)
    recent_history = chat_history[-6:]  # last 3 turns
    messages = recent_history + [{"role": "user", "content": query}]

    # 6. Stream from Ollama
    client = get_ollama_client()
    full_text = ""
    try:
        async with await client.chat.completions.create(
            model=settings.ollama_model,
            max_tokens=2048,
            system=system_prompt,
            messages=messages,
            stream=True,
        ) as stream:
            async for chunk in stream:
                if chunk.choices[0].delta.content:
                    text = chunk.choices[0].delta.content
                    full_text += text
                    yield _sse({"type": "chunk", "text": text})
    except Exception as e:
        yield _sse({"type": "chunk", "text": f"\n\n⚠️ LLM error: {str(e)}"})

    # 7. Emit sources and confidence after streaming
    yield _sse({"type": "sources", "sources": list(source_map.values())})
    yield _sse({"type": "confidence", "score": confidence})
    yield _sse({"type": "done"})


# ──────────────────────────────────────────
# INSIGHTS ENGINE
# ──────────────────────────────────────────

async def generate_insights(paper_ids: list[str]) -> dict:
    """
    Sample diverse chunks from all papers and synthesize:
    - Key consensus points
    - Research gaps
    - Contradictions
    - Temporal trends
    """
    if not paper_ids:
        return {"error": "No papers in session"}

    # Sample representative chunks from across papers
    q_vector = await asyncio.get_event_loop().run_in_executor(
        None, lambda: embed_query("key findings methodology results contribution")
    )
    hits = search(q_vector, top_k=20, paper_ids=paper_ids)

    context = "\n\n".join([
        f"Paper: \"{h.payload['title']}\" ({h.payload.get('year','')}):\n{h.payload['text'][:500]}"
        for h in hits
    ])

    prompt = f"""Based on these excerpts from {len(paper_ids)} research papers, provide a structured research intelligence report.

EXCERPTS:
{context}

Provide a JSON response with exactly this structure:
{{
  "consensus": ["point 1", "point 2", "point 3"],
  "gaps": ["gap 1", "gap 2", "gap 3"],  
  "contradictions": ["contradiction 1", "contradiction 2"],
  "trends": ["trend 1", "trend 2"],
  "key_themes": ["theme 1", "theme 2", "theme 3", "theme 4", "theme 5"],
  "confidence_scores": {{
    "factual_accuracy": 0.0,
    "source_diversity": 0.0,
    "temporal_coverage": 0.0,
    "consensus_level": 0.0,
    "methodological_rigor": 0.0
  }}
}}

All confidence scores between 0 and 1. Be specific and grounded in the actual paper content."""

    client = get_ollama_client()
    response = await client.chat.completions.create(
        model=settings.ollama_model,
        max_tokens=1500,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.choices[0].message.content.strip()
    # Strip markdown code fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"raw": raw, "error": "Could not parse structured response"}


# ──────────────────────────────────────────
# PAPER WRITING ENGINE
# ──────────────────────────────────────────

SECTION_PROMPTS = {
    "abstract": "Write a concise academic abstract (150-250 words) for a research paper based on the provided literature. Include: motivation, approach, key findings, and significance.",
    "introduction": "Write an introduction section (600-900 words) that motivates the research problem, explains its significance, and ends with a clear statement of contributions.",
    "related_work": "Write a Related Work / Literature Review section (700-1000 words) that synthesizes prior work thematically, compares approaches, and clearly positions the gap this research addresses.",
    "methodology": "Write a Methodology section (800-1200 words) describing a novel research approach informed by gaps in the literature. Be specific about techniques, models, and evaluation strategies.",
    "results": "Write a Results section (600-900 words) describing expected experimental outcomes, evaluation metrics, and comparative analysis based on the research methodology.",
    "discussion": "Write a Discussion section (500-800 words) that interprets results in context of the literature, addresses limitations, and suggests future directions.",
    "conclusion": "Write a Conclusion (300-500 words) summarizing contributions, key takeaways, and broader impact.",
    "references": "Generate a References section listing the key cited works from the literature in IEEE/APA format.",
}


async def draft_section(
    section_type: str,
    paper_ids: list[str],
    paper_title: str = "",
    existing_sections: dict | None = None,
) -> str:
    """
    Draft a paper section using RAG context from the library.
    existing_sections provides already-written sections for coherence.
    """
    section_query_map = {
        "abstract": "key contribution methodology results findings",
        "introduction": "motivation problem statement research gap importance",
        "related_work": "prior work existing approaches comparison literature",
        "methodology": "method approach technique model architecture",
        "results": "evaluation experiment performance comparison benchmark",
        "discussion": "analysis interpretation limitation future work",
        "conclusion": "contribution summary impact significance",
        "references": "citations bibliography referenced works",
    }

    query = section_query_map.get(section_type, section_type)
    q_vector = await asyncio.get_event_loop().run_in_executor(None, lambda: embed_query(query))
    hits = search(q_vector, top_k=12, paper_ids=paper_ids)

    context = "\n\n".join([
        f"[{i+1}] \"{h.payload['title']}\" ({h.payload.get('year','')}, p.{h.payload['page']}):\n{h.payload['text']}"
        for i, h in enumerate(hits)
    ])

    section_instruction = SECTION_PROMPTS.get(section_type, f"Write the {section_type} section.")

    existing_context = ""
    if existing_sections:
        for sec, content in existing_sections.items():
            if content and sec != section_type:
                existing_context += f"\n\n## Already Written — {sec.title()}:\n{content[:600]}..."

    prompt = f"""You are writing a research paper titled: "{paper_title or 'Research Paper'}"

TASK: {section_instruction}

RELEVANT LITERATURE (cite as [1], [2], etc.):
{context}
{existing_context}

Write the section now. Use academic tone. Cite sources inline. Use **bold** for key terms."""

    client = get_ollama_client()
    response = await client.chat.completions.create(
        model=settings.ollama_model,
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.choices[0].message.content


# ──────────────────────────────────────────
# HELPERS
# ──────────────────────────────────────────

def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"
