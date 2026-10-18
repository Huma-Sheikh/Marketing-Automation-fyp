import React from "react";
import { Spinner } from "./Spinner";

type ButtonVariant = "primary" | "success" | "secondary";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-electric-600 hover:bg-electric-500 text-white font-display font-semibold shadow-glow-blue",
  success: "bg-neon-green/80 hover:bg-neon-green text-ink-950 font-display font-bold",
  secondary: "text-mist-400 border border-ink-600 hover:text-mist-200 font-display font-semibold",
};

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  /** Shows a spinner before the label and disables the button. */
  loading?: boolean;
};

/**
 * Pressable button with the app's colour variants. Size/padding/width come
 * from `className` because they differ per placement.
 */
export function Button({ variant = "primary", loading, disabled, className = "", children, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`btn-press rounded-xl transition-all disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <Spinner /> {children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
