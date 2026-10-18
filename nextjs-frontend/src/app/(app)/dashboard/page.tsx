"use client";
import Link from "next/link";
import { Alert, Card, PageHeader, SectionTitle, SkeletonList } from "@/components/ui";
import { CampaignStatusBadge } from "@/features/campaigns/components/CampaignStatusBadge";
import { FunnelRow } from "@/features/dashboard/components/FunnelRow";
import { HealthDot } from "@/features/dashboard/components/HealthDot";
import { KpiCard } from "@/features/dashboard/components/KpiCard";
import { useDashboard } from "@/features/dashboard/hooks/useDashboard";

const HEALTH_PLACEHOLDER = { "STT/TTS": "—", "Leads": "—", "Business": "—", "LLM": "—" };

export default function DashboardPage() {
  const { data, updated, loading, error } = useDashboard();
  const leads = data?.leads;
  const total = leads?.total || 1;
  const recent = data?.campaigns?.recent || [];

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Real-time platform overview"
        action={
          <div className="flex items-center gap-2 bg-ink-800 px-4 py-2 rounded-xl border border-ink-600/50">
            <div className="live-dot w-2 h-2 rounded-full bg-neon-green" />
            <span className="text-xs font-mono text-mist-400">{updated ? `Updated ${updated}` : "Connecting..."}</span>
          </div>
        }
      />

      <Alert className="mb-6">{error}</Alert>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6 stagger">
        {loading ? (
          <SkeletonList count={4} className="glass rounded-2xl p-5 h-32" />
        ) : (
          <>
            <KpiCard title="Active Calls" value={data?.activeCalls || 0} icon="📞" sub="Live right now" accent="#10B981" delay={50} />
            <KpiCard title="Calls Today"  value={data?.calls?.today || 0} icon="📊" sub={`${data?.calls?.week || 0} this week`} accent="#3B82F6" delay={100} />
            <KpiCard title="Total Leads"  value={leads?.total || 0} icon="👥" sub={`${leads?.newLeads || 0} new`} accent="#F59E0B" delay={150} />
            <KpiCard title="Conversion"   value={(leads?.conversionRate || "0") + "%"} icon="🎯" sub="Leads → converted" accent="#8B5CF6" delay={200} />
          </>
        )}
      </div>

      {/* AI Health */}
      <Card className="p-5 mb-6 animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <SectionTitle>AI Services</SectionTitle>
          <span className="text-xs font-mono text-mist-600">auto-refreshing</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {Object.entries(data?.aiHealth || HEALTH_PLACEHOLDER).map(([svc, st]) => (
            <HealthDot key={svc} label={svc} status={st === "—" ? "unknown" : st} />
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-6">
        {/* Lead Funnel */}
        <Card className="p-5 animate-fade-in">
          <SectionTitle className="text-mist-100 mb-5">Lead Pipeline</SectionTitle>
          {loading ? (
            <div className="space-y-3"><SkeletonList count={4} className="h-6 rounded" /></div>
          ) : (
            <>
              <FunnelRow label="New"       val={leads?.newLeads || 0}  total={total} color="#3B82F6" />
              <FunnelRow label="Contacted" val={(leads?.total || 0) - (leads?.newLeads || 0)} total={total} color="#F59E0B" />
              <FunnelRow label="Qualified" val={leads?.qualified || 0} total={total} color="#06B6D4" />
              <FunnelRow label="Converted" val={leads?.converted || 0} total={total} color="#10B981" />
            </>
          )}
        </Card>

        {/* Recent Campaigns */}
        <Card className="p-5 animate-fade-in">
          <SectionTitle className="text-mist-100 mb-5">Recent Campaigns</SectionTitle>
          <div className="space-y-2">
            {loading ? (
              <SkeletonList count={3} className="h-12 rounded-xl" />
            ) : recent.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-mist-600 text-sm font-body">No campaigns yet</p>
                <Link href="/campaigns/new" className="text-electric-400 text-xs hover:underline mt-1 block">Create your first →</Link>
              </div>
            ) : recent.slice(0, 5).map((c) => (
              <div key={c.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-ink-800/50 hover:bg-ink-700/50 transition-colors border border-ink-600/30">
                <div>
                  <div className="text-sm font-body font-medium text-mist-200">{c.name}</div>
                  <div className="text-xs text-mist-600 capitalize">{c.type} · {c.totalLeads} leads</div>
                </div>
                <CampaignStatusBadge status={c.status} fallbackClass="bg-ink-600/50 text-mist-500" />
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Call stats row */}
      {!loading && data?.calls && (
        <div className="grid grid-cols-3 gap-4 mt-6 stagger">
          {[
            { label: "Avg Call Duration", value: `${Math.floor((data.calls.avgDurationSeconds || 0) / 60)}m ${(data.calls.avgDurationSeconds || 0) % 60}s`, accent: "#06B6D4" },
            { label: "Completed Calls", value: (data.calls.completed || 0).toLocaleString(), accent: "#10B981" },
            { label: "Calls This Month", value: (data.calls.month || 0).toLocaleString(), accent: "#F59E0B" },
          ].map(({ label, value, accent }) => (
            <Card key={label} className="px-5 py-4 flex items-center justify-between">
              <span className="text-xs text-mist-500 uppercase tracking-widest font-body">{label}</span>
              <span className="font-mono font-semibold text-lg" style={{ color: accent }}>{value}</span>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
