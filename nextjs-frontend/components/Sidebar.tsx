"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/api";
import { useState } from "react";

const NAV = [
  { href: "/dashboard",  label: "Dashboard",   icon: "▣",  accent: "#3B82F6" },
  { href: "/leads",      label: "Leads",        icon: "◈",  accent: "#10B981" },
  { href: "/campaigns",  label: "Campaigns",    icon: "◉",  accent: "#F59E0B" },
  { href: "/business",   label: "Business Search", icon: "◎", accent: "#EC4899" },
  { href: "/billing",    label: "Billing",      icon: "◆",  accent: "#8B5CF6" },
  { href: "/whitelabel", label: "White-Label",  icon: "◇",  accent: "#06B6D4" },
  { href: "/settings",   label: "Settings",     icon: "⊛",  accent: "#6B82A8" },
];

export default function Sidebar() {
  const path = usePathname();
  const [hovered, setHovered] = useState("");

  return (
    <aside className="w-60 flex flex-col min-h-screen fixed left-0 top-0 z-20" style={{ background: "linear-gradient(180deg, #07090F 0%, #0A0C14 100%)", borderRight: "1px solid rgba(96,165,250,0.08)" }}>
      {/* Logo */}
      <div className="px-5 py-6 border-b border-ink-700/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-electric-600/20 border border-electric-500/30 flex items-center justify-center animate-glow flex-shrink-0">
            <span className="text-electric-400 text-base">⚡</span>
          </div>
          <div>
            <div className="font-display font-bold text-mist-100 text-sm tracking-wide">Marketing AI</div>
            <div className="font-mono text-xs text-ink-500 mt-0.5">v2.0 · Platform</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(item => {
          const active = path.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onMouseEnter={() => setHovered(item.href)}
              onMouseLeave={() => setHovered("")}
              className={`nav-link ${active ? "active" : ""} group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 font-body`}
              style={{
                background: active ? `${item.accent}14` : hovered === item.href ? "rgba(255,255,255,0.04)" : "transparent",
                color: active ? item.accent : hovered === item.href ? "#C4D2F5" : "#6B82A8",
              }}
            >
              {/* Active bar */}
              {active && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full" style={{ background: item.accent }} />
              )}
              <span className="text-base w-5 text-center flex-shrink-0" style={{ filter: active ? `drop-shadow(0 0 6px ${item.accent})` : "none" }}>
                {item.icon}
              </span>
              <span className="font-medium">{item.label}</span>
              {active && <span className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: item.accent, boxShadow: `0 0 6px ${item.accent}` }} />}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4 pt-2 border-t border-ink-700/50 space-y-2">
        {/* System status */}
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="live-dot w-2 h-2 rounded-full bg-neon-green flex-shrink-0" />
          <span className="text-xs text-mist-500 font-mono">System online</span>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-mist-500 hover:text-neon-red hover:bg-neon-red/10 rounded-xl text-sm font-body font-medium transition-all duration-200"
        >
          <span className="text-base">⇥</span>
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
