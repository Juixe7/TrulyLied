"use client";

import { useState, useEffect, Suspense } from "react";
import { API_URL, WS_URL } from "@/lib/config";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, ArrowRightLeft, Link as LinkIcon, CheckCircle2, ExternalLink } from "lucide-react";
import CredibilityGauge from "@/components/CredibilityGauge";
import Navbar from "@/components/Navbar";

function CompareContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [url1, setUrl1] = useState(searchParams.get("url1") || "");
  const [url2, setUrl2] = useState(searchParams.get("url2") || "");
  const [report1Id, setReport1Id] = useState("");
  const [report2Id, setReport2Id] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCompare = async () => {
    if (!url1 || !url2) { setError("Please enter both URLs."); return; }
    setError("");
    setLoading(true);
    try {
      const [res1, res2] = await Promise.all([
        fetch(`${API_URL}/api/analyze`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url1 }),
        }),
        fetch(`${API_URL}/api/analyze`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url2 }),
        }),
      ]);
      if (!res1.ok || !res2.ok) throw new Error("Failed to start analysis for one or both URLs.");
      const [d1, d2] = await Promise.all([res1.json(), res2.json()]);
      setReport1Id(d1.report_id);
      setReport2Id(d2.report_id);
      const params = new URLSearchParams();
      params.set("url1", url1); params.set("url2", url2);
      router.replace(`/compare?${params.toString()}`);
    } catch (err: any) {
      setError(err.message || "An error occurred.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (searchParams.get("url1") && searchParams.get("url2") && !report1Id && !report2Id && !loading)
      handleCompare();
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-[#080808]">
      <Navbar />
      <div className="max-w-6xl mx-auto px-5 py-10 space-y-8">

        {/* Page header */}
        <div className="space-y-1">
          <h1 className="heading-xl text-white flex items-center gap-3">
            <ArrowRightLeft className="w-7 h-7 text-violet-400" />
            Source Comparison
          </h1>
          <p className="text-zinc-500 text-[13px]">Compare the credibility of two sources side-by-side.</p>
        </div>

        {/* Input form */}
        <div className="surface-panel p-5 flex flex-col md:flex-row gap-3 items-center">
          <div className="flex-1 w-full relative">
            <LinkIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
            <input
              type="url"
              placeholder="Source 1 URL…"
              value={url1}
              onChange={(e) => setUrl1(e.target.value)}
              className="w-full bg-[#161616] border border-white/8 text-white rounded-xl pl-10 pr-4 py-3 outline-none focus:border-white/16 transition-colors text-[13px]"
              disabled={loading || !!report1Id}
            />
          </div>

          <div className="shrink-0 bg-zinc-800 px-2.5 py-1 rounded text-[11px] font-[700] text-zinc-500 hidden md:block">
            VS
          </div>

          <div className="flex-1 w-full relative">
            <LinkIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
            <input
              type="url"
              placeholder="Source 2 URL…"
              value={url2}
              onChange={(e) => setUrl2(e.target.value)}
              className="w-full bg-[#161616] border border-white/8 text-white rounded-xl pl-10 pr-4 py-3 outline-none focus:border-white/16 transition-colors text-[13px]"
              disabled={loading || !!report2Id}
            />
          </div>

          <button
            onClick={handleCompare}
            disabled={loading || !!report1Id || !url1 || !url2}
            className="w-full md:w-auto flex items-center justify-center gap-2 bg-white text-black text-[13px] font-[650] px-6 py-3 rounded-xl hover:bg-zinc-100 active:bg-zinc-200 disabled:opacity-40 transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Compare"}
          </button>
        </div>

        {error && (
          <div className="bg-red-500/8 border border-red-500/18 text-red-400 p-4 rounded-xl text-[13px] text-center">
            {error}
          </div>
        )}

        {/* Results */}
        {(report1Id || report2Id) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-zinc-900 hidden md:block -translate-x-1/2" />
            <CompareColumn reportId={report1Id} label="Source 1" />
            <CompareColumn reportId={report2Id} label="Source 2" />
          </div>
        )}
      </div>
    </div>
  );
}

