"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
export default function BillingSuccessPage() {
  const router = useRouter();
  const [count, setCount] = useState(4);
  useEffect(() => {
    const t = setInterval(() => setCount(c => {
      if (c <= 1) { clearInterval(t); router.push("/dashboard"); return 0; }
      return c - 1;
    }), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-950 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid-ink bg-grid opacity-50" />
      <div className="absolute w-96 h-96 rounded-full blur-3xl opacity-20 animate-float" style={{ background: "radial-gradient(#10B981,transparent)", left: "30%", top: "20%" }} />
      <div className="relative z-10 glass rounded-2xl p-12 text-center max-w-md shadow-card">
        <div className="text-6xl mb-5 animate-float">🎉</div>
        <h1 className="font-display font-bold text-2xl text-mist-100 mb-2">Payment Successful!</h1>
        <p className="text-mist-400 font-body text-sm mb-6">Your subscription is now active. Welcome to the platform.</p>
        <div className="flex items-center justify-center gap-2 text-mist-600 text-sm font-mono">
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          Redirecting in {count}s...
        </div>
      </div>
    </div>
  );
}
