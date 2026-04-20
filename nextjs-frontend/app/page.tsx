"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    router.push(token ? "/dashboard" : "/login");
  }, []);
  return <div className="flex items-center justify-center h-screen"><div className="text-gray-400">Loading...</div></div>;
}
