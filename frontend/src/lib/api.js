// frontend/src/lib/api.js
const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

// ── Papers ──────────────────────────────
export const papersAPI = {
  upload: (files) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    return fetch(`${BASE}/papers/upload`, { method: "POST", body: form }).then((r) => r.json());
  },
  list: () => req("/papers"),
  get: (id) => req(`/papers/${id}`),
  delete: (id) => req(`/papers/${id}`, { method: "DELETE" }),
};

// ── Sessions ────────────────────────────
export const sessionsAPI = {
  create: (body) => req("/sessions", { method: "POST", body: JSON.stringify(body) }),
  list: () => req("/sessions"),
  get: (id) => req(`/sessions/${id}`),
  updatePapers: (id, paper_ids) => req(`/sessions/${id}/papers`, { method: "PUT", body: JSON.stringify({ paper_ids }) }),
};

// ── Chat (streaming SSE) ─────────────────
export function streamQuery(sessionId, query, history, { onChunk, onSources, onConfidence, onDone, onError }) {
  fetch(`${BASE}/sessions/${sessionId}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, history }),
  }).then(async (res) => {
    if (!res.ok) { onError(new Error("Query failed")); return; }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const payload = JSON.parse(line.slice(6));
          if (payload.type === "chunk") onChunk(payload.text);
          else if (payload.type === "sources") onSources(payload.sources);
          else if (payload.type === "confidence") onConfidence(payload.score);
          else if (payload.type === "done") onDone();
        } catch {}
      }
    }
  }).catch(onError);
}

// ── Insights ────────────────────────────
export const insightsAPI = {
  get: (sessionId) => req(`/sessions/${sessionId}/insights`),
};

// ── Writing ─────────────────────────────
export const writingAPI = {
  getSections: (sessionId) => req(`/sessions/${sessionId}/sections`),
  saveSection: (sessionId, type, content) => req(`/sessions/${sessionId}/sections/${type}`, { method: "PUT", body: JSON.stringify({ content }) }),
  draft: (sessionId, section_type, paper_title) => req(`/sessions/${sessionId}/draft`, { method: "POST", body: JSON.stringify({ section_type, paper_title }) }),
  exportPaper: (sessionId, fmt) => `${BASE}/sessions/${sessionId}/export/${fmt}`,
};
