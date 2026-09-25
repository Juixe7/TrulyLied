"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/config";
import {
  Search, Loader2, ShieldCheck, Zap, Activity,
  ArrowRight, CheckCircle2, Radio, TrendingUp, Globe, PlayCircle,
  FileText, Link2
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

/* ── Content type chips with vibrant interactive presets ───────── */
const CONTENT_TYPES = [
  {
    icon: <PlayCircle className="w-3.5 h-3.5" />,
    label: "YouTube Videos",
    color: "text-rose-400 bg-rose-500/10 border-rose-500/25 hover:bg-rose-500/20 hover:border-rose-400/50 hover:shadow-[0_0_15px_rgba(244,63,94,0.25)]",
    dot: "bg-rose-500",
    sampleUrl: "https://www.youtube.com/watch?v=5FHuonxmySs",
  },
  {
    icon: <Globe className="w-3.5 h-3.5" />,
    label: "News Articles",
    color: "text-sky-400 bg-sky-500/10 border-sky-500/25 hover:bg-sky-500/20 hover:border-sky-400/50 hover:shadow-[0_0_15px_rgba(56,189,248,0.25)]",
    dot: "bg-sky-500",
    sampleUrl: "https://www.bbc.com/news/technology-68541234",
  },
  {
    icon: <TrendingUp className="w-3.5 h-3.5" />,
    label: "Political Debates",
    color: "text-amber-400 bg-amber-500/10 border-amber-500/25 hover:bg-amber-500/20 hover:border-amber-400/50 hover:shadow-[0_0_15px_rgba(251,191,36,0.25)]",
    dot: "bg-amber-500",
    sampleUrl: "https://apnews.com/hub/fact-checking",
  },
  {
    icon: <Radio className="w-3.5 h-3.5" />,
    label: "Social Threads / X",
    color: "text-violet-400 bg-violet-500/10 border-violet-500/25 hover:bg-violet-500/20 hover:border-violet-400/50 hover:shadow-[0_0_15px_rgba(139,92,246,0.25)]",
    dot: "bg-violet-500",
    sampleUrl: "https://x.com/OpenAI/status/17892348912",
  },
  {
    icon: <ShieldCheck className="w-3.5 h-3.5" />,
    label: "Science Claims",
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25 hover:bg-emerald-500/20 hover:border-emerald-400/50 hover:shadow-[0_0_15px_rgba(16,185,129,0.25)]",
    dot: "bg-emerald-500",
    sampleUrl: "https://www.nature.com/articles/d41586-024-00123-x",
  },
];

const DEMO_SAMPLES = [
  { label: "🎬 Veritasium Climate Video", url: "https://www.youtube.com/watch?v=5FHuonxmySs" },
  { label: "📰 BBC AI Report", url: "https://www.bbc.com/news/technology-68541234" },
  { label: "🔬 Clean Energy Study", url: "https://www.nature.com/articles/d41586-024-00123-x" },
];

/* ── Verdict preview cards (decorative) ─────────────────────── */
const PREVIEW_CARDS = [
  { verdict: "FALSE",      text: "\"The vaccine causes DNA alteration in all recipients.\"",                 color: "text-red-400",    bg: "bg-red-500/8",   border: "border-red-500/20", conf: "94% confidence" },
  { verdict: "TRUE",       text: "\"The global temperature rose by 1.1°C compared to pre-industrial levels.\"", color: "text-emerald-400", bg: "bg-emerald-500/8", border: "border-emerald-500/20", conf: "97% confidence" },
  { verdict: "MISLEADING", text: "\"Electric vehicles produce zero emissions.\"",                            color: "text-amber-400",  bg: "bg-amber-500/8", border: "border-amber-500/20", conf: "88% confidence" },
];

export default function LandingPage() {
  const [mode, setMode] = useState<"url" | "text">("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "url" && !url) return;
    if (mode === "text" && !text) return;
    setLoading(true);
    setError("");
    try {
      const payload = mode === "url"
        ? { url }
        : { text, title: title.trim() || "Direct Transcript Analysis" };
      const res = await fetch(`${API_URL}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to analyze content");
      router.push(`/report/${data.report_id}`);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080808] overflow-x-hidden relative">
      <Navbar />

      {/* Dynamic atmospheric ambient background glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 left-1/4 -translate-x-1/2 w-[650px] h-[500px] opacity-[0.14] rounded-full blur-[130px]"
        style={{ background: "radial-gradient(circle, #7c3aed 0%, transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-12 right-1/4 translate-x-1/2 w-[550px] h-[450px] opacity-[0.10] rounded-full blur-[140px]"
        style={{ background: "radial-gradient(circle, #4f46e5 0%, transparent 70%)" }}
      />

      {/* ══════════════════════════════════════════════════
          HERO
      ══════════════════════════════════════════════════ */}
      <section className="relative px-5 pt-20 pb-28 max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10"
        >
          {/* Top pill badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 mb-8 rounded-full bg-violet-500/10 border border-violet-500/25 text-[12px] font-[550] text-violet-300 shadow-[0_0_20px_rgba(124,58,237,0.2)]">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Self-Corrective Multi-Agent DAG Fact-Checking
            <span className="text-zinc-600">·</span>
            <span className="text-emerald-400">Groq Whisper + Gemini VLM</span>
          </div>

          {/* Headline */}
          <h1 className="mb-6 max-w-4xl font-[800] tracking-[-0.035em] leading-[1.08] text-white" style={{ fontSize: "clamp(2rem, 3.8vw, 3.25rem)" }}>
            Stop believing.<br />
            Start <span className="gradient-text">verifying.</span>
          </h1>

          {/* Sub-headline */}
          <p className="text-[1.125rem] leading-relaxed text-zinc-400 max-w-2xl mb-8 font-[400]">
            TrulyLied deploys a 4-stage distributed multi-agent DAG to dissect claims across news articles, blogs, and YouTube videos — verifying evidence against live web indices with sub-second hybrid retrieval.
          </p>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center gap-2 mb-6">
            <button
              type="button"
              onClick={() => setMode("url")}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                mode === "url"
                  ? "bg-violet-600 text-white shadow-lg shadow-violet-600/30 border border-violet-500/40"
                  : "bg-white/5 text-zinc-400 hover:text-white border border-white/8 hover:bg-white/10"
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
              Verify Link / Video
            </button>
            <button
              type="button"
              onClick={() => setMode("text")}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                mode === "text"
                  ? "bg-violet-600 text-white shadow-lg shadow-violet-600/30 border border-violet-500/40"
                  : "bg-white/5 text-zinc-400 hover:text-white border border-white/8 hover:bg-white/10"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Paste Transcript / Text
            </button>
          </div>

          {/* Content type chips - shown when mode is URL */}
          {mode === "url" && (
            <div className="mb-8">
              <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold mb-3">
                Supported Media Formats — Click to load sample
              </p>
              <div className="flex flex-wrap gap-2.5">
                {CONTENT_TYPES.map(({ icon, label, color, dot, sampleUrl }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setUrl(sampleUrl)}
                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-[12px] font-[550] transition-all duration-200 cursor-pointer ${color}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${dot} animate-pulse`} />
                    {icon}
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Search form with glowing border */}
          <form onSubmit={handleAnalyze} className="w-full max-w-2xl">
            {mode === "url" ? (
              <div className="relative group p-[1.5px] rounded-2xl bg-gradient-to-r from-violet-500/35 via-fuchsia-500/25 to-indigo-500/35 hover:from-violet-500/50 hover:to-indigo-500/50 focus-within:from-violet-500 focus-within:to-indigo-500 transition-all duration-300 shadow-[0_0_35px_-5px_rgba(124,58,237,0.22)] focus-within:shadow-[0_0_45px_rgba(124,58,237,0.4)]">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center bg-[#0d0d12]/95 backdrop-blur-xl rounded-[15px] p-2 transition-colors gap-2 sm:gap-0">
                  <div className="flex-1 flex items-center px-3 py-2 sm:py-1">
                    <Search className="w-4 h-4 text-violet-400 shrink-0 mr-3" />
                    <input
                      type="url"
                      required
                      placeholder="Paste URL — YouTube video, news article, blog, or press release…"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      className="flex-1 bg-transparent text-[14.5px] text-zinc-100 placeholder:text-zinc-500 outline-none min-w-0 font-normal"
                    />
                    {url && (
                      <button
                        type="button"
                        onClick={() => setUrl("")}
                        className="text-zinc-500 hover:text-zinc-300 text-xs px-2 py-1 mr-1"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={loading || !url}
                    className="flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:from-violet-500 hover:to-indigo-500 text-white text-[13.5px] font-[650] px-6 py-3 rounded-xl shadow-lg shadow-violet-600/30 hover:shadow-violet-600/50 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-40 disabled:hover:scale-100 shrink-0 w-full sm:w-auto"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        Analyze <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative group p-[1.5px] rounded-2xl bg-gradient-to-r from-violet-500/35 via-fuchsia-500/25 to-indigo-500/35 hover:from-violet-500/50 hover:to-indigo-500/50 focus-within:from-violet-500 focus-within:to-indigo-500 transition-all duration-300 shadow-[0_0_35px_-5px_rgba(124,58,237,0.22)] focus-within:shadow-[0_0_45px_rgba(124,58,237,0.4)]">
                <div className="bg-[#0d0d12]/95 backdrop-blur-xl rounded-[15px] p-4 space-y-3">
                  <input
                    type="text"
                    placeholder="Optional title / topic (e.g. Kurzgesagt - Godlike Civilizations, Political Speech)..."
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-white/[0.04] border border-white/8 rounded-xl px-3.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-violet-500/50 transition-all"
                  />
                  <textarea
                    required
                    rows={6}
                    placeholder="Paste video dialogue, article text, speech transcript, or key statements here..."
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    className="w-full bg-white/[0.04] border border-white/8 rounded-xl p-3.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-violet-500/50 transition-all resize-y font-normal leading-relaxed"
                  />
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11.5px] text-zinc-500">
                      {text ? `${text.trim().split(/\s+/).length} words • ${text.length} chars` : "Paste raw text or video captions directly"}
                    </span>
                    <button
                      type="submit"
                      disabled={loading || !text.trim()}
                      className="flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:from-violet-500 hover:to-indigo-500 text-white text-[13.5px] font-[650] px-6 py-2.5 rounded-xl shadow-lg shadow-violet-600/30 hover:shadow-violet-600/50 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-40 disabled:hover:scale-100 shrink-0 cursor-pointer"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          Verify Transcript <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Demo Samples Bar - only in URL mode */}
            {mode === "url" && (
              <div className="flex items-center flex-wrap gap-2 mt-3.5 text-xs">
                <span className="text-zinc-500 flex items-center gap-1 font-medium text-[11.5px]">
                  ⚡ Quick sample test:
                </span>
                {DEMO_SAMPLES.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => setUrl(s.url)}
                    className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-violet-500/15 border border-white/8 hover:border-violet-500/35 text-zinc-400 hover:text-violet-300 transition-all cursor-pointer text-[11.5px]"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            {error && <p className="mt-3 text-[13px] text-red-400 font-medium">{error}</p>}
          </form>

          {/* Trust hints with modern badges */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-7 text-[12px]">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" /> 100% Free to use
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" /> No sign-up required
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-300 font-medium">
              <Activity className="w-3.5 h-3.5" /> Sub-second Qdrant Cache
            </span>
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
