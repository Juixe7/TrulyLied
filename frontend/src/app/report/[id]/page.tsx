"use client";

import { useEffect, useState, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { API_URL, WS_URL } from "@/lib/config";
import {
  CheckCircle2, XCircle, AlertTriangle, HelpCircle, Loader2,
  Link as LinkIcon, HeartPulse, Quote, AlertOctagon, ShieldCheck,
  Copy, Check, Clock, Ban, BadgeCheck, ExternalLink, X,
  RotateCcw, Play, Sparkles, Send, MessageSquare, ChevronDown,
  ChevronUp, FileText, Compass, Layers
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import CredibilityGauge from "@/components/CredibilityGauge";
import Navbar from "@/components/Navbar";

export default function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [reportData, setReportData] = useState<any>(null);
  const [chunks, setChunks] = useState<any[]>([]);
  const [status, setStatus] = useState("connecting");
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [copied, setCopied] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<any>(null);
  const [retrying, setRetrying] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (status === "done" || status === "failed") return;
    const timer = setInterval(() => setElapsedSec(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, [status]);

  // ── Interactive AI Investigation Chat State ──
  const [chatQuery, setChatQuery] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<{ question: string; answer: string }[]>([]);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  const seekToTimestamp = (seconds: number) => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: "command", func: "seekTo", args: [seconds, true] }),
        "*"
      );
    }
  };

  const formatSeconds = (sec: number | null | undefined) => {
    if (sec == null || isNaN(sec)) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleRetry = async () => {
    if (!reportData?.url) return;
    setRetrying(true);
    try {
      const res = await fetch(`${API_URL}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: reportData.url }),
      });
      const data = await res.json();
      if (data.report_id) {
        router.push(`/report/${data.report_id}`);
      }
    } catch (e) {
      console.error("Retry failed:", e);
    } finally {
      setRetrying(false);
    }
  };

  const handleAskChat = async (presetQuestion?: string) => {
    const q = presetQuestion || chatQuery;
    if (!q.trim() || chatLoading) return;
    setChatLoading(true);
    if (!presetQuestion) setChatQuery("");

    const factual = chunks.filter(c => c.type === "factual_claim");
    const summaryCtx = factual.slice(0, 6).map(c => `Claim: "${c.text}" | Verdict: ${c.verdict} | Reasoning: ${c.reasoning}`).join("\n");
    const fullCtx = `Document Title: "${reportData?.title || 'Unknown'}"\nDomain: ${reportData?.domain}\nOverall Credibility Score: ${reportData?.credibility_score}\n${summaryCtx}`;

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, context: fullCtx }),
      });
      const data = await res.json();
      setChatHistory(prev => [{ question: q, answer: data.answer || "No response received." }, ...prev]);
    } catch (e) {
      setChatHistory(prev => [{ question: q, answer: "Connection error: unable to contact AI verification assistant." }, ...prev]);
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;

    const pollReport = async () => {
      try {
        const res = await fetch(`${API_URL}/api/report/${resolvedParams.id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted) return;
        if (data.report) {
          setReportData(data.report);
          const rStatus = data.report.status;
          if (rStatus === "done" || rStatus === "completed_with_warnings") {
            setStatus("done");
          } else if (rStatus === "failed") {
            setStatus("failed");
          } else if (rStatus) {
            setStatus(rStatus);
          }
        }
        if (data.chunks && data.chunks.length > 0) {
          setChunks(data.chunks);
          const completed = data.chunks.filter((c: any) => Boolean(c.verdict || c.sentiment)).length;
          setProgress({ completed, total: data.chunks.length });
        }
      } catch (err) {
        // silent polling catch
      }
    };

    // Immediate initial fetch
    pollReport();

    // Active 2.5s HTTP poll fallback ensures the UI never gets stranded on QUEUED
    const pollInterval = setInterval(() => {
      if (statusRef.current !== "done" && statusRef.current !== "failed") {
        pollReport();
      }
    }, 2500);

    const connectWs = () => {
      try {
        ws = new WebSocket(`${WS_URL}/ws/report/${resolvedParams.id}`);
        ws.onopen = () => console.log("[ws] Connected to TrulyLied telemetry stream");
        
        ws.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const msg = JSON.parse(event.data);
            if (msg.status === "sync_state") {
              if (msg.report) setReportData(msg.report);
              if (msg.chunks && msg.chunks.length > 0) {
                setChunks(msg.chunks);
              }
              if (msg.total_chunks) {
                setProgress({ completed: msg.completed_chunks || 0, total: msg.total_chunks });
              }
              if (msg.report?.status === "done" || msg.report?.status === "completed_with_warnings") {
                setStatus("done");
              } else if (msg.report?.status) {
                setStatus(msg.report.status);
              }
            } else if (msg.status === "extracted") {
              setStatus("extracted");
              setReportData((prev: any) => ({ ...prev, ...(msg.title && { title: msg.title }), ...(msg.domain && { domain: msg.domain }) }));
            } else if (msg.status === "decomposed") {
              setStatus("decomposed");
              if (msg.total_chunks) setProgress(p => ({ ...p, total: msg.total_chunks }));
            } else if (msg.status === "chunk_pending" && msg.chunk) {
              setChunks(prev => {
                if (prev.some(c => c.chunk_id === msg.chunk.chunk_id)) return prev;
                return [...prev, { ...msg.chunk, status: "pending" }];
              });
            } else if (msg.status === "chunk_done" && msg.chunk) {
              if (msg.total_chunks) {
                setProgress({ completed: msg.completed_chunks || 0, total: msg.total_chunks });
                setStatus("processing");
              }
              setChunks(prev => {
                const exists = prev.find(c => c.chunk_id === msg.chunk.chunk_id);
                if (exists) return prev.map(c => c.chunk_id === msg.chunk.chunk_id ? msg.chunk : c);
                return [...prev, msg.chunk];
              });
            } else if (msg.status === "error") {
              setStatus("failed");
              setReportData((prev: any) => ({ ...prev, status: "failed", error_msg: msg.error }));
            } else if (msg.status === "report_done") {
              setStatus("done");
              pollReport();
            }
          } catch (err) {
            console.error("[ws] Frame parse error:", err);
          }
        };

        ws.onclose = () => {
          if (!isMounted) return;
          console.log("[ws] Stream closed");
          if (statusRef.current !== "done" && statusRef.current !== "failed") {
            reconnectTimeout = setTimeout(connectWs, 3500);
          }
        };
      } catch (err) {
        console.warn("[ws] Connection init error:", err);
      }
    };

    connectWs();

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [resolvedParams.id]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getVerdictIcon = (verdict: string, size = "w-4 h-4") => {
    switch (verdict) {
      case "TRUE":       return <CheckCircle2 className={`${size} text-emerald-400`} />;
      case "FALSE":      return <XCircle className={`${size} text-red-400`} />;
      case "MISLEADING": return <AlertTriangle className={`${size} text-amber-400`} />;
      case "CLEAN":      return <CheckCircle2 className={`${size} text-emerald-400`} />;
      case "TOXIC":      return <AlertOctagon className={`${size} text-red-400`} />;
      default:           return <HelpCircle className={`${size} text-zinc-500`} />;
    }
  };

  const getVerdictStyle = (verdict: string) => {
    switch (verdict) {
      case "TRUE":       return "bg-emerald-500/8 border-emerald-500/18 text-emerald-400";
      case "FALSE":      return "bg-red-500/8 border-red-500/18 text-red-400";
      case "MISLEADING": return "bg-amber-500/8 border-amber-500/18 text-amber-400";
      case "CLEAN":      return "bg-emerald-500/5 border-emerald-500/10 text-emerald-400";
      case "TOXIC":      return "bg-red-500/8 border-red-500/18 text-red-400";
      default:           return "bg-zinc-800/50 border-zinc-700/50 text-zinc-500";
    }
  };

  const getVerdictBadgeStyle = (verdict: string) => {
    switch (verdict) {
      case "TRUE":       return "bg-emerald-500/12 text-emerald-400";
      case "FALSE":      return "bg-red-500/12 text-red-400";
      case "MISLEADING": return "bg-amber-500/12 text-amber-400";
      default:           return "bg-zinc-800 text-zinc-400";
    }
  };

  const statusLabel: Record<string, string> = {
    connecting: "Connecting…",
    extracted:  "Extracting content…",
    decomposed: "Decomposing claims…",
    processing: "Fact-checking…",
  };

  return (
    <div className="min-h-screen bg-[#080808]">
      <Navbar />

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 label-caps">
          <a href="/" className="hover:text-zinc-400 transition-colors">Home</a>
          <span className="text-zinc-700">/</span>
          <a href="/history" className="hover:text-zinc-400 transition-colors flex items-center gap-1">
            <Clock className="w-3 h-3" /> History
          </a>
          <span className="text-zinc-700">/</span>
          <span className="text-zinc-600 truncate max-w-[160px]">{resolvedParams.id.slice(0, 8)}…</span>
        </div>

        {/* Header */}
        <header className="surface-panel p-6">
          <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <h1 className="heading-lg text-white max-w-xl truncate" title={reportData?.title || "Analysis Report"}>
                  {reportData?.title || "Analysis Report"}
                </h1>
                {status === "failed" ? (
                  <span className="badge badge-pill bg-red-500/15 text-red-400 border border-red-500/30">
                    <XCircle className="w-3 h-3" /> Failed
                  </span>
                ) : status !== "done" ? (
                  <span className="badge badge-pill bg-blue-500/12 text-blue-400 border border-blue-500/20">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {statusLabel[status] || status}
                  </span>
                ) : (
                  <span className="badge badge-pill bg-emerald-500/12 text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="w-3 h-3" /> Complete
                  </span>
                )}
                {reportData?.completed_at && reportData?.created_at && (
                  <span className="text-[11px] font-mono text-zinc-400 bg-white/5 border border-white/8 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    ⚡ {Math.max(0.5, (new Date(reportData.completed_at).getTime() - new Date(reportData.created_at).getTime()) / 1000).toFixed(1)}s
                  </span>
                )}
              </div>

              {reportData && (
                <a
                  href={reportData.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-[13px] truncate max-w-full"
                >
                  <LinkIcon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{reportData.domain}{reportData.author && ` • by ${reportData.author}`}</span>
                </a>
              )}

              <div className="flex items-center gap-2 mt-4">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 text-[12px] text-zinc-400 hover:text-white bg-white/5 hover:bg-white/8 border border-white/8 px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                >
                  {copied
                    ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> Copied</>
                    : <><Copy className="w-3.5 h-3.5" /> Copy link</>
                  }
                </button>
                <a
                  href="/history"
                  className="flex items-center gap-1.5 text-[12px] text-zinc-400 hover:text-white bg-white/5 hover:bg-white/8 border border-white/8 px-3 py-1.5 rounded-lg transition-all"
                >
                  <Clock className="w-3.5 h-3.5" /> History
                </a>
              </div>
            </div>

            <AnimatePresence>
              {status === "done" && reportData ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  className="flex flex-col items-center gap-3 shrink-0"
                >
                  <CredibilityGauge score={reportData.credibility_score ?? 0} size={190} />
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] text-zinc-500">
                    <span>Accuracy: <span className="text-white font-[600]">{((reportData.fact_accuracy_pct ?? 0) * 100).toFixed(0)}%</span></span>
                    <span>Speech: <span className="text-white font-[600]">{((reportData.speech_quality_score ?? 0) * 100).toFixed(0)}%</span></span>
                    <span className="col-span-2">
                      Source:&nbsp;
                      <span className={`font-[700] ${
                        reportData.source_credibility === "high" ? "text-emerald-400" :
                        reportData.source_credibility === "low"  ? "text-red-400" : "text-amber-400"
                      }`}>
                        {reportData.source_credibility?.toUpperCase() ?? "—"}
                      </span>
                    </span>
                  </div>
                </motion.div>
              ) : status !== "failed" ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full md:w-[360px] p-4.5 rounded-2xl bg-white/[0.03] border border-violet-500/25 shadow-xl shadow-violet-500/5 space-y-3.5 shrink-0"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 font-semibold text-white">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-violet-500"></span>
                      </span>
                      Live Multi-Agent Pipeline
                    </div>
                    <span className="text-[11px] font-mono text-violet-300 bg-violet-500/10 px-2 py-0.5 rounded-full border border-violet-500/20">
                      ⏱ {elapsedSec}s elapsed
                    </span>
                  </div>

                  {/* 4 Step Progress Bars */}
                  <div className="grid grid-cols-4 gap-1.5 pt-1">
                    {[
                      { label: "1. Ingest", active: true, done: ["extracted", "decomposed", "processing"].includes(status) },
                      { label: "2. Claims", active: ["extracted", "decomposed", "processing"].includes(status), done: ["decomposed", "processing"].includes(status) },
                      { label: "3. Verify", active: ["decomposed", "processing"].includes(status), done: progress.completed > 0 && progress.completed === progress.total },
                      { label: "4. Score", active: false, done: false }
                    ].map((step, idx) => (
                      <div key={idx} className="space-y-1">
                        <div className={`h-1.5 rounded-full transition-all duration-500 ${
                          step.done
                            ? "bg-emerald-500"
                            : step.active
                            ? "bg-violet-500 animate-pulse"
                            : "bg-white/10"
                        }`} />
                        <p className={`text-[9.5px] text-center font-medium truncate ${
                          step.done ? "text-emerald-400" : step.active ? "text-violet-300" : "text-zinc-600"
                        }`}>
                          {step.label}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="text-[11.5px] text-zinc-300 text-center flex items-center justify-center gap-2 pt-1 bg-black/30 p-2 rounded-xl border border-white/5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400 shrink-0" />
                    <span className="truncate">
                      {status === "queued" || status === "connecting" ? "Queue active — Dispatching AI worker..." :
                       status === "extracted" ? "Media captured — Decomposing assertions..." :
                       status === "decomposed" ? `Claims decomposed (${progress.total || 'calculating'}) — Starting verification...` :
                       status === "processing" ? `Verifying claim ${progress.completed} of ${progress.total || '...'} via Google search...` :
                       "Processing telemetry stream..."}
                    </span>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </header>

        {/* Error Recovery Card */}
        {status === "failed" && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 rounded-2xl bg-gradient-to-r from-red-500/[0.09] via-rose-500/[0.05] to-zinc-900 border border-red-500/25 shadow-lg shadow-red-500/5 space-y-4"
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
                <AlertOctagon className="w-5 h-5 text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-semibold text-base">Extraction Interrupted</h3>
                <p className="text-[13.5px] text-zinc-300 mt-1 leading-relaxed">
                  {reportData?.error_msg || "The content extraction or transcript service experienced a temporary network timeout."}
                </p>
                <p className="text-[12px] text-zinc-400 mt-2 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                  YouTube's bot protection frequently blocks cloud hosting IPs. Paste the transcript directly below to verify instantly with zero network blocks!
                </p>
              </div>
            </div>

            <div className="flex items-center flex-wrap gap-3 pt-2">
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-semibold text-xs transition-all shadow-lg shadow-red-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {retrying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                Retry Analysis Now
              </button>
              <a
                href="/?tab=text"
                className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs transition-all flex items-center gap-1.5 shadow-lg shadow-violet-600/30 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                Paste Transcript Directly (Guaranteed Verification)
              </a>
              <a
                href="/"
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 text-xs transition-all"
              >
                Analyze Different URL
              </a>
            </div>
          </motion.div>
        )}

        {/* YouTube Video Player Embed with Timestamp Seeking */}
        {reportData?.content_type === "youtube" && (() => {
          const match = reportData.url?.match(/(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/);
          const videoId = match ? match[1] : null;
          if (!videoId) return null;
          return (
            <div className="surface-panel p-5 rounded-2xl overflow-hidden space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider font-semibold text-zinc-400 flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5 text-rose-400" /> Source YouTube Video
                </span>
                <span className="text-[11px] text-zinc-500">ID: {videoId} • Click timestamps below to seek</span>
              </div>
              <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black/60 border border-white/8 shadow-2xl">
                <iframe
                  ref={iframeRef}
                  src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&enablejsapi=1`}
                  title="YouTube video player"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full border-0"
                />
              </div>
            </div>
          );
        })()}

        {/* Author Bias & Source Profile Card */}
        {reportData?.author_bias && status === "done" && (
          <section className="glass-card p-5 rounded-2xl space-y-3 border border-white/8">
            <h2 className="heading-md text-white flex items-center gap-2">
              <Compass className="w-4 h-4 text-emerald-400" />
              Editorial & Author Profile
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/6">
                <p className="label-caps mb-1">Political Lean</p>
                <p className="text-white text-sm font-semibold capitalize">
                  {reportData.author_bias_meta?.political_lean || "Balanced / Non-Partisan"}
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/6">
                <p className="label-caps mb-1">Emotional Tone</p>
                <p className="text-white text-sm font-semibold capitalize">
                  {reportData.author_bias_meta?.emotional_tone || "Objective / Analytical"}
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/6">
                <p className="label-caps mb-1">Source Credibility Tier</p>
                <p className="text-white text-sm font-semibold uppercase">
                  {reportData.source_credibility || "Standard"}
                </p>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/12 text-xs text-zinc-300 leading-relaxed">
              {reportData.author_bias}
            </div>
          </section>
        )}

        {/* Collapsible Original Text / Transcript Section */}
        {reportData?.raw_text && (
          <section className="surface-panel p-5 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="heading-md text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-violet-400" />
                {reportData.content_type === "youtube" ? "Original Video Transcript" : "Extracted Content Body"}
                <span className="label-caps text-zinc-500 ml-1">
                  ({reportData.raw_text.split(/\s+/).length} words)
                </span>
              </h2>
              <button
                onClick={() => setShowTranscript(prev => !prev)}
                className="text-xs text-violet-300 hover:text-violet-200 font-medium px-3 py-1.5 rounded-lg bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {showTranscript ? <><ChevronUp className="w-3.5 h-3.5" /> Hide Text</> : <><ChevronDown className="w-3.5 h-3.5" /> Read Full Text</>}
              </button>
            </div>
            {showTranscript && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="p-4 rounded-xl bg-black/60 border border-white/8 max-h-96 overflow-y-auto text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap font-sans"
              >
                {reportData.raw_text}
              </motion.div>
            )}
          </section>
        )}

        {/* Progress bar */}
        {status === "processing" && progress.total > 0 && (
          <div className="surface-panel px-5 py-4 space-y-2">
            <div className="flex justify-between label-caps">
              <span>Analyzing claims</span>
              <span className="text-zinc-500">{progress.completed} / {progress.total}</span>
            </div>
            <div className="w-full bg-zinc-900 rounded-full h-[2px] overflow-hidden">
              <motion.div
                className="bg-violet-500 h-[2px] rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${(progress.completed / progress.total) * 100}%` }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
            </div>
            <p className="text-[11px] text-zinc-700 text-center">
              Running CRAG fact-check loop — this may take a few minutes
            </p>
          </div>
        )}

        {/* Verdict Summary */}
        {status === "done" && chunks.filter(c => c.type === "factual_claim").length > 0 && (() => {
          const factual  = chunks.filter(c => c.type === "factual_claim");
          const lies     = factual.filter(c => c.verdict === "FALSE" || c.verdict === "MISLEADING");
          const verified = factual.filter(c => c.verdict === "TRUE");
          const unclear  = factual.filter(c => c.verdict === "UNVERIFIABLE" || !c.verdict || c.verdict === "ERROR");
          return (
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="space-y-3"
            >
              <h2 className="heading-md text-white flex items-center gap-2">
                <ShieldCheck className="w-4.5 h-4.5 text-violet-400" />
                Fact-Check Summary
                <span className="label-caps ml-1">{factual.length} claim{factual.length !== 1 ? "s" : ""}</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

                {/* Lies */}
                <div className="rounded-xl border border-red-500/18 bg-red-500/5 flex flex-col overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-red-500/12 bg-red-500/8">
                    <Ban className="w-3.5 h-3.5 text-red-400" />
                    <span className="label-caps text-red-400">Lies / Untrusted</span>
                    <span className="ml-auto text-[11px] font-[700] bg-red-500/15 text-red-300 px-2 py-0.5 rounded">{lies.length}</span>
                  </div>
                  <div className="flex-1 p-3 space-y-3">
                    {lies.length === 0
                      ? <p className="text-[12px] text-zinc-600 text-center py-4">No false claims detected.</p>
                      : lies.map(c => (
                        <div key={c.chunk_id} className="space-y-2 cursor-pointer hover:bg-red-500/8 p-2 -mx-2 rounded-lg transition-colors" onClick={() => setSelectedClaim(c)}>
                          <div className="flex items-start gap-2">
                            <span className={`shrink-0 badge mt-0.5 ${c.verdict === "FALSE" ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"}`}>{c.verdict}</span>
                            <p className="text-[12px] text-zinc-300 leading-relaxed">{c.text}</p>
                          </div>
                          {c.citations?.length > 0 && (
                            <div className="pl-2 border-l-2 border-red-500/25 space-y-1">
                              <p className="label-caps">Proof</p>
                              {c.citations.slice(0, 2).map((cite: string, i: number) => (
                                <a key={i} href={cite} target="_blank" rel="noreferrer"
                                  className="flex items-center gap-1 text-[11px] text-red-400/70 hover:text-red-300 underline underline-offset-2 truncate">
                                  <ExternalLink className="w-3 h-3 shrink-0" />
                                  {(() => { try { return new URL(cite).hostname; } catch { return cite; } })()}
                                </a>
                              ))}
                            </div>
                          )}
                          <div className="border-t border-red-500/8" />
                        </div>
                      ))
                    }
                  </div>
                </div>

                {/* Verified */}
                <div className="rounded-xl border border-emerald-500/18 bg-emerald-500/5 flex flex-col overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-emerald-500/12 bg-emerald-500/8">
                    <BadgeCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="label-caps text-emerald-400">Verified & True</span>
                    <span className="ml-auto text-[11px] font-[700] bg-emerald-500/15 text-emerald-300 px-2 py-0.5 rounded">{verified.length}</span>
                  </div>
                  <div className="flex-1 p-3 space-y-3">
                    {verified.length === 0
                      ? <p className="text-[12px] text-zinc-600 text-center py-4">No verified true claims yet.</p>
                      : verified.map(c => (
                        <div key={c.chunk_id} className="space-y-2 cursor-pointer hover:bg-emerald-500/8 p-2 -mx-2 rounded-lg transition-colors" onClick={() => setSelectedClaim(c)}>
                          <p className="text-[12px] text-zinc-300 leading-relaxed">{c.text}</p>
                          {c.citations?.length > 0 && (
                            <div className="pl-2 border-l-2 border-emerald-500/25 space-y-1">
                              <p className="label-caps">Sources</p>
                              {c.citations.slice(0, 2).map((cite: string, i: number) => (
                                <a key={i} href={cite} target="_blank" rel="noreferrer"
                                  className="flex items-center gap-1 text-[11px] text-emerald-400/70 hover:text-emerald-300 underline underline-offset-2 truncate">
                                  <ExternalLink className="w-3 h-3 shrink-0" />
                                  {(() => { try { return new URL(cite).hostname; } catch { return cite; } })()}
                                </a>
                              ))}
                            </div>
                          )}
                          <div className="border-t border-emerald-500/8" />
                        </div>
                      ))
                    }
                  </div>
                </div>

                {/* Unverifiable */}
                <div className="rounded-xl border border-zinc-700/40 bg-zinc-800/20 flex flex-col overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-700/40 bg-zinc-800/40">
                    <HelpCircle className="w-3.5 h-3.5 text-zinc-500" />
                    <span className="label-caps text-zinc-500">Unverifiable</span>
                    <span className="ml-auto text-[11px] font-[700] bg-zinc-700 text-zinc-400 px-2 py-0.5 rounded">{unclear.length}</span>
                  </div>
                  <div className="flex-1 p-3 space-y-3">
                    {unclear.length === 0
                      ? <p className="text-[12px] text-zinc-600 text-center py-4">All claims were verifiable.</p>
                      : unclear.map(c => (
                        <div key={c.chunk_id} className="space-y-1 cursor-pointer hover:bg-zinc-700/25 p-2 -mx-2 rounded-lg transition-colors" onClick={() => setSelectedClaim(c)}>
                          <p className="text-[12px] text-zinc-500 leading-relaxed italic">{c.text}</p>
                          <p className="text-[11px] text-zinc-700">Insufficient evidence found online.</p>
                          <div className="border-t border-zinc-700/30" />
                        </div>
                      ))
                    }
                  </div>
                </div>

              </div>
            </motion.section>
          );
        })()}

        {/* Chunks grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Factual claims */}
          <div className="lg:col-span-2 space-y-3">
            <h2 className="heading-md text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-400" />
              Factual Claims Evaluated
              <span className="label-caps ml-1">({chunks.filter(c => c.type === "factual_claim").length})</span>
            </h2>

            <AnimatePresence>
              {chunks.filter(c => c.type === "factual_claim").map((chunk, idx) => {
                const isPending = chunk.status === "pending" || (!chunk.verdict && status !== "done");

                if (isPending) {
                  return (
                    <motion.div
                      key={chunk.chunk_id || idx}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 rounded-xl border border-violet-500/20 bg-violet-500/5 shimmer-pulse space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="badge bg-violet-500/15 text-violet-300 border border-violet-500/25 flex items-center gap-1.5 text-[11px]">
                          <Loader2 className="w-3 h-3 animate-spin text-violet-400" />
                          Decomposed • Verifying in CRAG DAG...
                        </span>
                        {chunk.start_time != null && (
                          <span className="text-[11px] font-mono text-zinc-500">
                            ⏱ {formatSeconds(chunk.start_time)}
                          </span>
                        )}
                      </div>
                      <p className="text-zinc-300 text-[13.5px] leading-relaxed italic">"{chunk.text}"</p>
                    </motion.div>
                  );
                }

                return (
                  <motion.div
                    key={chunk.chunk_id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => setSelectedClaim(chunk)}
                    className={`p-4 rounded-xl border cursor-pointer hover:opacity-95 transition-all ${getVerdictStyle(chunk.verdict)}`}
                  >
                    <div className="flex gap-3 items-start">
                      <div className="mt-0.5 shrink-0">{getVerdictIcon(chunk.verdict)}</div>
                      <div className="flex-1 space-y-2.5 min-w-0">
                        <p className="text-zinc-200 leading-relaxed text-[13.5px]">"{chunk.text}"</p>
                        
                        {chunk.verdict && chunk.verdict !== "ERROR" && (
                          <div className="flex flex-wrap gap-2 items-center">
                            <span className={`badge ${getVerdictBadgeStyle(chunk.verdict)}`}>{chunk.verdict}</span>
                            <span className="text-[12px] text-zinc-400 font-mono">
                              {(chunk.confidence * 100).toFixed(0)}% confidence
                            </span>
                            
                            {chunk.start_time != null && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  seekToTimestamp(chunk.start_time);
                                }}
                                className="inline-flex items-center gap-1 text-[11px] font-mono bg-violet-500/15 text-violet-300 border border-violet-500/25 px-2 py-0.5 rounded-full hover:bg-violet-500/30 transition-colors cursor-pointer"
                                title="Click to jump to this moment in video"
                              >
                                <Play className="w-2.5 h-2.5 fill-current" /> {formatSeconds(chunk.start_time)}
                              </button>
                            )}

                            {chunk.status === "degraded" && (
                              <span className="badge bg-amber-500/15 text-amber-300 border border-amber-500/25 text-[11px]">
                                ⚠️ Fallback
                              </span>
                            )}

                            {chunk.is_cached && (
                              <span className="badge bg-violet-500/15 text-violet-400 border border-violet-500/25 flex items-center gap-1 text-[11px]">
                                ⚡ Qdrant Cache Hit (&lt;50ms)
                              </span>
                            )}
                          </div>
                        )}

                        {/* Inline AI Reasoning Accordion */}
                        {chunk.reasoning && (
                          <details
                            className="mt-2 text-xs group"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <summary className="cursor-pointer text-violet-400 hover:text-violet-300 font-medium flex items-center gap-1 select-none py-1">
                              <span>💡 View AI Verification Rationale</span>
                            </summary>
                            <div className="mt-2 p-3 rounded-lg bg-black/40 border border-white/8 text-zinc-300 text-xs leading-relaxed space-y-2">
                              <p>{chunk.reasoning}</p>
                              {chunk.critic_notes && (
                                <div className="pt-2 border-t border-white/5 text-amber-300/80">
                                  <span className="font-semibold text-amber-400">⚖️ Red-Team Critic:</span> {chunk.critic_notes}
                                </div>
                              )}
                            </div>
                          </details>
                        )}

                        {chunk.citations?.length > 0 && (
                          <div className="pt-2.5 border-t border-white/5 space-y-1">
                            <p className="label-caps">Sources</p>
                            {chunk.citations.map((cite: string, i: number) => (
                              <a
                                key={i}
                                href={cite}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-[12px] text-blue-400 hover:text-blue-300 underline underline-offset-2 truncate block"
                              >
                                {cite}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {chunks.filter(c => c.type === "factual_claim").length === 0 && (
              <div className="p-10 text-center border border-dashed border-zinc-800 rounded-xl text-zinc-500 text-[13px] bg-zinc-950/40">
                {status === "done" ? (
                  <>
                    <HelpCircle className="w-7 h-7 mx-auto mb-3 text-zinc-700" />
                    <span>No factual claims detected in this content.</span>
                  </>
                ) : status === "failed" ? (
                  <>
                    <AlertTriangle className="w-7 h-7 mx-auto mb-3 text-rose-500/70" />
                    <span>Analysis could not complete claim extraction.</span>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
                    <span className="text-zinc-300 font-medium">Extracting and decomposing factual statements...</span>
                    <span className="text-zinc-500 text-xs">Claims will appear live as they are verified against web evidence</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sentiment + Toxicity */}
          <div className="space-y-6">

            {/* Opinions */}
            <section className="space-y-3">
              <h2 className="heading-md text-white flex items-center gap-2">
                <HeartPulse className="w-4 h-4 text-pink-400" />
                Sentiment & Tone
                <span className="label-caps ml-1">({chunks.filter(c => c.type === "opinion").length})</span>
              </h2>
              {chunks.filter(c => c.type === "opinion").length === 0 ? (
                <div className="surface-panel px-4 py-5 text-zinc-500 text-[12px] text-center">
                  {status === "done" ? (
                    "No opinion or subjective passages detected."
                  ) : status === "failed" ? (
                    "Sentiment analysis unavailable."
                  ) : (
                    <div className="flex items-center justify-center gap-2 text-zinc-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-pink-400" />
                      <span>Evaluating tone and subjective bias...</span>
                    </div>
                  )}
                </div>
              ) : (
                chunks.filter(c => c.type === "opinion").map(chunk => (
                  <div key={chunk.chunk_id} className="surface-panel p-4 space-y-2">
                    <Quote className="w-3.5 h-3.5 text-zinc-600" />
                    <p className="text-zinc-400 italic text-[12px] leading-relaxed line-clamp-4">"{chunk.text}"</p>
                    <div className="flex justify-between items-center pt-1 border-t border-white/5">
                      <span className="text-[11px] text-zinc-500">
                        {chunk.confidence ? `${(chunk.confidence * 100).toFixed(0)}% confidence` : "Tone analysis"}
                      </span>
                      <span className={`badge ${
                        chunk.sentiment === "POSITIVE" ? "bg-emerald-500/12 text-emerald-400" :
                        chunk.sentiment === "NEGATIVE" ? "bg-red-500/12 text-red-400" :
                        "bg-zinc-800 text-zinc-400"
                      }`}>
                        {chunk.sentiment || "NEUTRAL"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </section>

            {/* Toxicity */}
            <section className="space-y-3">
              <h2 className="heading-md text-white flex items-center gap-2">
                <AlertOctagon className="w-4 h-4 text-orange-400" />
                Toxic Content
                <span className="label-caps ml-1">({chunks.filter(c => c.type === "toxic_passage").length})</span>
              </h2>
              {chunks.filter(c => c.type === "toxic_passage").length === 0 ? (
                status === "done" ? (
                  <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/12 text-emerald-400 text-[12px] text-center">
                    ✓ No toxic speech detected.
                  </div>
                ) : status === "failed" ? (
                  <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 text-zinc-500 text-[12px] text-center">
                    Safety evaluation not available.
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/15 text-amber-400/80 text-[12px] text-center flex items-center justify-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                    <span>Scanning content for toxic passages & safety...</span>
                  </div>
                )
              ) : (
                chunks.filter(c => c.type === "toxic_passage").map(chunk => (
                  <div key={chunk.chunk_id} className={`p-4 rounded-xl border ${getVerdictStyle(chunk.verdict)} space-y-2`}>
                    <p className="text-zinc-300 text-[12px] line-clamp-3">"{chunk.text}"</p>
                    <div className="flex justify-between items-center pt-2 border-t border-white/5">
                      <span className="label-caps">{chunk.verdict || "CLEAN"}</span>
                      <span className="text-[11px] text-zinc-500 font-mono">
                        Score: {((chunk.toxicity_score || 0) * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))
              )}
            </section>
          </div>
        </div>

        {/* ── Interactive AI Fact-Checking Assistant ── */}
        <section className="glass-card p-6 rounded-2xl border border-violet-500/20 shadow-2xl shadow-violet-500/5 space-y-4 mt-8">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                  Interactive AI Investigation Assistant
                  <span className="badge bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 text-[10px]">
                    Live RAG
                  </span>
                </h3>
                <p className="text-[11.5px] text-zinc-400">Ask any deep-dive question grounded in this report and live web search</p>
              </div>
            </div>
            <span className="text-[11px] font-mono text-zinc-500 bg-white/5 px-2.5 py-1 rounded-lg border border-white/6">
              Groq LPU + Multi-Agent Grounding
            </span>
          </div>

          {/* Chat History / Output */}
          {chatHistory.length > 0 && (
            <div className="space-y-3 pt-2">
              {chatHistory.map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 rounded-xl bg-black/60 border border-violet-500/20 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between text-zinc-400 border-b border-white/5 pb-2">
                    <span className="font-semibold text-violet-300 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-violet-400" />
                      Q: {item.question}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">Grounded Answer</span>
                  </div>
                  <p className="text-zinc-200 leading-relaxed whitespace-pre-wrap">{item.answer}</p>
                </motion.div>
              ))}
            </div>
          )}

          {/* Preset Questions */}
          <div className="flex flex-wrap gap-2 pt-1">
            {[
              "Summarize the false claims and why they are wrong",
              "What are the most reliable sources on this topic?",
              "Explain the scientific or factual consensus",
            ].map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleAskChat(preset)}
                disabled={chatLoading}
                className="text-[11px] px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-violet-500/15 border border-white/8 hover:border-violet-500/30 text-zinc-300 hover:text-white transition-all cursor-pointer disabled:opacity-50"
              >
                💬 {preset}
              </button>
            ))}
          </div>

          {/* Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAskChat();
            }}
            className="flex gap-2 pt-1"
          >
            <input
              type="text"
              value={chatQuery}
              onChange={(e) => setChatQuery(e.target.value)}
              placeholder="Ask a question about this content or any specific claim..."
              disabled={chatLoading}
              className="flex-1 bg-black/60 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
            />
            <button
              type="submit"
              disabled={!chatQuery.trim() || chatLoading}
              className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
            >
              {chatLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Ask
            </button>
          </form>
        </section>
      </div>

      {/* Deep-Dive Modal */}
      <AnimatePresence>
        {selectedClaim && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
            onClick={() => setSelectedClaim(null)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#111] border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[88vh]"
            >
              {/* Modal header */}
              <div className={`px-5 py-4 border-b flex justify-between items-center ${
                selectedClaim.verdict === "TRUE"       ? "border-emerald-500/18 bg-emerald-500/5" :
                selectedClaim.verdict === "FALSE"      ? "border-red-500/18 bg-red-500/5" :
                selectedClaim.verdict === "MISLEADING" ? "border-amber-500/18 bg-amber-500/5" :
                "border-zinc-800 bg-zinc-800/20"
              }`}>
                <div className="flex items-center gap-3">
                  {getVerdictIcon(selectedClaim.verdict)}
                  <h3 className="font-[700] text-white text-[14px] tracking-wide">
                    {selectedClaim.verdict || "UNVERIFIABLE"}
                  </h3>
                  {selectedClaim.confidence && (
                    <span className="text-[12px] text-zinc-500">
                      {(selectedClaim.confidence * 100).toFixed(0)}% confidence
                    </span>
                  )}
                </div>
                <button onClick={() => setSelectedClaim(null)} className="text-zinc-500 hover:text-white transition-colors p-1">
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>

              {/* Modal body */}
              <div className="p-6 overflow-y-auto space-y-5">
                <div>
                  <p className="label-caps mb-2">The Claim</p>
                  <p className="text-[16px] text-white font-[500] leading-relaxed">"{selectedClaim.text}"</p>
                </div>

                {selectedClaim.reasoning && (
                  <div>
                    <p className="label-caps mb-2">AI Reasoning</p>
                    <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 text-zinc-300 text-[13px] leading-relaxed">
                      {selectedClaim.reasoning}
                    </div>
                  </div>
                )}

                {selectedClaim.critic_notes && (
                  <div>
                    <p className="label-caps mb-2 text-amber-400">Red-Team Critic Review</p>
                    <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/15 text-zinc-300 text-[13px] leading-relaxed">
                      {selectedClaim.critic_notes}
                    </div>
                  </div>
                )}

                {selectedClaim.date_context && (
                  <div>
                    <p className="label-caps mb-2">Context</p>
                    <p className="text-[13px] text-zinc-400 italic">{selectedClaim.date_context}</p>
                  </div>
                )}

                {selectedClaim.citations?.length > 0 && (
                  <div>
                    <p className="label-caps mb-2">Evidence & Sources</p>
                    <ul className="space-y-2">
                      {selectedClaim.citations.map((cite: string, i: number) => (
                        <li key={i}>
                          <a href={cite} target="_blank" rel="noreferrer"
                            className="flex items-center gap-2 p-3 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/60 transition-colors group">
                            <ExternalLink className="w-3.5 h-3.5 text-zinc-500 group-hover:text-white transition-colors shrink-0" />
                            <span className="text-[13px] text-blue-400 truncate group-hover:text-blue-300 transition-colors">{cite}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
