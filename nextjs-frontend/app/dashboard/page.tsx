"use client";
import { useState, useEffect, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import { getDashboard } from "@/lib/api";

// Animated number counter
function CountUp({ target, duration = 800 }: { target: number; duration?: number }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!target) return;
    let start = 0;
    const step = target / (duration / 16);
    const t = setInterval(() => {
      start += step;
      if (start >= target) { setVal(target); clearInterval(t); }
      else setVal(Math.floor(start));
    }, 16);
    return () => clearInterval(t);
  }, [target]);
  return <>{val.toLocaleString()}</>;
}

function KpiCard({ title, value, icon, sub, accent, delay = 0 }: any) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), delay); return () => clearTimeout(t); }, [delay]);
  const numVal = typeof value === "number" ? value : null;

  return (
    <div className={`card-lift glass rounded-2xl p-5 transition-all duration-500 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
      style={{ borderColor: `${accent}20` }}>
      <div className="flex justify-between items-start mb-4">
        <span className="text-xs text-mist-500 uppercase tracking-widest font-body font-medium">{title}</span>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: `${accent}18` }}>
          {icon}
        </div>
      </div>
      <div className="font-display font-bold text-3xl text-mist-100">
        {numVal !== null ? (visible ? <CountUp target={numVal} /> : "0") : value}
      </div>
      {sub && <div className="text-xs text-mist-500 mt-1 font-body">{sub}</div>}
      <div className="mt-4 h-0.5 rounded-full" style={{ background: `linear-gradient(90deg, ${accent}60, transparent)` }} />
    </div>
  );
}

function HealthDot({ label, status }: any) {
  const colors: any = { healthy: "#10B981", unavailable: "#EF4444", unknown: "#6B82A8" };
  const c = colors[status] || colors.unknown;
  return (
    <div className="flex items-center gap-2.5 bg-ink-800/50 px-3 py-2 rounded-xl border border-ink-600/50">
      <div className="relative">
        <div className="w-2 h-2 rounded-full" style={{ background: c }} />
        {status === "healthy" && <div className="absolute inset-0 rounded-full live-dot" style={{ background: c }} />}
      </div>
      <span className="text-xs font-body text-mist-400">{label}</span>
      <span className="text-xs font-mono ml-auto" style={{ color: c }}>{status}</span>
    </div>
  );
}

function FunnelRow({ label, val, total, color }: any) {
  const pct = total > 0 ? Math.round((val / total) * 100) : 0;
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-mist-400 font-body">{label}</span>
        <span className="font-mono" style={{ color }}>{val} <span className="text-mist-600">({pct}%)</span></span>
      </div>
      <div className="h-1.5 bg-ink-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-1000 ease-out" style={{ width: pct + "%", background: `linear-gradient(90deg, ${color}, ${color}99)`, boxShadow: `0 0 8px ${color}60` }} />
      </div>
    </div>
  );
}

function SkeletonCard() {
  return <div className="glass rounded-2xl p-5 h-32 skeleton" />;
}

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [updated, setUpdated] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const d = await getDashboard();
        setData(d);
        setUpdated(new Date().toLocaleTimeString());
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetchData();
    const t = setInterval(fetchData, 10000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex bg-ink-950 min-h-screen">
      <Sidebar />
      <main className="ml-60 flex-1 p-8 page-enter">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="font-display font-bold text-2xl text-mist-100">Dashboard</h1>
            <p className="text-mist-500 text-sm font-body mt-1">Real-time platform overview</p>
          </div>
          <div className="flex items-center gap-2 bg-ink-800 px-4 py-2 rounded-xl border border-ink-600/50">
            <div className="live-dot w-2 h-2 rounded-full bg-neon-green" />
            <span className="text-xs font-mono text-mist-400">{updated ? `Updated ${updated}` : "Connecting..."}</span>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6 stagger">
          {loading ? (
            [1,2,3,4].map(i => <SkeletonCard key={i} />)
          ) : (
            <>
              <KpiCard title="Active Calls" value={data?.activeCalls || 0} icon="📞" sub="Live right now" accent="#10B981" delay={50} />
              <KpiCard title="Calls Today"  value={data?.calls?.today || 0} icon="📊" sub={`${data?.calls?.week || 0} this week`} accent="#3B82F6" delay={100} />
              <KpiCard title="Total Leads"  value={data?.leads?.total || 0} icon="👥" sub={`${data?.leads?.newLeads || 0} new`} accent="#F59E0B" delay={150} />
              <KpiCard title="Conversion"   value={(data?.leads?.conversionRate || "0") + "%"} icon="🎯" sub="Leads → converted" accent="#8B5CF6" delay={200} />
            </>
          )}
        </div>

        {/* AI Health */}
        <div className="glass rounded-2xl p-5 mb-6 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-mist-100 text-sm uppercase tracking-widest">AI Services</h2>
            <span className="text-xs font-mono text-mist-600">auto-refreshing</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(data?.aiHealth || { "STT/TTS": "—", "Leads": "—", "Business": "—", "LLM": "—" }).map(([svc, st]: any) => (
              <HealthDot key={svc} label={svc} status={st === "—" ? "unknown" : st} />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Lead Funnel */}
          <div className="glass rounded-2xl p-5 animate-fade-in">
            <h2 className="font-display font-semibold text-mist-100 text-sm uppercase tracking-widest mb-5">Lead Pipeline</h2>
            {loading ? (
              <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-6 rounded skeleton" />)}</div>
            ) : (
              <>
                <FunnelRow label="New"       val={data?.leads?.newLeads || 0}  total={data?.leads?.total || 1} color="#3B82F6" />
                <FunnelRow label="Contacted" val={(data?.leads?.total || 0) - (data?.leads?.newLeads || 0)} total={data?.leads?.total || 1} color="#F59E0B" />
                <FunnelRow label="Qualified" val={data?.leads?.qualified || 0} total={data?.leads?.total || 1} color="#06B6D4" />
                <FunnelRow label="Converted" val={data?.leads?.converted || 0} total={data?.leads?.total || 1} color="#10B981" />
              </>
            )}
          </div>

          {/* Recent Campaigns */}
          <div className="glass rounded-2xl p-5 animate-fade-in">
            <h2 className="font-display font-semibold text-mist-100 text-sm uppercase tracking-widest mb-5">Recent Campaigns</h2>
            <div className="space-y-2">
              {loading ? (
                [1,2,3].map(i => <div key={i} className="h-12 rounded-xl skeleton" />)
              ) : (data?.campaigns?.recent || []).length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-mist-600 text-sm font-body">No campaigns yet</p>
                  <a href="/campaigns/new" className="text-electric-400 text-xs hover:underline mt-1 block">Create your first →</a>
                </div>
              ) : (data?.campaigns?.recent || []).slice(0, 5).map((c: any) => (
                <div key={c.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-ink-800/50 hover:bg-ink-700/50 transition-colors border border-ink-600/30">
                  <div>
                    <div className="text-sm font-body font-medium text-mist-200">{c.name}</div>
                    <div className="text-xs text-mist-600 capitalize">{c.type} · {c.totalLeads} leads</div>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-mono font-medium ${
                    c.status === "running"   ? "bg-neon-green/15 text-neon-green status-running" :
                    c.status === "completed" ? "bg-electric-500/15 text-electric-400" :
                    "bg-ink-600/50 text-mist-500"
                  }`}>{c.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Call stats row */}
        {!loading && data?.calls && (
          <div className="grid grid-cols-3 gap-4 mt-6 stagger">
            {[
              { label: "Avg Call Duration", value: `${Math.floor((data.calls.avgDurationSeconds || 0) / 60)}m ${(data.calls.avgDurationSeconds || 0) % 60}s`, accent: "#06B6D4" },
              { label: "Completed Calls", value: (data.calls.completed || 0).toLocaleString(), accent: "#10B981" },
              { label: "Calls This Month", value: (data.calls.month || 0).toLocaleString(), accent: "#F59E0B" },
            ].map(({ label, value, accent }) => (
              <div key={label} className="glass rounded-2xl px-5 py-4 flex items-center justify-between">
                <span className="text-xs text-mist-500 uppercase tracking-widest font-body">{label}</span>
                <span className="font-mono font-semibold text-lg" style={{ color: accent }}>{value}</span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
