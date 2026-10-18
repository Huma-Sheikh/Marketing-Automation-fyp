"use client";
import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "@/lib/http";
import { useToast } from "@/providers/ToastProvider";
import { leadsApi } from "../api";
import type { Lead } from "../types";

/**
 * Lead list for the Leads page, optionally filtered by status, plus the
 * scrape and delete actions. Reloads whenever `statusFilter` changes.
 */
export function useLeads(statusFilter = "") {
  const toast = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setLeads(await leadsApi.list(statusFilter || undefined)); }
    catch (e) { setError(getErrorMessage(e)); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  /** Scrapes up to 100 leads and prepends them to the list. */
  const scrape = async (platform: string, query: string) => {
    if (!query.trim()) return;
    setScraping(true); setError("");
    try {
      const res = await leadsApi.scrape(platform, query, 100);
      setLeads((prev) => [...(res.leads || []), ...prev]);
    } catch (e) { setError(getErrorMessage(e)); }
    finally { setScraping(false); }
  };

  const remove = async (id: string) => {
    setDeleteId(id);
    try {
      await leadsApi.remove(id);
      setLeads((prev) => prev.filter((l) => l.id !== id));
    } catch (e) {
      toast.error(getErrorMessage(e, "Could not delete lead"));
    } finally {
      setDeleteId("");
    }
  };

  return { leads, loading, scraping, error, deleteId, reload: load, scrape, remove };
}
