"use client";
import React, { useEffect, useState } from "react";

/** Animated number counter from 0 to `target`. */
function CountUp({ target, duration = 800 }: { target: number; duration?: number }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!target) return;
    let start = 0;
    const step = target / (duration / 16);
    const t = setInterval(() => {
      start += step;
      if (start >= target) { setVal(target); clearInterval(t); }
      else setVal(Math.floor(start));
    }, 16);
    return () => clearInterval(t);
  }, [target, duration]);
  return <>{val.toLocaleString()}</>;
}

type KpiCardProps = {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  sub?: React.ReactNode;
  accent: string;
  delay?: number;
};

/** Headline metric tile; numeric values count up when the card appears. */
export function KpiCard({ title, value, icon, sub, accent, delay = 0 }: KpiCardProps) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), delay); return () => clearTimeout(t); }, [delay]);
  const numVal = typeof value === "number" ? value : null;

  return (
    <div className={`card-lift glass rounded-2xl p-5 transition-all duration-500 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
      style={{ borderColor: `${accent}20` }}>
      <div className="flex justify-between items-start mb-4">
        <span className="text-xs text-mist-500 uppercase tracking-widest font-body font-medium">{title}</span>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: `${accent}18` }}>
          {icon}
        </div>
      </div>
      <div className="font-display font-bold text-3xl text-mist-100">
        {numVal !== null ? (visible ? <CountUp target={numVal} /> : "0") : value}
      </div>
      {sub && <div className="text-xs text-mist-500 mt-1 font-body">{sub}</div>}
      <div className="mt-4 h-0.5 rounded-full" style={{ background: `linear-gradient(90deg, ${accent}60, transparent)` }} />
    </div>
  );
}
