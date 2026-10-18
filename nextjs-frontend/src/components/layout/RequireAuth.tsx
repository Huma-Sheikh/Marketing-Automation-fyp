"use client";
import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";

/**
 * Renders children only for a signed-in user; anyone else is sent to /login.
 * Shows a blank screen while the session is being restored, so protected
 * content never flashes.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { ready, isAuthenticated } = useAuth();

  useEffect(() => {
    if (ready && !isAuthenticated) router.replace("/login");
  }, [ready, isAuthenticated, router]);

  if (!ready || !isAuthenticated) {
    return <div className="min-h-screen bg-ink-950" />;
  }
  return <>{children}</>;
}
