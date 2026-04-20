"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api";
import Link from "next/link";

function AnimatedOrb({ size, x, y, color, delay }: any) {
  return (
    <div
      className="absolute rounded-full blur-3xl opacity-20 animate-float"
      style={{ width: size, height: size, left: x, top: y, background: color, animationDelay: delay, pointerEvents: "none" }}
    />
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => { setMounted(true); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-950 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 bg-grid-ink bg-grid opacity-100" />
      <div className="absolute inset-0 bg-glow-radial" />
      <AnimatedOrb size={400} x="10%" y="10%" color="radial-gradient(#3B82F6,transparent)" delay="0s" />
      <AnimatedOrb size={300} x="70%" y="60%" color="radial-gradient(#8B5CF6,transparent)" delay="2s" />
      <AnimatedOrb size={200} x="50%" y="5%"  color="radial-gradient(#06B6D4,transparent)" delay="4s" />

      {/* Card */}
      <div className={`relative z-10 w-full max-w-md mx-4 transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
        <div className="glass rounded-2xl p-8 shadow-card">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-electric-600/20 border border-electric-500/30 mb-4 animate-glow">
              <span className="text-2xl">⚡</span>
            </div>
            <h1 className="font-display text-2xl font-bold text-mist-100">Welcome back</h1>
            <p className="text-mist-400 text-sm mt-1 font-body">Sign in to your platform</p>
          </div>

          {error && (
            <div className="mb-5 flex items-center gap-2 bg-neon-red/10 border border-neon-red/20 text-neon-red text-sm px-4 py-3 rounded-xl animate-slide-up">
              <span>✕</span> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-mist-400 uppercase tracking-widest mb-2 font-body">Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className="input-glow w-full bg-ink-800 border border-ink-600 rounded-xl px-4 py-3 text-mist-100 text-sm placeholder-ink-500 transition-all font-body"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-mist-400 uppercase tracking-widest mb-2 font-body">Password</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)} required
                className="input-glow w-full bg-ink-800 border border-ink-600 rounded-xl px-4 py-3 text-mist-100 text-sm placeholder-ink-500 transition-all font-body"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit" disabled={loading}
              className="btn-press w-full relative overflow-hidden bg-electric-600 hover:bg-electric-500 text-white py-3 rounded-xl font-display font-semibold text-sm tracking-wide transition-all duration-200 disabled:opacity-50 mt-2 shadow-glow-blue"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Signing in...
                </span>
              ) : "Sign In →"}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-ink-700 text-center">
            <p className="text-mist-500 text-sm font-body">
              No account?{" "}
              <Link href="/register" className="text-electric-400 hover:text-electric-300 font-medium transition-colors">
                Create one free
              </Link>
            </p>
          </div>
        </div>

        {/* Bottom tag */}
        <p className="text-center text-ink-500 text-xs mt-4 font-mono">AI · 60 Concurrent Calls · Lead Scoring</p>
      </div>
    </div>
  );
}
