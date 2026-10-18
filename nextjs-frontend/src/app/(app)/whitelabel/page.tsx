"use client";
import { Alert, Card, EmptyState, PageHeader } from "@/components/ui";
import { AgencyCard } from "@/features/whitelabel/components/AgencyCard";
import { AgencyForm } from "@/features/whitelabel/components/AgencyForm";
import { useWhitelabel } from "@/features/whitelabel/hooks/useWhitelabel";

export default function WhitelabelPage() {
  const { agencies, error, reload, showForm, setShowForm, form, setField, saving, create, remove } = useWhitelabel();

  return (
    <>
      <PageHeader
        title="White-Label"
        subtitle="Give clients their own branded platform"
        action={
          <button onClick={() => setShowForm(!showForm)}
            className="btn-press flex items-center gap-2 bg-neon-teal/20 hover:bg-neon-teal/30 border border-neon-teal/30 text-neon-teal px-5 py-2.5 rounded-xl text-sm font-display font-semibold transition-all">
            {showForm ? "✕ Cancel" : "+ Add Agency"}
          </button>
        }
      />

      <Alert className="mb-6" onRetry={reload}>{error}</Alert>

      {showForm && <AgencyForm form={form} setField={setField} saving={saving} onSubmit={create} />}

      {agencies.length === 0 && !showForm ? (
        !error && (
          <Card className="p-16 text-center border border-ink-600/30">
            <EmptyState
              icon="🏷️"
              title="No agencies yet"
              description="Create a white-label agency to give clients their own branded version of your platform."
              action={
                <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 bg-neon-teal/20 border border-neon-teal/30 text-neon-teal px-6 py-2.5 rounded-xl font-display font-semibold text-sm hover:bg-neon-teal/30 transition-all">
                  Add First Agency →
                </button>
              }
            />
          </Card>
        )
      ) : (
        <div className="space-y-3 stagger">
          {agencies.map((a) => (
            <AgencyCard key={a.id} a={a} onDelete={remove} />
          ))}
        </div>
      )}
    </>
  );
}
