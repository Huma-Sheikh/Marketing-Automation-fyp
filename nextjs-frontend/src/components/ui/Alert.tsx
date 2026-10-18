import React from "react";

type AlertVariant = "error" | "success" | "warning";

const BOX: Record<AlertVariant, string> = {
  error: "bg-neon-red/10 border border-neon-red/20 text-neon-red",
  success: "bg-neon-green/10 border border-neon-green/20 text-neon-green",
  warning: "bg-neon-amber/10 border border-neon-amber/20 text-neon-amber",
};

type AlertProps = {
  variant?: AlertVariant;
  /** "box" is a bordered panel; "inline" is plain red text under a form. */
  appearance?: "box" | "inline";
  /** Show the leading ✕ marker (error alerts only). */
  icon?: boolean;
  /** Optional retry handler, rendered as an underlined button. */
  onRetry?: () => void;
  className?: string;
  children: React.ReactNode;
};

/** Error / success / warning message. Renders nothing when children are empty. */
export function Alert({ variant = "error", appearance = "box", icon, onRetry, className = "", children }: AlertProps) {
  if (!children) return null;
  const showIcon = icon ?? variant === "error";

  if (appearance === "inline") {
    return (
      <p className={`text-neon-red text-sm font-body flex items-center gap-1 ${className}`} role="alert">
        {showIcon && <span>✕</span>} {children}
      </p>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 text-sm px-4 py-3 rounded-xl font-body ${BOX[variant]} ${className}`}
      role={variant === "error" ? "alert" : "status"}
    >
      {showIcon && <span>✕</span>}
      <span>
        {children}
        {onRetry && (
          <button onClick={onRetry} className="underline ml-2">
            Retry
          </button>
        )}
      </span>
    </div>
  );
}
