"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/config";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { TrendingUp, Clock, ExternalLink, ShieldCheck, Activity } from "lucide-react";
import Navbar from "@/components/Navbar";

export default function TrendsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch(`${API_URL}/api/trends`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[#080808]">
      <Navbar />
      <div className="max-w-5xl mx-auto px-5 py-10 space-y-10">

        {/* Page header */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
          <h1 className="heading-xl text-white flex items-center gap-3">
            <TrendingUp className="w-7 h-7 text-blue-400" />
            Platform Trends
          </h1>
          <p className="text-zinc-500 text-[13px]">Most fact-checked domains and their credibility across all analyses.</p>
        </motion.div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-zinc-600">
            <Activity className="w-5 h-5 animate-pulse mr-3" /> Loading trends…
          </div>
        ) : (
          <div className="space-y-12">

            {/* Top domains */}
            <section className="space-y-4">
              <h2 className="heading-md text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Most Analyzed Domains
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {data?.trending_domains?.map((domain: any, i: number) => {
                  const scoreColor =
                    domain.avg_score >= 65 ? "text-emerald-400" :
                    domain.avg_score >= 35 ? "text-amber-400" : "text-red-400";
                  const accentColor =
                    domain.avg_score >= 65 ? "#10b981" :
                    domain.avg_score >= 35 ? "#f59e0b" : "#ef4444";
                  return (
                    <motion.div
                      key={domain.domain}
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.05 }}
                      className="surface-panel p-5 flex flex-col gap-4 hover:border-white/12 transition-colors"
                      style={{ borderLeft: `2px solid ${accentColor}22` }}
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div className="font-[600] text-white truncate text-[15px]">{domain.domain}</div>
                        <div className="bg-zinc-800 text-zinc-500 text-[11px] px-2 py-0.5 rounded font-[600] shrink-0">
                          {domain.count} reports
                        </div>
                      </div>
                      <div className="flex justify-between items-center pt-3 border-t border-zinc-900">
                        <span className="label-caps">Avg Score</span>
                        <span className={`text-2xl font-[800] tracking-tight ${scoreColor}`}>
                          {domain.avg_score.toFixed(0)}<span className="text-[13px] opacity-40">/100</span>
                        </span>
                      </div>
                    </motion.div>
                  );
                })}

                {(!data?.trending_domains || data.trending_domains.length === 0) && (
                  <div className="col-span-3 text-center py-14 text-zinc-600 text-[13px] border border-dashed border-zinc-800 rounded-xl">
                    Not enough data to show trends yet.
                  </div>
                )}
              </div>
            </section>

            {/* Recent activity */}
            <section className="space-y-4 pt-8 border-t border-zinc-900">
              <h2 className="heading-md text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-violet-400" />
                Live Analysis Feed
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {data?.recent_analyses?.map((report: any, i: number) => {
                  const scoreColor =
                    report.credibility_score >= 65 ? "text-emerald-400" :
                    report.credibility_score >= 35 ? "text-amber-400" : "text-red-400";
                  return (
                    <motion.div
                      key={report.report_id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      onClick={() => router.push(`/report/${report.report_id}`)}
                      className="surface-panel p-3.5 cursor-pointer hover:border-white/12 hover:bg-[#151515] transition-all group flex flex-col justify-between gap-3"
                    >
                      <div className="space-y-0.5">
                        <div className="text-[11px] text-zinc-600 truncate">{report.url}</div>
                        <div className="text-[13px] font-[500] text-white truncate">{report.domain}</div>
                      </div>
                      <div className="flex justify-between items-center pt-2.5 border-t border-zinc-900">
                        <span className={`text-[13px] font-[700] ${scoreColor}`}>{report.credibility_score.toFixed(0)}</span>
                        <ExternalLink className="w-3 h-3 text-zinc-700 group-hover:text-zinc-400 transition-colors" />
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
