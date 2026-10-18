import React from "react";

/**
 * Re-mounted on every navigation (unlike the layout), so the page-enter
 * animation still plays each time a page opens.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <main className="ml-60 flex-1 p-8 page-enter">{children}</main>;
}
