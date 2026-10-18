"use client";
import { Alert, Card, PageHeader, SectionTitle, SkeletonList, Spinner } from "@/components/ui";
import { PhoneNumbers } from "@/features/phone-numbers/components/PhoneNumbers";
import { API_INTEGRATIONS, MODEL_LOCATIONS } from "@/features/settings/constants";
import { useAiHealth } from "@/features/settings/hooks/useAiHealth";

const HEALTH_FALLBACK = { "STT/TTS": "unavailable", Leads: "unavailable", Business: "unavailable", LLM: "unavailable" };

export default function SettingsPage() {
  const { health, checking, error, refresh } = useAiHealth();

  return (
    <>
      <PageHeader title="Settings" subtitle="System status and configuration" />

      <div className="max-w-2xl space-y-6">
        <PhoneNumbers />

        {/* AI Services */}
        <Card className="p-6 border border-ink-600/30">
          <div className="flex items-center justify-between mb-5">
            <SectionTitle>AI Services</SectionTitle>
            <button onClick={refresh} disabled={checking}
              className="text-xs font-mono text-electric-400 hover:text-electric-300 flex items-center gap-1.5 transition-colors disabled:opacity-50">
              {checking ? <><Spinner className="w-3 h-3" /> Checking...</> : "↺ Refresh"}
            </button>
          </div>
          <Alert className="mb-3">{error}</Alert>
          <div className="space-y-2">
            {checking ? (
              <SkeletonList count={4} className="h-12 rounded-xl" />
            ) : Object.entries(health || HEALTH_FALLBACK).map(([svc, st]) => (
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
            <p className="text-xs text-neon-amber font-body">
              A service shows &quot;unavailable&quot; when it is not running or its model files are missing from its{" "}
              <code className="font-mono bg-neon-amber/10 px-1 rounded">python-services/&lt;service&gt;/model(s)/</code> folder (see Model Locations below).
            </p>
          </div>
        </Card>

        {/* API Keys */}
        <Card className="p-6 border border-ink-600/30">
          <SectionTitle className="text-mist-100 mb-5">API Integrations</SectionTitle>
          <p className="text-sm text-mist-500 font-body mb-4">Configure your API keys in <code className="font-mono text-electric-400 bg-electric-500/10 px-2 py-0.5 rounded-lg">nestjs-backend/.env</code></p>
          <div className="space-y-2">
            {API_INTEGRATIONS.map((api) => (
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
        </Card>

        {/* Model locations */}
        <Card className="p-6 border border-neon-amber/20">
          <SectionTitle className="text-neon-amber mb-3">Model Locations</SectionTitle>
          <p className="text-sm text-mist-400 font-body mb-3">
            Each AI service loads its trained model from the folder below when it starts. To swap in a retrained model, replace the files in place:
          </p>
          <div className="space-y-2.5 font-mono text-xs">
            {MODEL_LOCATIONS.map(({ service, path, files }) => (
              <div key={path} className="flex gap-2 text-mist-500">
                <span className="text-neon-amber/70">→</span>
                <span>
                  <span className="text-mist-300">{service}:</span> {path}
                  <span className="block text-mist-400">{files}</span>
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-mist-600 font-body mt-3">Then run: <code className="text-electric-400 font-mono">docker-compose up -d --build</code></p>
        </Card>
      </div>
    </>
  );
}
