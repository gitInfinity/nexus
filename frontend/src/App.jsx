// frontend/src/App.jsx
import { useState, useRef, useEffect, useCallback } from "react";
import { papersAPI, sessionsAPI, streamQuery, insightsAPI, writingAPI } from "./lib/api";

/* ─── tiny toast ──────────────────────── */
function useToast() {
  const [toasts, setToasts] = useState([]);
  const show = useCallback((msg, type = "info") => {
    const id = Date.now();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return { toasts, show };
}

/* ─── constants ───────────────────────── */
const SECTION_ORDER = ["abstract", "introduction", "related_work", "methodology", "results", "discussion", "conclusion", "references"];
const SECTION_LABELS = { abstract: "Abstract", introduction: "Introduction", related_work: "Related Work", methodology: "Methodology", results: "Results", discussion: "Discussion", conclusion: "Conclusion", references: "References" };
const SECTION_ICONS  = { abstract: "◌", introduction: "⬡", related_work: "◈", methodology: "⬢", results: "⧖", discussion: "⬟", conclusion: "◉", references: "⊕" };

const C = {
  void: "#040208", deep: "#0d0820", shadow: "#130d2e",
  purpleBright: "#4a1a8a", purpleGlow: "#6b2fa0", violet: "#8b3fd4", lilac: "#a855f7",
  blueElectric: "#2a4fd4", blueNeon: "#3b5ff5", blueIce: "#6680ff",
  accent: "#c026d3", silver: "#c8b8e8", ghost: "#8a7aaa", dim: "#6a5a8a", dimmer: "#4a3a6a",
  border: "rgba(107,47,160,0.2)", borderBright: "rgba(168,85,247,0.4)",
  green: "#4ade80", amber: "#f59e0b", pink: "#f472b6",
};

/* ─── helpers ────────────────────────── */
const statusColor = (s) => ({ indexed: C.green, processing: C.lilac, queued: C.amber, failed: C.pink }[s] || C.dim);
const pct = (n) => `${n}%`;

function renderMd(text) {
  return text.split("\n").map((line, i) => {
    const html = line
      .replace(/\*\*(.*?)\*\*/g, `<strong style="color:${C.lilac};font-weight:700">$1</strong>`)
      .replace(/\*(.*?)\*/g, `<em style="color:${C.ghost}">$1</em>`)
      .replace(/\[(\d+)\]/g, `<span style="color:${C.lilac};font-weight:700;cursor:pointer">[$1]</span>`)
      .replace(/^## (.+)$/, `<span style="font-family:'Cinzel',serif;font-size:13px;color:${C.silver};font-weight:600;display:block;margin-top:12px;margin-bottom:4px">$1</span>`)
      .replace(/^• /, `<span style="color:${C.purpleBright};margin-right:8px">◈</span>`);
    if (line.startsWith("---")) return <hr key={i} style={{ border: "none", borderTop: `1px solid ${C.border}`, margin: "10px 0" }} />;
    return <div key={i} style={{ marginBottom: line === "" ? 8 : 2, lineHeight: 1.72 }} dangerouslySetInnerHTML={{ __html: html }} />;
  });
}

/* ─── upload modal ───────────────────── */
function UploadModal({ onClose, onUploaded }) {
  const [dragging, setDragging] = useState(false);
  const [staged, setStaged] = useState([]);
  const [uploading, setUploading] = useState(false);

  const addFiles = (fs) => setStaged((p) => [...p, ...Array.from(fs)]);

  const handleUpload = async () => {
    if (!staged.length) return;
    setUploading(true);
    try {
      const res = await papersAPI.upload(staged);
      onUploaded(res.uploaded);
      onClose();
    } catch (e) {
      alert("Upload failed: " + e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(4,2,8,0.88)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: `linear-gradient(135deg,rgba(19,13,46,.99),rgba(7,4,16,.99))`, border: `1px solid ${C.borderBright}`, borderRadius: 18, padding: "clamp(20px,4vw,32px)", width: "100%", maxWidth: 520 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: "'Cinzel',serif", fontSize: 15, color: C.silver, letterSpacing: ".1em" }}>Ingest Research Papers</div>
            <div style={{ fontSize: 11, color: C.dimmer, marginTop: 3, letterSpacing: ".1em" }}>PDF · TXT — queued for background indexing</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(107,47,160,.15)", border: `1px solid ${C.border}`, borderRadius: 8, width: 32, height: 32, color: C.ghost, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
          onClick={() => document.getElementById("file-inp").click()}
          style={{ border: `2px dashed ${dragging ? C.borderBright : C.border}`, borderRadius: 12, padding: "32px 20px", textAlign: "center", background: dragging ? "rgba(107,47,160,.08)" : "transparent", transition: "all .25s", cursor: "pointer" }}
        >
          <div style={{ fontSize: 30, color: C.dimmer, marginBottom: 10 }}>◈</div>
          <div style={{ fontSize: 13, color: C.ghost, letterSpacing: ".05em" }}>Drop PDFs here or <span style={{ color: C.lilac }}>browse</span></div>
          <div style={{ fontSize: 10, color: C.dimmer, marginTop: 6, letterSpacing: ".08em" }}>Supports PDF · TXT</div>
          <input id="file-inp" type="file" multiple accept=".pdf,.txt" style={{ display: "none" }} onChange={(e) => addFiles(e.target.files)} />
        </div>
        {staged.length > 0 && (
          <div style={{ marginTop: 14, maxHeight: 160, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {staged.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(107,47,160,.08)", border: `1px solid ${C.border}`, borderRadius: 8 }}>
                <span style={{ fontSize: 16 }}>📄</span>
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{ fontSize: 12, color: C.silver, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{f.name}</div>
                  <div style={{ fontSize: 10, color: C.dimmer }}>{(f.size / 1024).toFixed(0)} KB</div>
                </div>
                <button onClick={() => setStaged((p) => p.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: C.dimmer, cursor: "pointer" }}>✕</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "10px 0", background: "rgba(13,8,32,.8)", border: `1px solid ${C.border}`, borderRadius: 10, color: C.dim, fontSize: 13, cursor: "pointer" }}>Cancel</button>
          <button onClick={handleUpload} disabled={!staged.length || uploading} style={{ flex: 2, padding: "10px 0", background: "linear-gradient(135deg,#4a1a8a,#2a4fd4)", border: "none", borderRadius: 10, color: "white", fontSize: 13, cursor: staged.length ? "pointer" : "not-allowed", fontWeight: 700, letterSpacing: ".1em", opacity: staged.length ? 1 : 0.5 }}>
            {uploading ? "Uploading…" : `◈ Start Indexing${staged.length ? ` (${staged.length})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── main app ───────────────────────── */
export default function App() {
  const { toasts, show: toast } = useToast();
  const [tab, setTab] = useState("chat");
  const [papers, setPapers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [messages, setMessages] = useState([{ id: "welcome", role: "assistant", content: "**NEXUS** is online.\n\nUpload research papers via the **⊕ Ingest** button, then ask me anything about them. I can:\n\n• **Synthesize** findings across all your papers\n• **Answer questions** with exact citations\n• **Find research gaps** and contradictions\n• **Draft sections** of your paper\n\nCreate or select a session to begin.", sources: [], timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }]);
  const [streaming, setStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [query, setQuery] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [insights, setInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [sections, setSections] = useState({});
  const [activeSection, setActiveSection] = useState("abstract");
  const [draftingSection, setDraftingSection] = useState(null);
  const [paperTitle, setPaperTitle] = useState("My Research Paper");
  const [paperSearch, setPaperSearch] = useState("");
  const [pollingIds, setPollingIds] = useState(new Set());
  const messagesEndRef = useRef(null);
  const pollRef = useRef(null);

  /* load initial data */
  useEffect(() => {
    loadPapers();
    loadSessions();
  }, []);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streamBuffer]);

  /* poll processing papers */
  useEffect(() => {
    const processing = papers.filter((p) => p.status === "queued" || p.status === "processing");
    if (!processing.length) { clearInterval(pollRef.current); return; }
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const fresh = await papersAPI.list();
      setPapers(fresh.papers);
      const stillProcessing = fresh.papers.filter((p) => p.status === "queued" || p.status === "processing");
      if (!stillProcessing.length) clearInterval(pollRef.current);
      // Notify when newly indexed
      fresh.papers.forEach((p) => {
        const old = papers.find((x) => x.id === p.id);
        if (old?.status !== "indexed" && p.status === "indexed") toast(`✓ "${p.title}" indexed`, "success");
        if (old?.status !== "failed" && p.status === "failed") toast(`✗ "${p.title}" failed`, "error");
      });
    }, 3000);
    return () => clearInterval(pollRef.current);
  }, [papers]);

  const loadPapers = async () => { try { const r = await papersAPI.list(); setPapers(r.papers); } catch (e) { toast("Backend offline — start uvicorn", "error"); } };
  const loadSessions = async () => { try { const r = await sessionsAPI.list(); setSessions(r.sessions); } catch { } };

  const loadSessionData = async (sessionId) => {
    try {
      const r = await sessionsAPI.get(sessionId);
      setCurrentSession(r.session);
      setMessages([{ id: "welcome", role: "assistant", content: `Session **${r.session.title}** loaded. ${r.session.paper_ids.length} papers in scope.`, sources: [], timestamp: "" }, ...r.messages.map((m) => ({ ...m, timestamp: new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }))]);
      // Load sections
      const secR = await writingAPI.getSections(sessionId);
      setSections(secR.sections || {});
    } catch (e) { toast("Failed to load session", "error"); }
  };

  const createSession = async () => {
    const title = prompt("Session title:", "Research Session");
    if (!title) return;
    const r = await sessionsAPI.create({ title, paper_ids: papers.filter((p) => p.status === "indexed").map((p) => p.id) });
    await loadSessions();
    await loadSessionData(r.session_id);
    toast(`Session "${title}" created`, "success");
  };

  const handleUploadDone = (uploaded) => {
    loadPapers();
    toast(`${uploaded.length} paper(s) queued for indexing`);
  };

  const handleSend = () => {
    if (!query.trim() || streaming) return;
    if (!currentSession) { toast("Create a session first", "error"); return; }

    const userMsg = { id: Date.now().toString(), role: "user", content: query, sources: [], timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
    const history = messages.filter((m) => m.role !== "welcome" && m.id !== "welcome").slice(-6).map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, userMsg]);
    const sentQuery = query;
    setQuery("");
    setStreaming(true);
    setStreamBuffer("");

    let accText = "";
    let accSources = [];
    let accConf = null;

    streamQuery(currentSession.id, sentQuery, history, {
      onChunk: (text) => { accText += text; setStreamBuffer((b) => b + text); },
      onSources: (sources) => { accSources = sources; },
      onConfidence: (score) => { accConf = score; },
      onDone: () => {
        setMessages((prev) => [...prev, { id: Date.now().toString(), role: "assistant", content: accText, sources: accSources, confidence: accConf, timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }]);
        setStreamBuffer("");
        setStreaming(false);
      },
      onError: (e) => { toast("Query failed: " + e.message, "error"); setStreaming(false); setStreamBuffer(""); },
    });
  };

  const loadInsights = async () => {
    if (!currentSession) { toast("Select a session first", "error"); return; }
    setInsightsLoading(true);
    try {
      const data = await insightsAPI.get(currentSession.id);
      setInsights(data);
    } catch (e) { toast("Insights failed: " + e.message, "error"); }
    setInsightsLoading(false);
  };

  const handleDraftSection = async (secType) => {
    if (!currentSession) { toast("Select a session first", "error"); return; }
    setDraftingSection(secType);
    try {
      const r = await writingAPI.draft(currentSession.id, secType, paperTitle);
      setSections((prev) => ({ ...prev, [secType]: { content: r.content, word_count: r.word_count, is_done: true } }));
      toast(`✓ ${SECTION_LABELS[secType]} drafted`);
    } catch (e) { toast("Draft failed: " + e.message, "error"); }
    setDraftingSection(null);
  };

  const handleSaveSection = async (secType, content) => {
    if (!currentSession) return;
    try {
      await writingAPI.saveSection(currentSession.id, secType, content);
      setSections((prev) => ({ ...prev, [secType]: { ...prev[secType], content, word_count: content.split(" ").length, is_done: content.length > 20 } }));
    } catch { }
  };

  const filteredPapers = papers.filter((p) => p.title.toLowerCase().includes(paperSearch.toLowerCase()) || (p.authors || "").toLowerCase().includes(paperSearch.toLowerCase()));

  /* ── styles ── */
  const s = {
    app: { display: "grid", gridTemplateRows: "56px 1fr", height: "100vh", background: C.void, color: C.silver, fontFamily: "'Rajdhani',sans-serif", position: "relative", zIndex: 1, overflow: "hidden" },
    header: { display: "flex", alignItems: "center", padding: "0 clamp(10px,2vw,20px)", gap: 12, background: "rgba(7,4,16,.96)", borderBottom: `1px solid ${C.border}`, backdropFilter: "blur(20px)", zIndex: 50, gridColumn: "1/-1", overflow: "hidden" },
    body: { display: "grid", gridTemplateColumns: `${sidebarOpen ? "clamp(180px,20vw,240px)" : "0px"} 1fr`, height: "100%", overflow: "hidden", transition: "grid-template-columns .3s ease" },
    sidebar: { background: "linear-gradient(180deg,rgba(13,8,32,.98),rgba(7,4,16,.99))", borderRight: `1px solid ${C.border}`, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", transition: "all .3s" },
    main: { display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 },
    btn: (active) => ({ padding: "6px 12px", background: active ? "rgba(107,47,160,.2)" : "transparent", border: `1px solid ${active ? C.borderBright : "transparent"}`, borderRadius: 7, color: active ? C.lilac : C.dimmer, fontSize: 11, letterSpacing: ".1em", cursor: "pointer", whiteSpace: "nowrap", fontWeight: 600, transition: "all .2s", fontFamily: "'Rajdhani',sans-serif" }),
    card: { padding: "14px 16px", background: "rgba(13,8,32,.8)", border: `1px solid ${C.border}`, borderRadius: 12, transition: "all .25s" },
    pill: (color) => ({ padding: "2px 8px", borderRadius: 4, background: `${color}18`, border: `1px solid ${color}40`, fontSize: 10, color, letterSpacing: ".08em" }),
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;900&family=Rajdhani:wght@300;400;500;600;700&display=swap');
        *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
        html,body,#root { height:100%; }
        body { overflow:hidden; }
        ::-webkit-scrollbar { width:3px; height:3px; }
        ::-webkit-scrollbar-track { background:rgba(13,8,32,.4); }
        ::-webkit-scrollbar-thumb { background:rgba(107,47,160,.35); border-radius:2px; }
        textarea,input,button { font-family:'Rajdhani',sans-serif; }
        textarea,input { background:none; border:none; outline:none; color:#c8b8e8; }
        textarea::placeholder,input::placeholder { color:#4a3a6a; }
        @keyframes dotPulse{0%,100%{opacity:.2;transform:scale(.7)}50%{opacity:1;transform:scale(1.2)}}
        @keyframes breathe{0%,100%{opacity:1}50%{opacity:.6}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes barGrow{from{width:0}to{}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes scanMove{0%{background-position:0 0}100%{background-position:0 100vh}}
        .fade-up{animation:fadeUp .3s ease forwards}
        .hover-row:hover{background:rgba(107,47,160,.07)!important}
        .hover-item:hover{background:rgba(107,47,160,.1)!important;transform:translateX(2px)}
        .hover-card:hover{border-color:rgba(168,85,247,.4)!important;transform:translateY(-2px)}
        .hover-btn:hover{border-color:rgba(168,85,247,.45)!important;color:#a855f7!important}
        @media(max-width:640px){
          .hide-mobile{display:none!important}
          .header-tabs{overflow-x:auto;-webkit-overflow-scrolling:touch}
        }
      `}</style>

      {/* BG */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", background: `radial-gradient(ellipse 65% 55% at 15% 15%,rgba(74,26,138,.2) 0%,transparent 60%),radial-gradient(ellipse 55% 65% at 85% 85%,rgba(15,26,92,.25) 0%,transparent 60%)`, animation: "breathe 9s ease-in-out infinite" }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", backgroundImage: `linear-gradient(rgba(107,47,160,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(107,47,160,.03) 1px,transparent 1px)`, backgroundSize: "44px 44px" }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", background: "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.05) 2px,rgba(0,0,0,.05) 4px)", animation: "scanMove 14s linear infinite" }} />

      {/* Toasts */}
      <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 999, display: "flex", flexDirection: "column", gap: 8 }}>
        {toasts.map((t) => (
          <div key={t.id} className="fade-up" style={{ padding: "10px 16px", borderRadius: 10, background: t.type === "error" ? "rgba(244,63,94,.15)" : t.type === "success" ? "rgba(74,222,128,.12)" : "rgba(107,47,160,.18)", border: `1px solid ${t.type === "error" ? "rgba(244,63,94,.4)" : t.type === "success" ? "rgba(74,222,128,.35)" : C.borderBright}`, color: t.type === "error" ? "#f43f5e" : t.type === "success" ? C.green : C.lilac, fontSize: 12, letterSpacing: ".06em", backdropFilter: "blur(10px)", maxWidth: 320 }}>{t.msg}</div>
        ))}
      </div>

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onUploaded={handleUploadDone} />}

      <div style={s.app}>
        {/* HEADER */}
        <header style={s.header}>
          <button onClick={() => setSidebarOpen((o) => !o)} style={{ width: 32, height: 32, borderRadius: 7, background: "rgba(19,13,46,.8)", border: `1px solid ${C.border}`, color: C.ghost, cursor: "pointer", fontSize: 15, flexShrink: 0 }}>☰</button>
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontFamily: "'Cinzel',serif", fontSize: "clamp(11px,1.5vw,14px)", fontWeight: 900, letterSpacing: ".14em", background: "linear-gradient(90deg,#a855f7,#6680ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Underground Pay</div>
            <div style={{ fontSize: 8, color: C.dimmer, letterSpacing: ".2em" }}>NEXUS RESEARCH</div>
          </div>
          <div style={{ width: 1, height: 24, background: C.border, flexShrink: 0 }} />
          <div className="header-tabs" style={{ display: "flex", gap: 3, flex: "1 1 0", minWidth: 0, overflowX: "auto" }}>
            {[["chat", "◈ Chat"], ["library", "⬡ Library"], ["insights", "⧖ Insights"], ["write", "⬢ Write"]].map(([id, label]) => (
              <button key={id} style={s.btn(tab === id)} onClick={() => { setTab(id); if (id === "insights" && !insights) loadInsights(); if (id === "write" && currentSession) writingAPI.getSections(currentSession.id).then((r) => setSections(r.sections || {})); }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: "auto" }}>
            <span className="hide-mobile" style={{ fontSize: 10, color: C.dimmer, letterSpacing: ".1em", whiteSpace: "nowrap" }}>
              <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: papers.some((p) => p.status === "indexed") ? C.green : C.amber, boxShadow: `0 0 8px ${C.green}`, marginRight: 5, verticalAlign: "middle" }} />
              {papers.filter((p) => p.status === "indexed").length} indexed
            </span>
            <button onClick={() => setShowUpload(true)} className="hover-btn" style={{ padding: "6px 13px", background: "linear-gradient(135deg,rgba(74,26,138,.35),rgba(42,79,212,.35))", border: `1px solid rgba(168,85,247,.3)`, borderRadius: 8, color: C.lilac, fontSize: 11, cursor: "pointer", letterSpacing: ".1em", fontWeight: 700 }}>⊕ Ingest</button>
          </div>
        </header>

        <div style={s.body}>
          {/* SIDEBAR */}
          <aside style={s.sidebar}>
            <div style={{ padding: "14px 12px 8px" }}>
              <button onClick={createSession} style={{ width: "100%", padding: "8px 10px", background: "linear-gradient(135deg,rgba(74,26,138,.25),rgba(42,79,212,.25))", border: `1px solid rgba(168,85,247,.3)`, borderRadius: 9, color: C.lilac, fontSize: 11, letterSpacing: ".1em", fontWeight: 700, cursor: "pointer" }}>⊕ New Session</button>
            </div>
            <div style={{ fontSize: 9, letterSpacing: ".25em", color: C.dimmer, padding: "8px 12px 4px", textTransform: "uppercase" }}>Sessions</div>
            {sessions.map((s) => (
              <div key={s.id} className="hover-item" onClick={() => loadSessionData(s.id)} style={{ padding: "9px 12px", cursor: "pointer", borderLeft: `2px solid ${currentSession?.id === s.id ? C.lilac : "transparent"}`, background: currentSession?.id === s.id ? "rgba(107,47,160,.1)" : "transparent", transition: "all .2s" }}>
                <div style={{ fontSize: 11, color: currentSession?.id === s.id ? C.silver : C.ghost, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</div>
                <div style={{ fontSize: 9, color: C.dimmer, marginTop: 1 }}>{s.paper_ids.length} papers</div>
              </div>
            ))}
            <div style={{ fontSize: 9, letterSpacing: ".25em", color: C.dimmer, padding: "12px 12px 4px", textTransform: "uppercase" }}>Papers</div>
            {papers.slice(0, 6).map((p) => (
              <div key={p.id} className="hover-item" style={{ padding: "7px 12px", cursor: "pointer", transition: "all .2s" }} onClick={() => setTab("library")}>
                <div style={{ fontSize: 11, color: C.ghost, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>{p.title}</div>
                <div style={{ fontSize: 9, color: statusColor(p.status), marginTop: 1 }}>● {p.status.toUpperCase()}</div>
              </div>
            ))}
            {papers.length > 6 && <div style={{ fontSize: 10, color: C.violet, padding: "4px 12px", cursor: "pointer" }} onClick={() => setTab("library")}>+{papers.length - 6} more</div>}

            <div style={{ marginTop: "auto", padding: 12, borderTop: `1px solid ${C.border}` }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {[["Papers", papers.length], ["Indexed", papers.filter((p) => p.status === "indexed").length]].map(([l, v]) => (
                  <div key={l} style={{ padding: "8px 6px", background: "rgba(13,8,32,.7)", border: `1px solid ${C.border}`, borderRadius: 8, textAlign: "center" }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.lilac, fontFamily: "'Cinzel',serif" }}>{v}</div>
                    <div style={{ fontSize: 9, color: C.dimmer, letterSpacing: ".1em", textTransform: "uppercase" }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* MAIN */}
          <main style={s.main}>

            {/* ── CHAT ── */}
            {tab === "chat" && (
              <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
                <div style={{ flex: 1, overflowY: "auto", padding: "20px clamp(12px,4vw,28px)", display: "flex", flexDirection: "column", gap: 18 }}>
                  {messages.map((msg) => (
                    <div key={msg.id} className="fade-up" style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", gap: 10, alignItems: "flex-start" }}>
                      {msg.role === "assistant" && <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#4a1a8a,#1a2d8a)", border: `1px solid rgba(107,47,160,.4)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontFamily: "'Cinzel',serif", flexShrink: 0, boxShadow: "0 0 10px rgba(107,47,160,.3)" }}>Ψ</div>}
                      <div style={{ maxWidth: "min(74%,620px)" }}>
                        <div style={msg.role === "assistant" ? { background: "linear-gradient(135deg,rgba(19,13,46,.97),rgba(13,8,32,.99))", border: `1px solid ${C.border}`, borderRadius: "4px 14px 14px 14px", padding: "13px 16px", fontSize: 13, lineHeight: 1.7, letterSpacing: ".02em", boxShadow: "0 4px 20px rgba(0,0,0,.4)" } : { background: "linear-gradient(135deg,rgba(30,10,74,.88),rgba(15,26,92,.88))", border: `1px solid rgba(42,79,212,.22)`, borderRadius: "14px 4px 14px 14px", padding: "11px 15px", fontSize: 13, lineHeight: 1.65 }}>
                          {renderMd(msg.content)}
                          {msg.sources?.length > 0 && (
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
                              {msg.sources.map((src, i) => (
                                <span key={i} style={s.pill(C.lilac)}>{`◈ ${src.title?.slice(0, 30)}… p.${src.page}`}</span>
                              ))}
                              {msg.confidence && <span style={{ ...s.pill(C.green), marginLeft: "auto" }}>{msg.confidence}% confidence</span>}
                            </div>
                          )}
                        </div>
                        {msg.timestamp && <div style={{ fontSize: 9, color: C.dimmer, marginTop: 4, textAlign: msg.role === "user" ? "right" : "left", letterSpacing: ".1em" }}>{msg.role === "assistant" ? "NEXUS" : "You"} · {msg.timestamp}</div>}
                      </div>
                      {msg.role === "user" && <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#1e0a4a,#0f1a5c)", border: `1px solid rgba(42,79,212,.3)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Cinzel',serif", fontSize: 12, flexShrink: 0 }}>V</div>}
                    </div>
                  ))}
                  {streaming && streamBuffer && (
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#4a1a8a,#1a2d8a)", border: `1px solid rgba(107,47,160,.4)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontFamily: "'Cinzel',serif", flexShrink: 0, animation: "spin 2s linear infinite" }}>Ψ</div>
                      <div style={{ background: "linear-gradient(135deg,rgba(19,13,46,.97),rgba(13,8,32,.99))", border: `1px solid ${C.border}`, borderRadius: "4px 14px 14px 14px", padding: "13px 16px", fontSize: 13, lineHeight: 1.7, maxWidth: "min(74%,620px)" }}>
                        {renderMd(streamBuffer)}
                        <span style={{ display: "inline-block", width: 8, height: 14, background: C.lilac, marginLeft: 2, animation: "dotPulse 1s ease-in-out infinite", verticalAlign: "text-bottom" }} />
                      </div>
                    </div>
                  )}
                  {streaming && !streamBuffer && (
                    <div style={{ display: "flex", gap: 10 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#4a1a8a,#1a2d8a)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Cinzel',serif", flexShrink: 0, animation: "spin 2s linear infinite" }}>Ψ</div>
                      <div style={{ background: "rgba(19,13,46,.9)", border: `1px solid ${C.border}`, borderRadius: "4px 14px 14px 14px", padding: "12px 16px" }}>
                        <div style={{ fontSize: 9, color: C.dimmer, letterSpacing: ".2em", marginBottom: 6 }}>NEXUS RETRIEVING & SYNTHESIZING</div>
                        <div style={{ display: "flex", gap: 5 }}>{[0, 1, 2].map((i) => <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: C.lilac, animation: `dotPulse 1.4s ease-in-out ${i * 0.22}s infinite` }} />)}</div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div style={{ padding: "10px clamp(12px,4vw,24px) 14px", background: "rgba(7,4,16,.6)", borderTop: `1px solid ${C.border}`, backdropFilter: "blur(12px)" }}>
                  <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 10, paddingBottom: 2 }}>
                    {["Find all research gaps", "Summarize key findings", "What are the contradictions?", "Compare methodologies"].map((s) => (
                      <button key={s} onClick={() => setQuery(s)} className="hover-btn" style={{ padding: "4px 11px", borderRadius: 20, background: "rgba(19,13,46,.8)", border: `1px solid ${C.border}`, color: C.dimmer, fontSize: 10, letterSpacing: ".07em", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>{s}</button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                    <div style={{ flex: 1, background: "rgba(13,8,32,.9)", border: `1px solid rgba(107,47,160,.28)`, borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "flex-end", gap: 8 }}>
                      <span style={{ fontSize: 13, color: C.dimmer, paddingBottom: 2 }}>◈</span>
                      <textarea value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }} placeholder={currentSession ? "Ask about your research papers… (Enter to send)" : "Create a session first, then ask…"} rows={1} style={{ flex: 1, resize: "none", fontSize: 13, letterSpacing: ".03em", lineHeight: 1.5, maxHeight: 100 }} />
                    </div>
                    <button onClick={handleSend} disabled={!query.trim() || streaming} style={{ width: 42, height: 42, borderRadius: 10, background: "linear-gradient(135deg,#4a1a8a,#2a4fd4)", border: "none", cursor: query.trim() && !streaming ? "pointer" : "not-allowed", fontSize: 18, color: "white", flexShrink: 0, boxShadow: "0 0 16px rgba(107,47,160,.4)", opacity: query.trim() && !streaming ? 1 : 0.5 }}>↑</button>
                  </div>
                  {!currentSession && <div style={{ fontSize: 10, color: C.amber, marginTop: 6, letterSpacing: ".08em" }}>⚠ Create a session to enable RAG chat</div>}
                </div>
              </div>
            )}

            {/* ── LIBRARY ── */}
            {tab === "library" && (
              <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ padding: "14px clamp(12px,3vw,24px)", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ flex: "1 1 180px", background: "rgba(13,8,32,.9)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "7px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: C.dimmer }}>🔍</span>
                    <input value={paperSearch} onChange={(e) => setPaperSearch(e.target.value)} placeholder="Search papers, authors…" style={{ flex: 1, fontSize: 13 }} />
                  </div>
                  <button onClick={() => setShowUpload(true)} className="hover-btn" style={{ padding: "7px 16px", background: "linear-gradient(135deg,rgba(74,26,138,.3),rgba(42,79,212,.3))", border: `1px solid rgba(168,85,247,.3)`, borderRadius: 9, color: C.lilac, fontSize: 12, cursor: "pointer", fontWeight: 700 }}>⊕ Add Papers</button>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "14px clamp(12px,3vw,24px)", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,320px),1fr))", gap: 12, alignContent: "start" }}>
                  {filteredPapers.map((p) => (
                    <div key={p.id} className="hover-card fade-up" style={{ ...s.card, cursor: "pointer" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {(p.tags || []).slice(0, 3).map((t) => <span key={t} style={s.pill(C.ghost)}>{t}</span>)}
                        </div>
                        <span style={s.pill(statusColor(p.status))}>● {p.status}</span>
                      </div>
                      <div style={{ fontSize: 13, color: C.silver, fontWeight: 600, lineHeight: 1.4, marginBottom: 5 }}>{p.title}</div>
                      <div style={{ fontSize: 11, color: C.dimmer, marginBottom: 3 }}>{p.authors}{p.year ? ` · ${p.year}` : ""}</div>
                      {p.journal && <div style={{ fontSize: 10, color: C.dimmer, fontStyle: "italic", marginBottom: 8 }}>{p.journal}</div>}
                      {p.abstract && <div style={{ fontSize: 11, color: C.ghost, lineHeight: 1.6, marginBottom: 10, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>{p.abstract.slice(0, 220)}{p.abstract.length > 220 ? "…" : ""}</div>}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                        <div style={{ flex: 1, marginRight: 12 }}>
                          <div style={{ height: 3, borderRadius: 2, background: "rgba(107,47,160,.1)" }}>
                            <div style={{ height: "100%", width: pct(p.status === "indexed" ? 100 : p.status === "processing" ? 50 : 20), borderRadius: 2, background: `linear-gradient(90deg,${C.violet},${C.blueElectric})`, transition: "width .8s ease" }} />
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          {p.pages > 0 && <span style={{ fontSize: 10, color: C.dimmer }}>{p.pages}p</span>}
                          {p.total_chunks > 0 && <span style={{ fontSize: 10, color: C.dimmer }}>{p.total_chunks} chunks</span>}
                        </div>
                      </div>
                      {p.error_message && <div style={{ fontSize: 10, color: C.pink, marginTop: 6, padding: "6px 8px", background: "rgba(244,63,94,.08)", borderRadius: 6 }}>Error: {p.error_message}</div>}
                      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                        <button onClick={() => { setQuery(`Summarize: "${p.title}"`); setTab("chat"); }} style={{ flex: 1, padding: "6px 0", background: "rgba(107,47,160,.15)", border: `1px solid rgba(168,85,247,.25)`, borderRadius: 7, color: C.lilac, fontSize: 10, cursor: "pointer" }}>Summarize</button>
                        <button onClick={() => papersAPI.delete(p.id).then(() => { loadPapers(); toast("Paper deleted"); })} style={{ padding: "6px 10px", background: "rgba(244,63,94,.08)", border: `1px solid rgba(244,63,94,.2)`, borderRadius: 7, color: C.pink, fontSize: 10, cursor: "pointer" }}>✕</button>
                      </div>
                    </div>
                  ))}
                  {!filteredPapers.length && (
                    <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "60px 20px", color: C.dimmer }}>
                      <div style={{ fontSize: 28, marginBottom: 12 }}>◈</div>
                      <div style={{ fontSize: 14 }}>{papers.length ? "No papers match your search" : "No papers yet"}</div>
                      <button onClick={() => setShowUpload(true)} style={{ marginTop: 14, padding: "8px 20px", background: "linear-gradient(135deg,rgba(74,26,138,.3),rgba(42,79,212,.3))", border: `1px solid rgba(168,85,247,.3)`, borderRadius: 8, color: C.lilac, fontSize: 12, cursor: "pointer" }}>⊕ Upload Papers</button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── INSIGHTS ── */}
            {tab === "insights" && (
              <div style={{ height: "100%", overflowY: "auto", padding: "20px clamp(12px,4vw,28px)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <div style={{ fontFamily: "'Cinzel',serif", fontSize: 16, color: C.silver, letterSpacing: ".08em" }}>Research Intelligence Report</div>
                    <div style={{ fontSize: 11, color: C.dimmer, marginTop: 3, letterSpacing: ".1em" }}>Auto-synthesized from {papers.filter((p) => p.status === "indexed").length} indexed papers</div>
                  </div>
                  <button onClick={loadInsights} className="hover-btn" style={{ padding: "8px 16px", background: "linear-gradient(135deg,rgba(74,26,138,.3),rgba(42,79,212,.3))", border: `1px solid rgba(168,85,247,.3)`, borderRadius: 8, color: C.lilac, fontSize: 12, cursor: "pointer", fontWeight: 700 }}>{insightsLoading ? "Synthesizing…" : "⟳ Refresh"}</button>
                </div>

                {insightsLoading && (
                  <div style={{ textAlign: "center", padding: "60px 0", color: C.dimmer }}>
                    <div style={{ fontSize: 28, animation: "spin 2s linear infinite", display: "inline-block", marginBottom: 12 }}>Ψ</div>
                    <div>NEXUS synthesizing across {papers.filter((p) => p.status === "indexed").length} papers…</div>
                  </div>
                )}

                {!insightsLoading && insights && !insights.error && (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,250px),1fr))", gap: 14, marginBottom: 24 }}>
                      {[
                        { key: "consensus", label: "Key Consensus", color: C.green, icon: "◈" },
                        { key: "gaps", label: "Research Gaps", color: C.blueNeon, icon: "⬡" },
                        { key: "contradictions", label: "Contradictions", color: C.amber, icon: "⬢" },
                        { key: "trends", label: "Temporal Trends", color: C.accent, icon: "⧖" },
                      ].map(({ key, label, color, icon }) => (
                        insights[key]?.length > 0 && (
                          <div key={key} className="hover-card fade-up" style={{ padding: "16px", background: "rgba(13,8,32,.8)", border: `1px solid ${color}25`, borderRadius: 14, transition: "all .3s" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                              <span style={{ color, fontSize: 16 }}>{icon}</span>
                              <div style={{ fontSize: 12, fontWeight: 700, color, letterSpacing: ".08em" }}>{label}</div>
                            </div>
                            {insights[key].map((item, i) => (
                              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 7, fontSize: 12, color: C.ghost, lineHeight: 1.5 }}>
                                <span style={{ color, fontSize: 8, marginTop: 4, flexShrink: 0 }}>●</span>
                                {item}
                              </div>
                            ))}
                          </div>
                        )
                      ))}
                    </div>

                    {insights.confidence_scores && (
                      <div style={{ background: "rgba(13,8,32,.7)", border: `1px solid ${C.border}`, borderRadius: 16, padding: "20px", marginBottom: 20 }}>
                        <div style={{ fontFamily: "'Cinzel',serif", fontSize: 13, color: C.silver, letterSpacing: ".08em", marginBottom: 16 }}>Confidence Matrix</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
                          {Object.entries(insights.confidence_scores).map(([key, val]) => {
                            const pctVal = Math.round(val * 100);
                            const colors2 = [C.green, C.lilac, C.blueNeon, C.accent, C.blueIce];
                            const color2 = colors2[Object.keys(insights.confidence_scores).indexOf(key) % colors2.length];
                            return (
                              <div key={key}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                                  <div style={{ fontSize: 11, color: C.ghost }}>{key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</div>
                                  <div style={{ fontSize: 12, color: color2, fontWeight: 700 }}>{pctVal}%</div>
                                </div>
                                <div style={{ height: 4, borderRadius: 2, background: "rgba(107,47,160,.1)", overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: pct(pctVal), borderRadius: 2, background: color2, animation: "barGrow .9s ease" }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {insights.key_themes?.length > 0 && (
                      <div style={{ background: "rgba(13,8,32,.7)", border: `1px solid ${C.border}`, borderRadius: 16, padding: "20px" }}>
                        <div style={{ fontFamily: "'Cinzel',serif", fontSize: 13, color: C.silver, letterSpacing: ".08em", marginBottom: 14 }}>Key Themes</div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {insights.key_themes.map((t, i) => {
                            const themeColors = [C.lilac, C.blueIce, C.accent, C.green, C.amber];
                            return <span key={i} style={s.pill(themeColors[i % themeColors.length])}>{t}</span>;
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {!insightsLoading && !insights && (
                  <div style={{ textAlign: "center", padding: "60px 0", color: C.dimmer }}>
                    <div style={{ fontSize: 28, marginBottom: 12 }}>⧖</div>
                    <div style={{ marginBottom: 12 }}>Select a session and click Refresh to generate insights</div>
                  </div>
                )}
              </div>
            )}

            {/* ── WRITE PAPER ── */}
            {tab === "write" && (
              <div style={{ height: "100%", display: "flex", overflow: "hidden" }}>
                {/* Section list */}
                <div style={{ width: "clamp(150px,20%,210px)", borderRight: `1px solid ${C.border}`, overflowY: "auto", padding: "14px 0", flexShrink: 0 }}>
                  <div style={{ padding: "0 10px 6px" }}>
                    <input value={paperTitle} onChange={(e) => setPaperTitle(e.target.value)} placeholder="Paper title…" style={{ width: "100%", fontSize: 11, color: C.silver, background: "rgba(13,8,32,.7)", border: `1px solid ${C.border}`, borderRadius: 7, padding: "6px 8px", letterSpacing: ".03em" }} />
                  </div>
                  {SECTION_ORDER.map((secId) => {
                    const sec = sections[secId];
                    return (
                      <div key={secId} className="hover-item" onClick={() => setActiveSection(secId)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", cursor: "pointer", borderLeft: `2px solid ${activeSection === secId ? C.lilac : "transparent"}`, background: activeSection === secId ? "rgba(107,47,160,.1)" : "transparent", transition: "all .2s" }}>
                        <span style={{ color: activeSection === secId ? C.lilac : C.dimmer, fontSize: 13 }}>{SECTION_ICONS[secId]}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, color: activeSection === secId ? C.silver : C.ghost }}>{SECTION_LABELS[secId]}</div>
                          <div style={{ fontSize: 9, color: C.dimmer, marginTop: 1 }}>{sec?.is_done ? `${sec.word_count} words` : "Not started"}</div>
                        </div>
                        {sec?.is_done && <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, flexShrink: 0 }} />}
                      </div>
                    );
                  })}
                  <div style={{ padding: "12px 10px", borderTop: `1px solid ${C.border}`, marginTop: 6 }}>
                    <div style={{ height: 3, borderRadius: 2, background: "rgba(107,47,160,.1)", overflow: "hidden", marginBottom: 6 }}>
                      <div style={{ height: "100%", width: pct(Math.round((Object.values(sections).filter((s) => s?.is_done).length / SECTION_ORDER.length) * 100)), background: `linear-gradient(90deg,${C.violet},${C.blueElectric})`, borderRadius: 2 }} />
                    </div>
                    <div style={{ fontSize: 10, color: C.ghost }}>{Object.values(sections).filter((s) => s?.is_done).length}/{SECTION_ORDER.length} sections</div>
                    <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
                      <a href={currentSession ? writingAPI.exportPaper(currentSession.id, "docx") : "#"} target="_blank" style={{ flex: 1, padding: "5px 0", background: "rgba(42,79,212,.15)", border: `1px solid rgba(42,79,212,.3)`, borderRadius: 6, color: C.blueIce, fontSize: 9, textAlign: "center", letterSpacing: ".1em", textDecoration: "none", display: "block" }}>DOCX</a>
                      <a href={currentSession ? writingAPI.exportPaper(currentSession.id, "pdf") : "#"} target="_blank" style={{ flex: 1, padding: "5px 0", background: "rgba(107,47,160,.15)", border: `1px solid rgba(168,85,247,.3)`, borderRadius: 6, color: C.lilac, fontSize: 9, textAlign: "center", letterSpacing: ".1em", textDecoration: "none", display: "block" }}>PDF</a>
                    </div>
                  </div>
                </div>

                {/* Editor */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
                  <div style={{ padding: "10px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <div style={{ fontFamily: "'Cinzel',serif", fontSize: 13, color: C.silver, letterSpacing: ".08em" }}>{SECTION_LABELS[activeSection]}</div>
                      <div style={{ fontSize: 10, color: C.dimmer, marginTop: 2 }}>AI-assisted · Grounded in your library</div>
                    </div>
                    <button onClick={() => handleDraftSection(activeSection)} disabled={!currentSession || draftingSection === activeSection} className="hover-btn" style={{ padding: "6px 16px", background: "linear-gradient(135deg,rgba(74,26,138,.3),rgba(42,79,212,.3))", border: `1px solid rgba(168,85,247,.3)`, borderRadius: 8, color: C.lilac, fontSize: 11, cursor: currentSession && draftingSection !== activeSection ? "pointer" : "not-allowed", fontWeight: 700, opacity: !currentSession ? 0.5 : 1 }}>
                      {draftingSection === activeSection ? "⟳ Drafting…" : "⊕ AI Draft"}
                    </button>
                  </div>
                  {sections[activeSection]?.is_done ? (
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                      <textarea
                        value={sections[activeSection]?.content || ""}
                        onChange={(e) => setSections((prev) => ({ ...prev, [activeSection]: { ...prev[activeSection], content: e.target.value, word_count: e.target.value.split(" ").length } }))}
                        onBlur={(e) => handleSaveSection(activeSection, e.target.value)}
                        style={{ flex: 1, background: "transparent", border: "none", outline: "none", padding: "18px clamp(14px,4%,32px)", fontSize: 13, lineHeight: 1.8, color: C.silver, resize: "none", letterSpacing: ".02em" }}
                        placeholder={`Write your ${SECTION_LABELS[activeSection]} here…`}
                      />
                      <div style={{ padding: "8px 18px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 12, alignItems: "center", fontSize: 10, color: C.dimmer, letterSpacing: ".1em" }}>
                        <span>{sections[activeSection]?.word_count || 0} words</span>
                        <span>·</span>
                        <span>Saves on blur</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 24 }}>
                      <div style={{ fontSize: 28, color: C.dimmer }}>◈</div>
                      <div style={{ fontSize: 14, color: C.ghost, textAlign: "center" }}>This section is empty</div>
                      <div style={{ fontSize: 12, color: C.dimmer, textAlign: "center", maxWidth: 340, lineHeight: 1.6 }}>Click "AI Draft" to generate this section based on your {papers.filter((p) => p.status === "indexed").length} indexed papers.</div>
                      {!currentSession && <div style={{ fontSize: 11, color: C.amber }}>⚠ Create a session first</div>}
                    </div>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </>
  );
}
