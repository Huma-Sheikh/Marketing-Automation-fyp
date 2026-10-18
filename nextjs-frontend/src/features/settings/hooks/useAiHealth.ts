"use client";
import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "@/lib/http";
import { settingsApi, type AiHealth } from "../api";

/** Fetches AI microservice health on mount; `refresh` re-checks on demand. */
export function useAiHealth() {
  const [health, setHealth] = useState<AiHealth | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      setHealth(await settingsApi.aiHealth());
      setError("");
    } catch (e) {
      setError(getErrorMessage(e, "Could not check AI services"));
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { health, checking, error, refresh };
}
