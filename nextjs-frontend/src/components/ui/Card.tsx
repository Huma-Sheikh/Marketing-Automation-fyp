import React from "react";

/** Frosted-glass panel used for every content section. Padding/border via className. */
export function Card({ className = "", children, style }: { className?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className={`glass rounded-2xl ${className}`} style={style}>
      {children}
    </div>
  );
}

/** Small uppercase section heading used inside cards. */
export function SectionTitle({ className = "text-mist-100", children }: { className?: string; children: React.ReactNode }) {
  return <h2 className={`font-display font-semibold text-sm uppercase tracking-widest ${className}`}>{children}</h2>;
}
