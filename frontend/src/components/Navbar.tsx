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
    <header className="sticky top-0 z-40 w-full border-b border-[rgba(255,255,255,0.06)] bg-[#080808]">
      <nav className="mx-auto flex h-12 max-w-6xl items-center justify-between px-5">
        {/* Wordmark */}
        <a
          href="/"
          className="text-[20px] font-[800] tracking-[-0.04em] text-white hover:text-zinc-300 transition-colors"
        >
          TrulyLied
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