function CompareColumn({ reportId, label }: { reportId: string; label: string }) {
  const [reportData, setReportData] = useState<any>(null);
  const [status, setStatus] = useState("connecting");
  const [progress, setProgress] = useState({ completed: 0, total: 0 });

  useEffect(() => {
    if (!reportId) return;
    fetch(`${API_URL}/api/report/${reportId}`)
      .then(res => res.json())
      .then(data => {
        if (data.report) setReportData(data.report);
        if (data.report?.status === "done") setStatus("done");
        else setStatus(data.report?.status || "processing");
      })
      .catch(console.error);

    const ws = new WebSocket(`${WS_URL}/ws/report/${reportId}`);
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.status === "extracted" || msg.status === "decomposed") {
        setStatus(msg.status);
      } else if (msg.status === "chunk_done" && msg.chunk) {
        if (msg.total_chunks) { setProgress({ completed: msg.completed_chunks || 0, total: msg.total_chunks }); setStatus("processing"); }
      } else if (msg.status === "report_done") {
        setStatus("done");
        fetch(`${API_URL}/api/report/${reportId}`).then(r => r.json()).then(d => { if (d.report) setReportData(d.report); });
      }
    };
    return () => ws.close();
  }, [reportId]);

  if (!reportId) return null;

  const statusLabel: Record<string, string> = {
    connecting: "Connecting…", extracted: "Extracting…",
    decomposed: "Decomposing…", processing: "Fact-Checking…",
  };

  return (
    <div className="surface-panel p-6 flex flex-col space-y-5">
      <div className="text-center border-b border-zinc-900 pb-4">
        <p className="label-caps mb-2">{label}</p>
        {reportData ? (
          <a href={reportData.url} target="_blank" rel="noreferrer" className="text-[13px] text-blue-400 hover:underline truncate block">
            {reportData.domain}
          </a>
        ) : (
          <div className="h-4 bg-zinc-800 rounded w-1/2 mx-auto animate-pulse" />
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center min-h-[280px]">
        {status === "done" && reportData ? (
          <motion.div
            initial={{ scale: 0.88, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex flex-col items-center gap-4 w-full"
          >
            <CredibilityGauge score={reportData.credibility_score ?? 0} size={200} />

            <div className="w-full space-y-2 mt-3">
              {[
                { label: "Fact Accuracy", value: `${((reportData.fact_accuracy_pct ?? 0) * 100).toFixed(0)}%` },
                { label: "Speech Quality", value: `${((reportData.speech_quality_score ?? 0) * 100).toFixed(0)}%` },
                { label: "Source Credibility", value: reportData.source_credibility || "—", colored: true, raw: reportData.source_credibility },
              ].map(({ label, value, colored, raw }) => (
                <div key={label} className="flex justify-between items-center text-[13px] p-3 bg-[#161616] rounded-lg border border-white/6">
                  <span className="text-zinc-500">{label}</span>
                  <span className={`font-[600] uppercase ${
                    colored
                      ? raw === "high" ? "text-emerald-400" : raw === "low" ? "text-red-400" : "text-amber-400"
                      : "text-white"
                  }`}>{value}</span>
                </div>
              ))}
            </div>

            <a href={`/report/${reportId}`} target="_blank"
              className="text-[12px] text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-1">
              Full Report <ExternalLink className="w-3 h-3" />
            </a>
          </motion.div>
        ) : (
          <div className="flex flex-col items-center gap-4 w-full max-w-xs mx-auto text-center">
            <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
            <div className="text-[13px] font-[500] text-violet-400">{statusLabel[status] || status.toUpperCase()}</div>
            {status === "processing" && progress.total > 0 && (
              <div className="w-full space-y-2 mt-2">
                <div className="flex justify-between label-caps">
                  <span>Checking Claims</span>
                  <span>{progress.completed}/{progress.total}</span>
                </div>
                <div className="h-[2px] w-full bg-zinc-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-violet-500 rounded-full"
                    animate={{ width: `${(progress.completed / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#080808] flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-zinc-600" />
      </div>
    }>
      <CompareContent />
    </Suspense>
  );
}
