"use client";

import { useEffect, useState, use } from "react";
import { API_URL, WS_URL } from "@/lib/config";
import {
  CheckCircle2, XCircle, AlertTriangle, HelpCircle, Loader2,
  Link as LinkIcon, HeartPulse, Quote, AlertOctagon, ShieldCheck,
  Copy, Check, Clock, Ban, BadgeCheck, ExternalLink, X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import CredibilityGauge from "@/components/CredibilityGauge";
import Navbar from "@/components/Navbar";

export default function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const [reportData, setReportData] = useState<any>(null);
  const [chunks, setChunks] = useState<any[]>([]);
  const [status, setStatus] = useState("connecting");
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [copied, setCopied] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<any>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/report/${resolvedParams.id}`)
      .then(res => res.json())
      .then(data => {
        if (data.report) setReportData(data.report);
        if (data.chunks) setChunks(data.chunks);
        if (data.report?.status === "done") setStatus("done");
        else setStatus(data.report?.status || "processing");
      })
      .catch(console.error);

    const ws = new WebSocket(`${WS_URL}/ws/report/${resolvedParams.id}`);
    ws.onopen = () => console.log("WS Connected");
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.status === "extracted" || msg.status === "decomposed") {
        setStatus(msg.status);
      } else if (msg.status === "chunk_done" && msg.chunk) {
        if (msg.total_chunks) {
          setProgress({ completed: msg.completed_chunks || 0, total: msg.total_chunks });
          setStatus("processing");
        }
        setChunks(prev => {
          const exists = prev.find(c => c.chunk_id === msg.chunk.chunk_id);
          if (exists) return prev.map(c => c.chunk_id === msg.chunk.chunk_id ? msg.chunk : c);
          return [msg.chunk, ...prev];
        });
      } else if (msg.status === "report_done") {
        setStatus("done");
        fetch(`${API_URL}/api/report/${resolvedParams.id}`)
          .then(res => res.json())
          .then(data => { if (data.report) setReportData(data.report); });
      }
    };
    return () => ws.close();
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
                <h1 className="heading-lg text-white">Analysis Report</h1>
                {status !== "done" ? (
                  <span className="badge badge-pill bg-blue-500/12 text-blue-400 border border-blue-500/20">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {statusLabel[status] || status}
                  </span>
                ) : (
                  <span className="badge badge-pill bg-emerald-500/12 text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="w-3 h-3" /> Complete
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
                  <span className="truncate">{reportData.domain}{reportData.title && ` — ${reportData.title}`}</span>
                </a>
              )}

              <div className="flex items-center gap-2 mt-4">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 text-[12px] text-zinc-400 hover:text-white bg-white/5 hover:bg-white/8 border border-white/8 px-3 py-1.5 rounded-lg transition-all"
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
              {status === "done" && reportData && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  className="flex flex-col items-center gap-3"
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
              )}
            </AnimatePresence>
          </div>
        </header>

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
              {chunks.filter(c => c.type === "factual_claim").map(chunk => (
                <motion.div
                  key={chunk.chunk_id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => setSelectedClaim(chunk)}
                  className={`p-4 rounded-xl border cursor-pointer hover:opacity-90 transition-all ${getVerdictStyle(chunk.verdict)}`}
                >
                  <div className="flex gap-3 items-start">
                    <div className="mt-0.5 shrink-0">{getVerdictIcon(chunk.verdict)}</div>
                    <div className="flex-1 space-y-2.5 min-w-0">
                      <p className="text-zinc-200 leading-relaxed text-[13.5px]">"{chunk.text}"</p>
                      {chunk.verdict && chunk.verdict !== "ERROR" && (
                        <div className="flex flex-wrap gap-2 items-center">
                          <span className={`badge ${getVerdictBadgeStyle(chunk.verdict)}`}>{chunk.verdict}</span>
                          <span className="text-[12px] text-zinc-500">{(chunk.confidence * 100).toFixed(0)}% confidence</span>
                          {chunk.date_context && (
                            <span className="text-[12px] text-zinc-600 italic bg-black/20 px-2 py-0.5 rounded">
                              {chunk.date_context}
                            </span>
                          )}
                        </div>
                      )}
                      {chunk.citations?.length > 0 && (
                        <div className="pt-2.5 border-t border-white/5 space-y-1">
                          <p className="label-caps">Sources</p>
                          {chunk.citations.map((cite: string, i: number) => (
                            <a key={i} href={cite} target="_blank" rel="noreferrer"
                              className="text-[12px] text-blue-400 hover:text-blue-300 underline underline-offset-2 truncate block">
                              {cite}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {chunks.filter(c => c.type === "factual_claim").length === 0 && (
              <div className="p-10 text-center border border-dashed border-zinc-800 rounded-xl text-zinc-600 text-[13px]">
                <HelpCircle className="w-7 h-7 mx-auto mb-3 text-zinc-700" />
                {status === "done" ? "No factual claims detected in this content." : "Waiting for claims to be extracted…"}
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
                <div className="surface-panel px-4 py-5 text-zinc-600 text-[12px] text-center">
                  No opinion passages detected yet.
                </div>
              ) : (
                chunks.filter(c => c.type === "opinion").map(chunk => (
                  <div key={chunk.chunk_id} className="surface-panel p-4 space-y-2">
                    <Quote className="w-3.5 h-3.5 text-zinc-600" />
                    <p className="text-zinc-400 italic text-[12px] leading-relaxed line-clamp-4">"{chunk.text}"</p>
                    <div className="flex justify-end">
                      <span className={`badge ${
                        chunk.sentiment === "POSITIVE" ? "bg-emerald-500/12 text-emerald-400" :
                        chunk.sentiment === "NEGATIVE" ? "bg-red-500/12 text-red-400" :
                        "bg-zinc-800 text-zinc-400"
                      }`}>
                        {chunk.sentiment || "—"}
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
                <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/12 text-emerald-400 text-[12px] text-center">
                  ✓ No toxic speech detected.
                </div>
              ) : (
                chunks.filter(c => c.type === "toxic_passage").map(chunk => (
                  <div key={chunk.chunk_id} className={`p-4 rounded-xl border ${getVerdictStyle(chunk.verdict)} space-y-2`}>
                    <p className="text-zinc-300 text-[12px] line-clamp-3">"{chunk.text}"</p>
                    <div className="flex justify-between items-center pt-2 border-t border-white/5">
                      <span className="label-caps">{chunk.verdict}</span>
                      <span className="text-[11px] text-zinc-500">Score: {chunk.toxicity_score?.toFixed(2)}</span>
                    </div>
                  </div>
                ))
              )}
            </section>
          </div>
        </div>
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
