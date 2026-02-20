"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/config";
import {
  Search, Loader2, ShieldCheck, Zap, Activity,
  ArrowRight, CheckCircle2, Radio, TrendingUp, Globe, PlayCircle,
} from "lucide-react";
import { motion, useInView } from "framer-motion";
import Navbar from "@/components/Navbar";

/* ── Fade-in helper ──────────────────────────────────────────── */
function FadeIn({ children, delay = 0, className = "" }: {
  children: React.ReactNode; delay?: number; className?: string;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ── Stats bar data ──────────────────────────────────────────── */
const STATS = [
  { value: "10K+", label: "Articles analyzed" },
  { value: "98%",  label: "Claim accuracy" },
  { value: "3.2s", label: "Avg. analysis time" },
  { value: "42",   label: "Source categories" },
];

/* ── Feature data ────────────────────────────────────────────── */
const FEATURES = [
  {
    icon: <Zap className="w-5 h-5" />,
    color: "text-violet-400",
    ring: "ring-violet-500/20",
    bg: "bg-violet-500/10",
    badge: "bg-violet-500/12 text-violet-400",
    badgeLabel: "AI-Powered",
    title: "Claim Decomposition",
    desc: "Advanced LLMs precisely extract factual claims, editorial opinions, and toxic passages — separating signal from noise with surgical accuracy.",
    bullets: ["Factual vs. opinion classification", "Toxic speech flagging", "Real-time streaming output"],
  },
  {
    icon: <ShieldCheck className="w-5 h-5" />,
    color: "text-emerald-400",
    ring: "ring-emerald-500/20",
    bg: "bg-emerald-500/10",
    badge: "bg-emerald-500/12 text-emerald-400",
    badgeLabel: "CRAG Loop",
    title: "Self-Corrective Fact-Checking",
    desc: "Validates every claim against live Google Search data using a multi-step grading loop — automatically retrying when evidence is insufficient.",
    bullets: ["Live web search grounding", "Multi-hop verification", "Confidence scoring per claim"],
  },
  {
    icon: <Activity className="w-5 h-5" />,
    color: "text-blue-400",
    ring: "ring-blue-500/20",
    bg: "bg-blue-500/10",
    badge: "bg-blue-500/12 text-blue-400",
    badgeLabel: "Real-Time",
    title: "Live WebSocket Feed",
    desc: "Watch the analysis unfold claim by claim via WebSockets. No waiting for a full report — results stream in as each segment is processed.",
    bullets: ["Claim-by-claim streaming", "Live progress bar", "YouTube video support"],
  },
];

/* ── How it works steps ──────────────────────────────────────── */
const STEPS = [
  { n: "01", title: "Paste a URL", desc: "Drop any news article, blog post, or YouTube link into the analyzer." },
  { n: "02", title: "AI Extraction", desc: "Content is scraped and transcribed, then split into factual claims, opinions, and toxic passages." },
  { n: "03", title: "CRAG Verification", desc: "Each claim goes through a multi-step loop: search → grade → retry → verdict." },
  { n: "04", title: "Get your report", desc: "Receive a credibility score, per-claim verdicts, citations, and AI reasoning — all in seconds." },
];

/* ── Content type chips ──────────────────────────────────────── */
const CONTENT_TYPES = [
  { icon: <Globe className="w-3.5 h-3.5" />, label: "News Articles" },
  { icon: <Globe className="w-3.5 h-3.5" />, label: "Blog Posts" },
  { icon: <PlayCircle className="w-3.5 h-3.5" />, label: "YouTube Videos" },
  { icon: <Radio className="w-3.5 h-3.5" />, label: "Opinion Pieces" },
  { icon: <TrendingUp className="w-3.5 h-3.5" />, label: "Political Content" },
  { icon: <ShieldCheck className="w-3.5 h-3.5" />, label: "Fact Claims" },
];

/* ── Verdict preview cards (decorative) ─────────────────────── */
const PREVIEW_CARDS = [
  { verdict: "FALSE",      text: "\"The vaccine causes DNA alteration in all recipients.\"",                 color: "text-red-400",    bg: "bg-red-500/8",   border: "border-red-500/20", conf: "94% confidence" },
  { verdict: "TRUE",       text: "\"The global temperature rose by 1.1°C compared to pre-industrial levels.\"", color: "text-emerald-400", bg: "bg-emerald-500/8", border: "border-emerald-500/20", conf: "97% confidence" },
  { verdict: "MISLEADING", text: "\"Electric vehicles produce zero emissions.\"",                            color: "text-amber-400",  bg: "bg-amber-500/8", border: "border-amber-500/20", conf: "88% confidence" },
];

export default function LandingPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to analyze URL");
      router.push(`/report/${data.report_id}`);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080808] overflow-x-hidden">
      <Navbar />

      {/* ══════════════════════════════════════════════════
          HERO
      ══════════════════════════════════════════════════ */}
      <section className="relative px-5 pt-24 pb-32 max-w-6xl mx-auto">

        {/* Subtle radial glow — purely decorative */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] opacity-[0.07]"
          style={{ background: "radial-gradient(ellipse at center top, #7c3aed, transparent 70%)" }}
        />

        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10"
        >
          {/* Top badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-8 rounded-md bg-white/5 border border-white/8 text-[12px] font-[500] text-zinc-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Self-Corrective CRAG Fact-Checking
            <span className="text-zinc-700">·</span>
            <span className="text-violet-400">Powered by Groq</span>
          </div>

          {/* Headline */}
          <h1 className="mb-6 max-w-4xl font-[800] tracking-[-0.03em] leading-[1.1] text-white" style={{ fontSize: "clamp(1.625rem, 3.2vw, 2.5rem)" }}>
            Stop believing.<br />
            Start <span className="gradient-text">verifying.</span>
          </h1>

          {/* Sub-headline */}
          <p className="text-[1.125rem] leading-relaxed text-zinc-400 max-w-2xl mb-10 font-[400]">
            TrulyLied uses AI to dissect every factual claim in any article, blog, or YouTube video — 
            validating each one against live web evidence in real-time. Know what's true before you share it.
          </p>

          {/* Content type chips */}
          <div className="flex flex-wrap gap-2 mb-10">
            {CONTENT_TYPES.map(({ icon, label }) => (
              <span key={label} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/4 border border-white/7 text-[12px] text-zinc-500 font-[500]">
                {icon} {label}
              </span>
            ))}
          </div>

          {/* Search form */}
          <form onSubmit={handleAnalyze} className="w-full max-w-2xl">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center bg-transparent sm:bg-[#111] border-0 sm:border border-white/9 rounded-xl p-0 sm:p-1.5 focus-within:border-white/18 transition-colors gap-2 sm:gap-0">
              <div className="flex-1 flex items-center bg-[#111] sm:bg-transparent border border-white/9 sm:border-0 rounded-xl sm:rounded-none px-3 py-2.5 sm:p-0">
                <Search className="w-4 h-4 text-zinc-600 shrink-0" />
                <input
                  type="url"
                  required
                  placeholder="Paste a URL — news, YouTube, blogs…"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="flex-1 bg-transparent text-[14px] text-zinc-200 placeholder:text-zinc-600 px-3 outline-none min-w-0"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !url}
                className="flex items-center justify-center gap-2 bg-white text-black text-[13px] font-[650] px-5 py-3 sm:py-2.5 rounded-xl sm:rounded-[9px] hover:bg-zinc-100 transition-colors disabled:opacity-40 shrink-0 w-full sm:w-auto"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Analyze <ArrowRight className="w-4 h-4" /></>}
              </button>
            </div>
            {error && <p className="mt-3 text-[13px] text-red-400">{error}</p>}
          </form>

          {/* Trust hints */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-6 text-[12px] text-zinc-600">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Free to use</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> No sign-up required</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Results in seconds</span>
          </div>
        </motion.div>
      </section>

      {/* ══════════════════════════════════════════════════
          VERDICT PREVIEW (decorative mockup)
      ══════════════════════════════════════════════════ */}
      <section className="px-5 pb-24 max-w-6xl mx-auto">
        <FadeIn>
          <div className="surface-panel overflow-hidden">
            {/* Mock browser chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-900 bg-[#0d0d0d]">
              <div className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
              <div className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
              <div className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
              <div className="flex-1 mx-4 bg-zinc-900 rounded-md px-3 py-1 text-[11px] text-zinc-600">
                trulylied.ai/report/a1b2c3d4
              </div>
              <span className="badge badge-pill bg-emerald-500/12 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-3 h-3" /> Complete
              </span>
            </div>
            {/* Cards */}
            <div className="p-5 space-y-3">
              <p className="label-caps mb-4">Fact-Check Verdict Preview</p>
              {PREVIEW_CARDS.map((card, i) => (
                <motion.div
                  key={card.verdict}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  className={`flex items-start gap-4 p-4 rounded-xl border ${card.bg} ${card.border}`}
                >
                  <span className={`badge mt-0.5 ${card.bg} ${card.color} border ${card.border} shrink-0`}>{card.verdict}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-zinc-300 text-[13.5px] leading-relaxed">{card.text}</p>
                  </div>
                  <span className="text-[11px] text-zinc-600 shrink-0 hidden sm:block">{card.conf}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </FadeIn>
      </section>

      {/* ══════════════════════════════════════════════════
          STATS BAR
      ══════════════════════════════════════════════════ */}
      <section className="border-y border-zinc-900 bg-[#0a0a0a]">
        <div className="max-w-6xl mx-auto px-5 py-10 grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map(({ value, label }, i) => (
            <FadeIn key={label} delay={i * 0.08} className="text-center">
              <div className="text-3xl font-[800] text-white tracking-tight mb-1">{value}</div>
              <div className="label-caps">{label}</div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          FEATURES
      ══════════════════════════════════════════════════ */}
      <section className="px-5 py-28 max-w-6xl mx-auto space-y-16">
        <FadeIn className="max-w-2xl">
          <p className="label-caps text-violet-400 mb-4">How it works under the hood</p>
          <h2 className="heading-xl text-white mb-4">Three layers of truth-finding</h2>
          <p className="text-zinc-500 text-[15px] leading-relaxed">
            Every piece of content goes through a pipeline designed from the ground up for accuracy — 
            not just speed.
          </p>
        </FadeIn>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {FEATURES.map(({ icon, color, ring, bg, badge, badgeLabel, title, desc, bullets }, i) => (
            <FadeIn key={title} delay={i * 0.12}>
              <div className={`surface-panel p-6 h-full flex flex-col gap-5 ring-1 ${ring}`}>
                <div>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bg} ${color} mb-5`}>
                    {icon}
                  </div>
                  <span className={`badge mb-3 ${badge}`}>{badgeLabel}</span>
                  <h3 className="heading-md text-white mb-2.5">{title}</h3>
                  <p className="text-zinc-500 text-[13.5px] leading-relaxed">{desc}</p>
                </div>
                <ul className="mt-auto space-y-2">
                  {bullets.map(b => (
                    <li key={b} className="flex items-center gap-2 text-[12.5px] text-zinc-500">
                      <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${color}`} />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          HOW IT WORKS
      ══════════════════════════════════════════════════ */}
      <section className="border-t border-zinc-900 bg-[#0a0a0a] px-5 py-28">
        <div className="max-w-6xl mx-auto">
          <FadeIn className="max-w-2xl mb-16">
            <p className="label-caps text-blue-400 mb-4">Simple process</p>
            <h2 className="heading-xl text-white">From URL to truth in seconds</h2>
          </FadeIn>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {STEPS.map(({ n, title, desc }, i) => (
              <FadeIn key={n} delay={i * 0.1}>
                <div className="surface-panel p-5 flex flex-col gap-4 h-full">
                  <span className="text-[11px] font-[800] text-zinc-700 font-mono tracking-wider">{n}</span>
                  <div>
                    <h3 className="heading-md text-white mb-2">{title}</h3>
                    <p className="text-zinc-500 text-[13px] leading-relaxed">{desc}</p>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="mt-auto pt-3 border-t border-zinc-900">
                      <ArrowRight className="w-4 h-4 text-zinc-700" />
                    </div>
                  )}
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          LIVE MODE CTA BANNER
      ══════════════════════════════════════════════════ */}
      <FadeIn>
        <section className="px-5 py-10 max-w-6xl mx-auto">
          <div className="surface-panel p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 ring-1 ring-red-500/15 bg-red-500/4">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-400" />
                </span>
                <span className="label-caps text-red-400">New — Live Mode</span>
              </div>
              <h3 className="heading-lg text-white mb-2">Fact-check YouTube videos in real-time</h3>
              <p className="text-zinc-500 text-[13.5px] leading-relaxed max-w-xl">
                Watch any YouTube video while TrulyLied overlays verdicts directly on screen — claim by claim, 
                synced to the exact timestamp.
              </p>
            </div>
            <a
              href="/live"
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-[13px] font-[650] px-5 py-3 rounded-xl transition-colors shrink-0"
            >
              <Radio className="w-4 h-4" />
              Try Live Mode
            </a>
          </div>
        </section>
      </FadeIn>

      {/* ══════════════════════════════════════════════════
          FINAL CTA
      ══════════════════════════════════════════════════ */}
      <section className="px-5 py-32 max-w-6xl mx-auto text-center">
        <FadeIn>
          <h2 className="heading-hero mb-6">
            Don't share<br />
            <span className="gradient-text">until you know.</span>
          </h2>
          <p className="text-zinc-500 text-[15px] max-w-md mx-auto mb-10 leading-relaxed">
            One URL is all it takes. Paste any article, blog, or YouTube link below and get a credibility verdict in seconds.
          </p>

          <form onSubmit={handleAnalyze} className="w-full max-w-xl mx-auto">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center bg-transparent sm:bg-[#111] border-0 sm:border border-white/9 rounded-xl p-0 sm:p-1.5 focus-within:border-white/18 transition-colors gap-2 sm:gap-0">
              <div className="flex-1 flex items-center bg-[#111] sm:bg-transparent border border-white/9 sm:border-0 rounded-xl sm:rounded-none px-3 py-2.5 sm:p-0">
                <Search className="w-4 h-4 text-zinc-600 shrink-0" />
                <input
                  type="url"
                  required
                  placeholder="Paste a URL to analyze…"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="flex-1 bg-transparent text-[14px] text-zinc-200 placeholder:text-zinc-600 px-3 outline-none min-w-0"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !url}
                className="flex items-center justify-center gap-2 bg-white text-black text-[13px] font-[650] px-5 py-3 sm:py-2.5 rounded-xl sm:rounded-[9px] hover:bg-zinc-100 transition-colors disabled:opacity-40 shrink-0 w-full sm:w-auto"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Analyze <ArrowRight className="w-4 h-4" /></>}
              </button>
            </div>
            {error && <p className="mt-3 text-[13px] text-red-400">{error}</p>}
          </form>
        </FadeIn>
      </section>

      {/* ══════════════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════════════ */}
      <footer className="border-t border-zinc-900 px-5 py-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-[15px] font-[750] tracking-[-0.03em] text-white">TrulyLied</span>
          <div className="flex items-center gap-6 text-[12px] text-zinc-600">
            <a href="/live" className="hover:text-zinc-400 transition-colors">Live</a>
            <a href="/compare" className="hover:text-zinc-400 transition-colors">Compare</a>
            <a href="/trends" className="hover:text-zinc-400 transition-colors">Trends</a>
            <a href="/history" className="hover:text-zinc-400 transition-colors">History</a>
          </div>
          <p className="text-[11px] text-zinc-700">AI-powered fact-checking · Built with CRAG</p>
        </div>
      </footer>
    </div>
  );
}
