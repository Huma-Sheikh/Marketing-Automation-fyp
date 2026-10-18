"use client";
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

export type ToastType = "success" | "error" | "info";
type Toast = { id: string; message: string; type: ToastType };

type ToastContextValue = {
  addToast: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 3500;

const ICONS: Record<ToastType, string> = { success: "✓", error: "✕", info: "ℹ" };
const COLORS: Record<ToastType, string> = {
  success: "bg-neon-green/10 border-neon-green/30 text-neon-green",
  error: "bg-neon-red/10 border-neon-red/30 text-neon-red",
  info: "bg-electric-500/10 border-electric-500/30 text-electric-400",
};

/** Renders transient notifications in the top-right corner. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), TOAST_DURATION_MS);
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      addToast,
      success: (m) => addToast(m, "success"),
      error: (m) => addToast(m, "error"),
      info: (m) => addToast(m, "info"),
    }),
    [addToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-5 right-5 z-50 flex flex-col gap-2 pointer-events-none" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border glass font-body text-sm font-medium shadow-card ${COLORS[t.type]}`}
          >
            <span className="text-base font-bold">{ICONS[t.type]}</span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Access the toast API. Must be used under <ToastProvider>. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
