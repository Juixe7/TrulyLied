"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { API_URL, WS_URL } from "@/lib/config";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Loader2, ShieldCheck, XCircle, AlertTriangle, CheckCircle2,
  HelpCircle, Clock, ExternalLink, ChevronDown, Link as LinkIcon,
  Send, Bot,
} from "lucide-react";
import CredibilityGauge from "@/components/CredibilityGauge";
import Navbar from "@/components/Navbar";

interface LiveChunk {
  chunk_id: string;
  text: string;
  verdict: string;
  confidence: number;
  citations: string[];
  reasoning: string;
  date_context: string;
  start_time: number;
  end_time: number;
  type?: string;
  status?: string;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function verdictStyle(verdict: string) {
  switch (verdict) {
    case "TRUE":       return { bg: "bg-emerald-500/10", border: "border-emerald-500/22", text: "text-emerald-400", glow: "" };
    case "FALSE":      return { bg: "bg-red-500/10",     border: "border-red-500/22",     text: "text-red-400",     glow: "" };
    case "MISLEADING": return { bg: "bg-amber-500/10",   border: "border-amber-500/22",   text: "text-amber-400",   glow: "" };
    default:           return { bg: "bg-zinc-800/50",    border: "border-zinc-700",       text: "text-zinc-500",    glow: "" };
  }
}

function VerdictIcon({ verdict }: { verdict: string }) {
  if (verdict === "PENDING" || !verdict)
    return <Loader2 className="w-4 h-4 text-zinc-600 animate-spin" />;
  switch (verdict) {
    case "TRUE":       return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    case "FALSE":      return <XCircle className="w-4 h-4 text-red-400" />;
    case "MISLEADING": return <AlertTriangle className="w-4 h-4 text-amber-400" />;
    default:           return <HelpCircle className="w-4 h-4 text-zinc-500" />;
  }
}

export default function LivePage() {
  const [url, setUrl] = useState("");
  const [reportId, setReportId] = useState("");
  const [videoId, setVideoId] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [chunks, setChunks] = useState<LiveChunk[]>([]);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [currentTime, setCurrentTime] = useState(0);
  const [activeOverlay, setActiveOverlay] = useState<LiveChunk | null>(null);
  const [expandedChunk, setExpandedChunk] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [reportData, setReportData] = useState<any>(null);
  const [chunkQueries, setChunkQueries] = useState<Record<string, { question: string; answer: string; loading: boolean }>>({});
  const [chunkInput, setChunkInput] = useState<Record<string, string>>({});
  const [leftWidth, setLeftWidth] = useState(65);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      if (pct > 30 && pct < 80) setLeftWidth(pct);
    };
    const handleMouseUp = () => setIsDragging(false);
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    } else {
      document.body.style.cursor = "default";
      document.body.style.userSelect = "auto";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  const extractVideoId = (u: string) => {
    const match = u.match(/(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
  };

  const handleStart = async () => {
    const vid = extractVideoId(url);
    if (!vid) { setError("Please enter a valid YouTube URL."); return; }
    setError("");
    setVideoId(vid);
    setLoading(true);
    setChunks([]);
    setStatus("starting");
    try {
      const res = await fetch(`${API_URL}/api/analyze-live`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error("Failed to start live analysis");
      const data = await res.json();
      setReportId(data.report_id);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!reportId) return;
    const ws = new WebSocket(`${WS_URL}/ws/report/${reportId}`);
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.status === "extracted" || msg.status === "decomposed") {
        setStatus("processing"); setLoading(false);
      } else if (msg.status === "chunk_pending" && msg.chunk) {
        setStatus("processing"); setLoading(false);
        if (msg.total_chunks) setProgress({ completed: 0, total: msg.total_chunks });
        setChunks(prev => {
          if (prev.find(c => c.chunk_id === msg.chunk.chunk_id)) return prev;
          return [...prev, msg.chunk].sort((a, b) => a.start_time - b.start_time);
        });
      } else if (msg.status === "chunk_done" && msg.chunk) {
        if (msg.total_chunks) setProgress({ completed: msg.completed_chunks || 0, total: msg.total_chunks });
        setChunks(prev => prev.map(c => c.chunk_id === msg.chunk.chunk_id ? msg.chunk : c));
      } else if (msg.status === "report_done") {
        setStatus("done");
        fetch(`${API_URL}/api/report/${reportId}`)
          .then(r => r.json())
          .then(data => { if (data.report) setReportData(data.report); });
      }
    };
    ws.onerror = () => setStatus("error");
    return () => ws.close();
  }, [reportId]);

  useEffect(() => {
    if (!videoId) return;
    // @ts-ignore
    if (window.YT?.Player) { initPlayer(); return; }
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
    // @ts-ignore
    window.onYouTubeIframeAPIReady = () => initPlayer();
  }, [videoId]);

  const initPlayer = () => {
    // @ts-ignore
    playerRef.current = new window.YT.Player("yt-player", {
      videoId, width: "100%", height: "100%",
      playerVars: { autoplay: 0, modestbranding: 1, rel: 0 },
    });
  };

  useEffect(() => {
    timerRef.current = setInterval(() => {
      if (playerRef.current?.getCurrentTime) setCurrentTime(playerRef.current.getCurrentTime());
    }, 500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  useEffect(() => {
    if (!chunks.length) return;
    const match = chunks.find(c => currentTime >= c.start_time && currentTime < c.end_time && c.verdict && c.verdict !== "PENDING");
    setActiveOverlay(match || null);
  }, [currentTime, chunks]);

  const seekTo = useCallback((time: number) => {
    if (playerRef.current?.seekTo) {
      playerRef.current.seekTo(time, true);
      playerRef.current.playVideo?.();
    }
  }, []);

  const liesCount = chunks.filter(c => c.verdict === "FALSE" || c.verdict === "MISLEADING").length;
  const trueCount = chunks.filter(c => c.verdict === "TRUE").length;

  return (
    <div className="min-h-screen bg-[#080808] flex flex-col">
      <Navbar />

      {/* Input screen */}
      {!videoId && (
        <div className="flex items-center justify-center flex-1 px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-xl space-y-6 text-center"
          >
            <div>
              <div className="inline-flex items-center gap-2 mb-6">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-400" />
                </span>
                <span className="text-red-400 text-[12px] font-[600] tracking-wide uppercase">Live Fact-Check</span>
              </div>
              <h1 className="heading-xl text-white mb-3">Live Video Fact-Checker</h1>
              <p className="text-zinc-500 text-[14px] max-w-sm mx-auto leading-relaxed">
                Paste a YouTube URL. We'll analyze the video's transcript and flag every lie — overlaid as it plays.
              </p>
            </div>

            <div className="flex gap-2">
              <div className="flex-1 relative">
                <LinkIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <input
                  type="url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleStart()}
                  placeholder="https://www.youtube.com/watch?v=…"
                  className="w-full bg-[#111] border border-white/9 text-white rounded-xl pl-10 pr-4 py-3 outline-none focus:border-white/18 transition-colors text-[13px]"
                />
              </div>
              <button
                onClick={handleStart}
                disabled={loading || !url}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white px-5 py-3 rounded-xl font-[650] transition-colors text-[13px] shrink-0"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Go Live
              </button>
            </div>

            {error && (
              <div className="bg-red-500/8 border border-red-500/18 text-red-400 p-3 rounded-xl text-[13px]">
                {error}
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* Main layout */}
      {videoId && (
        <div ref={containerRef} className="flex flex-col lg:flex-row flex-1 h-[calc(100vh-49px)]">

          {/* Left: Video */}
          <div
            style={{ width: typeof window !== "undefined" && window.innerWidth >= 1024 ? `${leftWidth}%` : "100%" }}
            className="flex flex-col relative shrink-0 lg:shrink"
          >
            <div className="relative w-full aspect-video bg-black">
              <div id="yt-player" className="absolute inset-0" />

              {/* Verdict overlay */}
              <AnimatePresence>
                {activeOverlay && (
                  <motion.div
                    key={activeOverlay.chunk_id}
                    initial={{ opacity: 0, y: 16, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                    className={`absolute bottom-4 left-4 right-4 p-3.5 rounded-xl border backdrop-blur-md
                      ${verdictStyle(activeOverlay.verdict).bg} ${verdictStyle(activeOverlay.verdict).border}`}
                  >
                    <div className="flex items-start gap-3">
                      <VerdictIcon verdict={activeOverlay.verdict} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[11px] font-[700] uppercase tracking-wider ${verdictStyle(activeOverlay.verdict).text}`}>
                            {activeOverlay.verdict === "FALSE" ? "Lie Detected" :
                             activeOverlay.verdict === "MISLEADING" ? "Misleading" :
                             activeOverlay.verdict === "TRUE" ? "Verified True" : "Unverified"}
                          </span>
                          <span className="text-[10px] text-zinc-500">{(activeOverlay.confidence * 100).toFixed(0)}%</span>
                        </div>
                        <p className="text-[13px] text-white/90 leading-relaxed line-clamp-2">"{activeOverlay.text}"</p>
                        {activeOverlay.reasoning && (
                          <p className="text-[11px] text-zinc-500 mt-1 line-clamp-1">{activeOverlay.reasoning}</p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Stats bar */}
            <div className="flex items-center gap-4 px-4 py-2.5 border-t border-zinc-900 bg-[#0d0d0d] shrink-0">
              {chunks.length > 0 ? (
                <>
                  <div className="flex items-center gap-1.5 text-[12px]">
                    <XCircle className="w-3.5 h-3.5 text-red-400" />
                    <span className="text-red-400 font-[600]">{liesCount}</span>
                    <span className="text-zinc-600">lies</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[12px]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-[600]">{trueCount}</span>
                    <span className="text-zinc-600">true</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[12px]">
                    <ShieldCheck className="w-3.5 h-3.5 text-zinc-500" />
                    <span className="text-zinc-400 font-[600]">{chunks.length}</span>
                    <span className="text-zinc-600">segments</span>
                  </div>
                  {status !== "done" && progress.total > 0 && (
                    <div className="flex-1 flex items-center gap-2 ml-2">
                      <div className="flex-1 h-[2px] bg-zinc-800 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-red-500 rounded-full"
                          animate={{ width: `${(progress.completed / progress.total) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-zinc-600">{progress.completed}/{progress.total}</span>
                    </div>
                  )}
                  {status === "done" && (
                    <span className="ml-auto label-caps text-emerald-400">✓ Scan complete</span>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2 text-[12px] text-zinc-600">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Fetching transcript…
                </div>
              )}
            </div>

            {/* Final report (when done) */}
            {status === "done" && reportData && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex-1 overflow-y-auto p-5 bg-[#080808] border-t border-zinc-900"
              >
                <div className="max-w-lg mx-auto space-y-5">
                  <div className="surface-panel p-6 flex flex-col items-center">
                    <p className="label-caps mb-5">Overall Credibility Score</p>
                    <CredibilityGauge score={reportData.credibility_score ?? 0} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="surface-panel p-5 flex flex-col items-center text-center">
                      <p className="label-caps mb-2">Claims Analysed</p>
                      <p className="text-3xl font-[800] text-white">{chunks.length}</p>
                    </div>
                    <div className="surface-panel p-5 flex flex-col items-center text-center">
                      <p className="label-caps mb-2">Claims Verified</p>
                      <p className="text-3xl font-[800] text-white">
                        {chunks.filter(c => Boolean(c.verdict && c.verdict !== "PENDING")).length}
                      </p>
                    </div>
                  </div>
                  {reportData.summary && (
                    <div className="bg-red-500/8 border border-red-500/18 p-5 rounded-xl">
                      <h3 className="text-red-400 text-[12px] font-[700] mb-3 flex items-center gap-2 uppercase tracking-wide">
                        <AlertTriangle className="w-3.5 h-3.5" /> Executive Summary
                      </h3>
                      <p className="text-[13px] text-red-200/80 leading-relaxed">{reportData.summary}</p>
                    </div>
                  )}
                  <div className="flex justify-center">
                    <button
                      onClick={() => router.push(`/report/${reportId}`)}
                      className="text-[12px] text-blue-400 hover:text-blue-300 font-[600] transition-colors flex items-center gap-1"
                    >
                      View Full Report <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          {/* Drag handle */}
          <div
            className={`hidden lg:flex w-1 hover:bg-violet-500/50 cursor-col-resize transition-colors items-center justify-center shrink-0 z-10 ${isDragging ? "bg-violet-500" : "bg-zinc-900"}`}
            onMouseDown={(e) => { e.preventDefault(); setIsDragging(true); }}
          />

          {/* Right: Timeline */}
          <div className="flex-1 flex flex-col bg-[#080808] min-w-0 border-l border-zinc-900 lg:border-none">
            <div className="px-4 py-3 border-b border-zinc-900 flex items-center gap-2 shrink-0">
              <ShieldCheck className="w-4 h-4 text-violet-400" />
              <span className="text-[13px] font-[600] text-white">Claim Timeline</span>
              <span className="label-caps ml-auto">click to jump</span>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {chunks.length === 0 && (
                <div className="text-center py-12 text-zinc-700 text-[13px]">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-3 text-zinc-800" />
                  Extracting and fact-checking claims…
                </div>
              )}

              {chunks.map((chunk) => {
                const s = verdictStyle(chunk.verdict);
                const isActive = currentTime >= chunk.start_time && currentTime < chunk.end_time;
                const isExpanded = expandedChunk === chunk.chunk_id;

                return (
                  <motion.div
                    key={chunk.chunk_id}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`rounded-xl border transition-all cursor-pointer ${s.bg} ${s.border} ${
                      isActive ? `ring-1 ring-violet-500/40` : ""
                    }`}
                  >
                    <div className="p-3 flex items-start gap-3" onClick={() => seekTo(chunk.start_time)}>
                      <div className="shrink-0 flex flex-col items-center gap-1 pt-0.5">
                        <span className="text-[10px] font-mono text-zinc-600 bg-black/30 px-1.5 py-0.5 rounded">
                          {formatTime(chunk.start_time)}
                        </span>
                        <VerdictIcon verdict={chunk.verdict} />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-[12px] text-white/80 leading-relaxed line-clamp-2">{chunk.text}</p>
                        <div className="flex items-center gap-2">
                          {chunk.verdict === "PENDING" ? (
                            <span className="text-[11px] text-zinc-600 italic">Fact-checking…</span>
                          ) : (
                            <>
                              <span className={`text-[10px] font-[700] uppercase tracking-wider ${s.text}`}>{chunk.verdict}</span>
                              {chunk.confidence > 0 && (
                                <span className="text-[10px] text-zinc-600">{(chunk.confidence * 100).toFixed(0)}%</span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setExpandedChunk(isExpanded ? null : chunk.chunk_id); }}
                        className="shrink-0 mt-1"
                      >
                        <ChevronDown className={`w-4 h-4 text-zinc-600 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      </button>
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3 pb-3 pt-1 border-t border-white/5 space-y-3">
                            {chunk.reasoning && (
                              <div>
                                <p className="label-caps mb-1">AI Reasoning</p>
                                <p className="text-[11px] text-zinc-400 leading-relaxed">{chunk.reasoning}</p>
                              </div>
                            )}
                            {chunk.citations?.length > 0 && (
                              <div>
                                <p className="label-caps mb-1">Evidence</p>
                                {chunk.citations.map((c, i) => (
                                  <a key={i} href={c} target="_blank" rel="noreferrer"
                                    className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 truncate">
                                    <ExternalLink className="w-3 h-3 shrink-0" />
                                    {(() => { try { return new URL(c).hostname; } catch { return c; } })()}
                                  </a>
                                ))}
                              </div>
                            )}

                            {/* Deep dive chat */}
                            <div className="pt-2 border-t border-white/5">
                              <p className="label-caps mb-2 flex items-center gap-1">
                                <Bot className="w-3 h-3" /> Deep Dive
                              </p>
                              {chunkQueries[chunk.chunk_id]?.answer && (
                                <div className="mb-2 bg-zinc-900/80 border border-white/8 rounded-lg p-3 text-[11px] text-zinc-300 leading-relaxed">
                                  <p className="font-[600] text-blue-400 mb-1">{chunkQueries[chunk.chunk_id].question}</p>
                                  {chunkQueries[chunk.chunk_id].answer}
                                </div>
                              )}
                              <form
                                onSubmit={async (e) => {
                                  e.preventDefault();
                                  const q = chunkInput[chunk.chunk_id];
                                  if (!q?.trim() || chunkQueries[chunk.chunk_id]?.loading) return;
                                  setChunkQueries(prev => ({ ...prev, [chunk.chunk_id]: { question: q, answer: "", loading: true } }));
                                  setChunkInput(prev => ({ ...prev, [chunk.chunk_id]: "" }));
                                  try {
                                    const ctx = `Segment: "${chunk.text}"\nVerdict: ${chunk.verdict}\nReasoning: ${chunk.reasoning}\nCitations: ${chunk.citations?.join(", ")}`;
                                    const res = await fetch(`${API_URL}/chat`, {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ question: q, context: ctx }),
                                    });
                                    const data = await res.json();
                                    setChunkQueries(prev => ({ ...prev, [chunk.chunk_id]: { question: q, answer: data.answer || "No response.", loading: false } }));
                                  } catch {
                                    setChunkQueries(prev => ({ ...prev, [chunk.chunk_id]: { question: q, answer: "Connection error.", loading: false } }));
                                  }
                                }}
                                className="relative flex items-center"
                              >
                                <input
                                  type="text"
                                  value={chunkInput[chunk.chunk_id] || ""}
                                  onChange={(e) => setChunkInput(prev => ({ ...prev, [chunk.chunk_id]: e.target.value }))}
                                  placeholder="Why is this wrong?"
                                  className="w-full bg-black/40 border border-white/8 rounded-lg pl-3 pr-8 py-2 text-[11px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/16 transition-all"
                                />
                                <button
                                  type="submit"
                                  disabled={!chunkInput[chunk.chunk_id]?.trim() || chunkQueries[chunk.chunk_id]?.loading}
                                  className="absolute right-1.5 p-1 text-zinc-500 hover:text-white disabled:opacity-40 transition-colors"
                                >
                                  {chunkQueries[chunk.chunk_id]?.loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                                </button>
                              </form>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
