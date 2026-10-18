import React from "react";
import { RequireAuth } from "@/components/layout/RequireAuth";

/** Stripe's return page is signed-in only, but keeps its full-screen look (no sidebar). */
export default function BillingSuccessLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
