import React from "react";
import { RequireAuth } from "@/components/layout/RequireAuth";
import { Sidebar } from "@/components/layout/Sidebar";

/**
 * Shell for every signed-in page: auth guard + sidebar. The route group
 * "(app)" does not appear in URLs, so /dashboard etc. are unchanged.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <div className="flex bg-ink-950 min-h-screen">
        <Sidebar />
        {children}
      </div>
    </RequireAuth>
  );
}
