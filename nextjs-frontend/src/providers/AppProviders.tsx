"use client";
import React from "react";
import { AuthProvider } from "./AuthProvider";
import { ToastProvider } from "./ToastProvider";

/** Global client-side providers mounted once in the root layout. */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>{children}</AuthProvider>
    </ToastProvider>
  );
}
