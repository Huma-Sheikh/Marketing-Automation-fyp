"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { register } from "@/lib/api";
import Link from "next/link";

export default function RegisterPage() {
  const [form, setForm] = useState({ email: "", password: "", businessName: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));
  useEffect(() => { setMounted(true); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    try { await register(form.email, form.password, form.businessName); router.push("/dashboard"); }
    catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-950 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid-ink bg-grid" />
      <div className="absolute inset-0 bg-glow-radial" />
      <div className="absolute w-96 h-96 -left-20 top-20 rounded-full blur-3xl opacity-15 animate-float" style={{ background: "radial-gradient(#10B981,transparent)" }} />
      <div className="absolute w-64 h-64 right-20 bottom-20 rounded-full blur-3xl opacity-15 animate-float" style={{ background: "radial-gradient(#8B5CF6,transparent)", animationDelay: "3s" }} />

      <div className={`relative z-10 w-full max-w-md mx-4 transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
        <div className="glass rounded-2xl p-8 shadow-card">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-neon-green/20 border border-neon-green/30 mb-4">
              <span className="text-2xl">🚀</span>
            </div>
            <h1 className="font-display text-2xl font-bold text-mist-100">Create account</h1>
            <p className="text-mist-400 text-sm mt-1 font-body">Start generating leads with AI</p>
          </div>

          {error && (
            <div className="mb-5 flex items-center gap-2 bg-neon-red/10 border border-neon-red/20 text-neon-red text-sm px-4 py-3 rounded-xl">
              <span>✕</span> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { k: "businessName", label: "Business Name", type: "text", ph: "Acme Corp" },
              { k: "email",        label: "Email",         type: "email", ph: "you@example.com" },
              { k: "password",     label: "Password",      type: "password", ph: "Min. 8 characters" },
            ].map(({ k, label, type, ph }) => (
              <div key={k}>
                <label className="block text-xs font-medium text-mist-400 uppercase tracking-widest mb-2 font-body">{label}</label>
                <input type={type} value={(form as any)[k]} onChange={set(k)} required minLength={k === "password" ? 8 : undefined}
                  className="input-glow w-full bg-ink-800 border border-ink-600 rounded-xl px-4 py-3 text-mist-100 text-sm placeholder-ink-500 transition-all font-body"
                  placeholder={ph} />
              </div>
            ))}
            <button type="submit" disabled={loading}
              className="btn-press w-full bg-neon-green/80 hover:bg-neon-green text-ink-950 py-3 rounded-xl font-display font-bold text-sm tracking-wide transition-all duration-200 disabled:opacity-50 mt-2 shadow-glow-green">
              {loading ? "Creating..." : "Create Account →"}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-ink-700 text-center">
            <p className="text-mist-500 text-sm font-body">
              Already have an account?{" "}
              <Link href="/login" className="text-electric-400 hover:text-electric-300 font-medium transition-colors">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
