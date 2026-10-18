"use client";
import { useEffect, useState } from "react";

/** True after the first client render; drives fade-in entrance transitions. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return mounted;
}
