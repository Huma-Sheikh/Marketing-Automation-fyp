"use client";
import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "@/lib/http";
import { useToast } from "@/providers/ToastProvider";
import { campaignsApi } from "../api";
import type { Campaign } from "../types";

/**
 * Campaign list with start / pause / delete actions. `actionId` is the id
 * of the campaign whose action is in flight (drives per-card spinners).
 */
export function useCampaigns() {
  const toast = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionId, setActionId] = useState("");

  const load = useCallback(async () => {
    try {
      setCampaigns(await campaignsApi.list());
      setError("");
    } catch (e) {
      setError(getErrorMessage(e, "Could not load campaigns"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const runAction = async (id: string, fn: (id: string) => Promise<unknown>) => {
    setActionId(id);
    try { await fn(id); await load(); }
    catch (e) { toast.error(getErrorMessage(e)); }
    finally { setActionId(""); }
  };

  const start = (id: string) => runAction(id, campaignsApi.start);
  const stop = (id: string) => runAction(id, campaignsApi.stop);

  const remove = async (id: string) => {
    if (!confirm("Delete campaign?")) return;
    try {
      await campaignsApi.remove(id);
      setCampaigns((c) => c.filter((x) => x.id !== id));
    } catch (e) {
      toast.error(getErrorMessage(e, "Could not delete campaign"));
    }
  };

  const runningCount = campaigns.filter((c) => c.status === "running").length;

  return { campaigns, loading, error, actionId, runningCount, reload: load, start, stop, remove };
}
