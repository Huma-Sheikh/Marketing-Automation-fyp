"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { getErrorMessage } from "@/lib/http";

/**
 * Generic submit/loading/error state for the login and register forms.
 * `action` performs the auth call; on success the user is sent to /dashboard.
 */
export function useAuthForm<T extends Record<string, string>>(initial: T, action: (values: T) => Promise<unknown>) {
  const [values, setValues] = useState<T>(initial);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const setField = (key: keyof T) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await action(values);
      router.push("/dashboard");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return { values, setField, error, loading, handleSubmit };
}
