"use client";

import { usePathname } from "next/navigation";
import { Radio, Clock, ArrowRightLeft, TrendingUp } from "lucide-react";

const links = [
  { href: "/live",    label: "Live",    icon: <Radio className="w-3.5 h-3.5" />, isLive: true },
  { href: "/compare", label: "Compare", icon: <ArrowRightLeft className="w-3.5 h-3.5" /> },
  { href: "/trends",  label: "Trends",  icon: <TrendingUp className="w-3.5 h-3.5" /> },
  { href: "/history", label: "History", icon: <Clock className="w-3.5 h-3.5" /> },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/[0.07] bg-[#080808]/85 backdrop-blur-xl transition-all">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
        {/* Brand Wordmark with sleek emblem */}
        <a
          href="/"
          className="flex items-center gap-2.5 group transition-all"
        >
          <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 via-indigo-600 to-purple-600 flex items-center justify-center text-white text-xs font-black shadow-md shadow-violet-500/25 group-hover:scale-105 transition-transform">
            TL
          </span>
          <span className="text-[18px] font-[800] tracking-[-0.035em] text-white group-hover:text-zinc-200 transition-colors">
            Truly<span className="text-violet-400">Lied</span>
          </span>
        </a>

        {/* Links */}
        <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar ml-4">
          {links.map(({ href, label, icon, isLive }) => {
            const isActive = pathname === href || pathname.startsWith(href + "/");
            return (
              <a
                key={href}
                href={href}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-[500] transition-all duration-150 whitespace-nowrap
                  ${isLive
                    ? isActive
                      ? "text-red-400 bg-red-500/10"
                      : "text-red-400/80 hover:text-red-400 hover:bg-red-500/8"
                    : isActive
                      ? "text-white bg-white/8"
                      : "text-zinc-400 hover:text-white hover:bg-white/5"
                  }
                `}
              >
                {isLive && (
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-400" />
                  </span>
                )}
                {!isLive && icon}
                {label}
              </a>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
