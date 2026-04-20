"use client";
import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import { checkHealth } from "@/lib/api";

export default function SettingsPage() {
  const [health, setHealth] = useState<any>(null);
  const [checking, setChecking] = useState(true);

  const checkAll = async () => {
    setChecking(true);
    try { setHealth(await checkHealth()); }
    catch (e) { console.error(e); }
    finally { setChecking(false); }
  };
  useEffect(() => { checkAll(); }, []);

  const APIS = [
    { name: "Twilio", desc: "Phone calls & SMS", env: "TWILIO_ACCOUNT_SID", url: "twilio.com" },
    { name: "Resend", desc: "Email sending (3000 free/mo)", env: "RESEND_API_KEY", url: "resend.com" },
    { name: "Stripe", desc: "Subscription billing", env: "STRIPE_SECRET_KEY", url: "stripe.com" },
    { name: "Google Places", desc: "Business search", env: "GOOGLE_PLACES_API_KEY", url: "console.cloud.google.com" },
  ];

  return (
    <div className="flex bg-ink-950 min-h-screen">
      <Sidebar />
      <main className="ml-60 flex-1 p-8 page-enter">
        <div className="mb-8">
          <h1 className="font-display font-bold text-2xl text-mist-100">Settings</h1>
          <p className="text-mist-500 text-sm font-body mt-1">System status and configuration</p>
        </div>

        <div className="max-w-2xl space-y-6">
          {/* AI Services */}
          <div className="glass rounded-2xl p-6 border border-ink-600/30">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display font-semibold text-mist-100 text-sm uppercase tracking-widest">AI Services</h2>
              <button onClick={checkAll} disabled={checking}
                className="text-xs font-mono text-electric-400 hover:text-electric-300 flex items-center gap-1.5 transition-colors disabled:opacity-50">
                {checking ? <><svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Checking...</> : "↺ Refresh"}
              </button>
            </div>
            <div className="space-y-2">
              {checking ? (
                [1,2,3,4].map(i => <div key={i} className="h-12 rounded-xl skeleton" />)
              ) : Object.entries(health || { "STT/TTS": "unavailable", Leads: "unavailable", Business: "unavailable", LLM: "unavailable" }).map(([svc, st]: any) => (
                <div key={svc} className="flex items-center justify-between px-4 py-3 bg-ink-800/50 rounded-xl border border-ink-600/30">
                  <div className="flex items-center gap-3">
                    <div className="relative w-3 h-3">
                      <div className="w-3 h-3 rounded-full" style={{ background: st === "healthy" ? "#10B981" : "#EF4444" }} />
                      {st === "healthy" && <div className="absolute inset-0 rounded-full live-dot" style={{ background: "#10B981" }} />}
                    </div>
                    <span className="text-sm font-body text-mist-200">{svc}</span>
                  </div>
                  <span className="text-xs font-mono" style={{ color: st === "healthy" ? "#10B981" : "#EF4444" }}>{st}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 bg-neon-amber/10 border border-neon-amber/20 rounded-xl px-4 py-3">
              <p className="text-xs text-neon-amber font-body">Services show "unavailable" until trained models are dropped into <code className="font-mono bg-neon-amber/10 px-1 rounded">python-services/*/models/</code> folders.</p>
            </div>
          </div>

          {/* API Keys */}
          <div className="glass rounded-2xl p-6 border border-ink-600/30">
            <h2 className="font-display font-semibold text-mist-100 text-sm uppercase tracking-widest mb-5">API Integrations</h2>
            <p className="text-sm text-mist-500 font-body mb-4">Configure your API keys in <code className="font-mono text-electric-400 bg-electric-500/10 px-2 py-0.5 rounded-lg">nestjs-backend/.env</code></p>
            <div className="space-y-2">
              {APIS.map(api => (
                <div key={api.name} className="flex items-center justify-between px-4 py-3.5 bg-ink-800/50 rounded-xl border border-ink-600/30 hover:border-ink-500/50 transition-colors">
                  <div>
                    <div className="font-body font-medium text-mist-200 text-sm">{api.name}</div>
                    <div className="text-xs text-mist-500 font-body mt-0.5">{api.desc}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <code className="text-xs font-mono text-ink-500 hidden sm:block">{api.env}</code>
                    <a href={`https://${api.url}`} target="_blank" rel="noreferrer"
                      className="text-xs text-electric-400 hover:text-electric-300 font-body transition-colors">
                      {api.url} →
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Model Status */}
          <div className="glass rounded-2xl p-6 border border-neon-amber/20">
            <h2 className="font-display font-semibold text-neon-amber text-sm uppercase tracking-widest mb-3">⚠ Model Training Required</h2>
            <p className="text-sm text-mist-400 font-body mb-3">
              Your platform currently runs in <span className="text-neon-amber font-mono">stub mode</span>. Train your AI models on Kaggle using the AI Platform Training Guide, then drop the files into:
            </p>
            <div className="space-y-1.5 font-mono text-xs">
              {[
                { path: "python-services/stt-tts-service/models/", file: "stt_model_final.pth, tts_final.pth" },
                { path: "python-services/leads-service/models/",   file: "ner_bert/ folder, lead_scorer.json" },
                { path: "python-services/business-service/models/",file: "sentiment_roberta/ folder" },
                { path: "python-services/llm-service/models/",     file: "model-q4_K_M.gguf" },
              ].map(({ path, file }) => (
                <div key={path} className="flex gap-2 text-mist-500">
                  <span className="text-neon-amber/70">→</span>
                  <span>{path}<span className="text-mist-400">{file}</span></span>
                </div>
              ))}
            </div>
            <p className="text-xs text-mist-600 font-body mt-3">Then run: <code className="text-electric-400 font-mono">docker-compose up -d --build</code></p>
          </div>
        </div>
      </main>
    </div>
  );
}
