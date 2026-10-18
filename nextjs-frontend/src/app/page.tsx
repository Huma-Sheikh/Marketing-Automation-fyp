"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";

/** Entry point: sends signed-in users to the dashboard, everyone else to login. */
export default function Home() {
  const router = useRouter();
  const { ready, isAuthenticated } = useAuth();

  useEffect(() => {
    if (ready) router.push(isAuthenticated ? "/dashboard" : "/login");
  }, [ready, isAuthenticated, router]);

  return <div className="flex items-center justify-center h-screen"><div className="text-gray-400">Loading...</div></div>;
}
