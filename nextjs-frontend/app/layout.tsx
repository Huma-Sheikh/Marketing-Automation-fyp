"use client";
import "./globals.css";
import React, { useState, useEffect, createContext, useContext, useCallback } from "react";

// Toast system
type Toast = { id: string; message: string; type: "success" | "error" | "info" };

const ToastContext = createContext<{ addToast: (msg: string, type?: Toast["type"]) => void }>({
  addToast: () => {},
});

// ❌ REMOVE export here
const useToast = () => useContext(ToastContext);

function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const icons = { success: "✓", error: "✕", info: "ℹ" };
  const colors = {
    success: "bg-neon-green/10 border-neon-green/30 text-neon-green",
    error: "bg-neon-red/10 border-neon-red/30 text-neon-red",
    info: "bg-electric-500/10 border-electric-500/30 text-electric-400",
  };

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed top-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border glass font-body text-sm font-medium shadow-card ${colors[t.type]}`}
          >
            <span className="text-base font-bold">{icons[t.type]}</span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <title>Marketing AI Platform</title>
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}