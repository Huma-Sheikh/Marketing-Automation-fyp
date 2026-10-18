"use client";
import { useEffect, useState } from "react";
import { config } from "@/lib/config";
import { getErrorMessage } from "@/lib/http";
import { dashboardApi } from "../api";
import type { DashboardData } from "../types";

/**
 * Loads analytics for the dashboard and re-polls every
 * `config.dashboardRefreshMs`. A failed poll keeps the last good data and
 * exposes the error; the next successful poll clears it.
 */
export function useDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [updated, setUpdated] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      try {
        const d = await dashboardApi.get();
        if (!active) return;
        setData(d);
        setUpdated(new Date().toLocaleTimeString());
        setError("");
      } catch (e) {
        if (active) setError(getErrorMessage(e, "Could not load dashboard"));
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchData();
    const t = setInterval(fetchData, config.dashboardRefreshMs);
    return () => { active = false; clearInterval(t); };
  }, []);

  return { data, updated, loading, error };
}
