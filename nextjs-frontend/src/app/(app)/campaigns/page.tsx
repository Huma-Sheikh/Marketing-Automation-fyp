"use client";
import Link from "next/link";
import { Alert, Card, EmptyState, PageHeader, SkeletonList } from "@/components/ui";
import { CampaignCard } from "@/features/campaigns/components/CampaignCard";
import { useCampaigns } from "@/features/campaigns/hooks/useCampaigns";

export default function CampaignsPage() {
  const { campaigns, loading, error, actionId, runningCount, reload, start, stop, remove } = useCampaigns();

  return (
    <>
      <PageHeader
        title="Campaigns"
        subtitle={runningCount > 0
          ? <><span className="text-neon-green status-running">●</span> {runningCount} running now</>
          : "No active campaigns"}
        action={
          <Link href="/campaigns/new"
            className="btn-press flex items-center gap-2 bg-electric-600 hover:bg-electric-500 text-white px-5 py-2.5 rounded-xl text-sm font-display font-semibold shadow-glow-blue transition-all">
            + New Campaign
          </Link>
        }
      />

      <Alert className="mb-6" onRetry={reload}>{error}</Alert>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 stagger"><SkeletonList count={4} className="h-52 rounded-2xl" /></div>
      ) : campaigns.length === 0 ? (
        !error && (
          <Card className="p-16 text-center border border-ink-600/30">
            <EmptyState
              icon="📣"
              title="No campaigns yet"
              description="Create your first campaign to start reaching leads at scale."
              action={
                <Link href="/campaigns/new" className="inline-flex items-center gap-2 bg-electric-600 text-white px-6 py-2.5 rounded-xl font-display font-semibold text-sm hover:bg-electric-500 transition-all shadow-glow-blue">
                  Create Campaign →
                </Link>
              }
            />
          </Card>
        )
      ) : (
        <div className="grid grid-cols-2 gap-4 stagger">
          {campaigns.map((c) => (
            <CampaignCard key={c.id} c={c} onStart={start} onStop={stop} onDelete={remove} actionId={actionId} />
          ))}
        </div>
      )}
    </>
  );
}
