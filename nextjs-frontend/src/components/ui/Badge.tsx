import React from "react";

type BadgeProps = {
  /** Text colour; background defaults to the same colour at low opacity. */
  color?: string;
  background?: string;
  /** Tailwind classes, used instead of colour props for class-based palettes. */
  className?: string;
  children: React.ReactNode;
};

/** Small rounded status pill used for lead, campaign, agency and sentiment states. */
export function Badge({ color, background, className = "", children }: BadgeProps) {
  const style = color ? { color, background: background ?? `${color}1F` } : undefined;
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full font-mono font-medium ${className}`} style={style}>
      {children}
    </span>
  );
}
