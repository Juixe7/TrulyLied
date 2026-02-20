"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/config";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Clock, ExternalLink, ShieldCheck, CheckCircle2, XCircle, Loader2, Search, BarChart3 } from "lucide-react";
import Navbar from "@/components/Navbar";

interface Report {
  report_id: string;
  url: string;
  domain: string;
  status: string;
  credibility_score: number;
  fact_accuracy_pct: number;
  source_credibility: string;
  content_type: string;
  created_at: string;
  completed_at?: string;
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 65 ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" :
    score >= 35 ? "text-amber-400 bg-amber-500/10 border-amber-500/20" :
                  "text-red-400 bg-red-500/10 border-red-500/20";
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[12px] font-[600] shrink-0 ${color}`}>
      <ShieldCheck className="w-3 h-3" />
      {score.toFixed(0)}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "done") return (
    <span className="badge badge-pill bg-emerald-500/10 text-emerald-400 border border-emerald-500/18">
      <CheckCircle2 className="w-3 h-3" /> Done
    </span>
  );
  if (status === "failed") return (
    <span className="badge badge-pill bg-red-500/10 text-red-400 border border-red-500/18">
      <XCircle className="w-3 h-3" /> Failed
    </span>
  );
  return (
    <span className="badge badge-pill bg-zinc-800 text-zinc-400 border border-zinc-700">
      <Loader2 className="w-3 h-3 animate-spin" /> {status}
    </span>
  );
}

function formatTime(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function HistoryPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const router = useRouter();

  useEffect(() => {
    fetch(`${API_URL}/api/reports`)
      .then(r => r.json())
      .then(d => { setReports(d.reports || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = reports.filter(r =>
    r.url?.toLowerCase().includes(search.toLowerCase()) ||
    r.domain?.toLowerCase().includes(search.toLowerCase())
  );

  const done = reports.filter(r => r.status === "done");
  const avgScore = done.length > 0 ? done.reduce((a, r) => a + r.credibility_score, 0) / done.length : 0;

  return (
    <div className="min-h-screen bg-[#080808]">
      <Navbar />
      <div className="max-w-5xl mx-auto px-5 py-10 space-y-8">

        {/* Page header */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between mb-1">
            <h1 className="heading-xl text-white">Analysis History</h1>
            <button
              onClick={() => router.push("/")}
              className="text-[13px] text-zinc-500 hover:text-white transition-colors flex items-center gap-1.5"
            >
              + New Analysis
            </button>
          </div>
          <p className="text-zinc-500 text-[13px]">All URLs you've analyzed with TrulyLied</p>
        </motion.div>

        {/* Stats */}
        {!loading && reports.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-3 gap-3"
          >
            {[
              { value: reports.length, label: "Total analyses", color: "text-white" },
              { value: done.length, label: "Completed", color: "text-emerald-400" },
              { value: avgScore.toFixed(0), label: "Avg. score", color: avgScore >= 65 ? "text-emerald-400" : avgScore >= 35 ? "text-amber-400" : "text-red-400" },
            ].map(({ value, label, color }) => (
              <div key={label} className="surface-panel p-4 text-center">
                <div className={`text-2xl font-[800] ${color} tracking-tight`}>{value}</div>
                <div className="label-caps mt-1">{label}</div>
              </div>
            ))}
          </motion.div>
        )}

        {/* Search */}
        {reports.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
            <input
              type="text"
              placeholder="Search by domain or URL…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-[#111] border border-white/8 text-zinc-200 placeholder:text-zinc-600 rounded-xl pl-10 pr-4 py-3 outline-none focus:border-white/15 transition-colors text-[13px]"
            />
          </div>
        )}

        {/* Reports list */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-zinc-600">
            <Loader2 className="w-5 h-5 animate-spin mr-3" /> Loading history…
          </div>
        ) : filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20 border border-dashed border-zinc-800 rounded-2xl"
          >
            <BarChart3 className="w-10 h-10 text-zinc-700 mx-auto mb-4" />
            <p className="text-zinc-400 text-[15px] font-[500] mb-1">No analyses yet</p>
            <p className="text-zinc-600 text-[13px]">Go back and analyze your first URL.</p>
            <button
              onClick={() => router.push("/")}
              className="mt-6 bg-white text-black text-[13px] font-[650] px-5 py-2.5 rounded-xl hover:bg-zinc-100 transition-colors"
            >
              Start Analyzing
            </button>
          </motion.div>
        ) : (
          <div className="space-y-2">
            {filtered.map((report, i) => (
              <motion.div
                key={report.report_id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => router.push(`/report/${report.report_id}`)}
                className="surface-panel px-4 py-3.5 flex items-center gap-4 cursor-pointer hover:border-white/12 hover:bg-[#151515] transition-all group"
              >
                {report.status === "done"
                  ? <ScoreBadge score={report.credibility_score} />
                  : <StatusBadge status={report.status} />
                }
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-[500] text-[14px] truncate">{report.domain}</span>
                    <span className="text-[10px] bg-zinc-800/80 text-zinc-500 px-1.5 py-0.5 rounded capitalize shrink-0">
                      {report.content_type || "article"}
                    </span>
                  </div>
                  <p className="text-zinc-600 text-[12px] truncate mt-0.5">{report.url}</p>
                </div>
                <div className="text-right shrink-0 hidden md:block">
                  <p className="text-[11px] text-zinc-600">{formatTime(report.created_at)}</p>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-zinc-700 group-hover:text-zinc-400 transition-colors shrink-0" />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
