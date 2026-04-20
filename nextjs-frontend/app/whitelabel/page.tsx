"use client";
import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import { getAgencies, createAgency, deleteAgency } from "@/lib/api";

export default function WhitelabelPage() {
  const [agencies, setAgencies] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ agencyName: "", customDomain: "", primaryColor: "#2563EB", logoUrl: "" });
  const [loading, setLoading] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const load = async () => { try { setAgencies(await getAgencies()); } catch(e) { console.error(e); } };
  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try { await createAgency(form); setShowForm(false); setForm({ agencyName: "", customDomain: "", primaryColor: "#2563EB", logoUrl: "" }); await load(); }
    catch (err: any) { alert(err.message); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this agency?")) return;
    await deleteAgency(id); setAgencies(a => a.filter(x => x.id !== id));
  };

  return (
    <div className="flex bg-ink-950 min-h-screen">
      <Sidebar />
      <main className="ml-60 flex-1 p-8 page-enter">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="font-display font-bold text-2xl text-mist-100">White-Label</h1>
            <p className="text-mist-500 text-sm font-body mt-1">Give clients their own branded platform</p>
          </div>
          <button onClick={() => setShowForm(!showForm)}
            className="btn-press flex items-center gap-2 bg-neon-teal/20 hover:bg-neon-teal/30 border border-neon-teal/30 text-neon-teal px-5 py-2.5 rounded-xl text-sm font-display font-semibold transition-all">
            {showForm ? "✕ Cancel" : "+ Add Agency"}
          </button>
        </div>

        {showForm && (
          <div className="glass rounded-2xl p-6 mb-6 border border-neon-teal/20 animate-slide-up">
            <h2 className="font-display font-semibold text-mist-200 mb-5">New White-Label Agency</h2>
            <form onSubmit={handleCreate}>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs text-mist-400 uppercase tracking-widest font-body mb-2">Agency Name *</label>
                  <input type="text" value={form.agencyName} onChange={set("agencyName")} required
                    className="input-glow w-full bg-ink-800 border border-ink-600 rounded-xl px-4 py-3 text-mist-100 text-sm font-body"
                    placeholder="Acme Agency" />
                </div>
                <div>
                  <label className="block text-xs text-mist-400 uppercase tracking-widest font-body mb-2">Custom Domain</label>
                  <input type="text" value={form.customDomain} onChange={set("customDomain")}
                    className="input-glow w-full bg-ink-800 border border-ink-600 rounded-xl px-4 py-3 text-mist-100 text-sm font-body font-mono"
                    placeholder="app.acmeagency.com" />
                </div>
                <div>
                  <label className="block text-xs text-mist-400 uppercase tracking-widest font-body mb-2">Brand Color</label>
                  <div className="flex gap-2">
                    <input type="color" value={form.primaryColor} onChange={set("primaryColor")}
                      className="h-11 w-14 border border-ink-600 rounded-xl cursor-pointer bg-ink-800" />
                    <input type="text" value={form.primaryColor} onChange={set("primaryColor")}
                      className="input-glow flex-1 bg-ink-800 border border-ink-600 rounded-xl px-4 py-3 text-mist-100 text-sm font-mono" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-mist-400 uppercase tracking-widest font-body mb-2">Logo URL</label>
                  <input type="url" value={form.logoUrl} onChange={set("logoUrl")}
                    className="input-glow w-full bg-ink-800 border border-ink-600 rounded-xl px-4 py-3 text-mist-100 text-sm font-body"
                    placeholder="https://..." />
                </div>
              </div>
              <button type="submit" disabled={loading}
                className="btn-press bg-neon-teal/80 hover:bg-neon-teal text-ink-950 px-6 py-2.5 rounded-xl font-display font-bold text-sm transition-all disabled:opacity-50">
                {loading ? "Creating..." : "✓ Create Agency"}
              </button>
            </form>
          </div>
        )}

        {agencies.length === 0 && !showForm ? (
          <div className="glass rounded-2xl p-16 text-center border border-ink-600/30">
            <div className="text-5xl mb-4 animate-float">🏷️</div>
            <h2 className="font-display font-semibold text-mist-200 mb-2">No agencies yet</h2>
            <p className="text-mist-500 text-sm font-body mb-6 max-w-sm mx-auto">Create a white-label agency to give clients their own branded version of your platform.</p>
            <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 bg-neon-teal/20 border border-neon-teal/30 text-neon-teal px-6 py-2.5 rounded-xl font-display font-semibold text-sm hover:bg-neon-teal/30 transition-all">
              Add First Agency →
            </button>
          </div>
        ) : (
          <div className="space-y-3 stagger">
            {agencies.map((a: any) => (
              <div key={a.id} className="card-lift glass rounded-2xl p-5 border border-ink-600/30 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {/* Brand preview */}
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center font-display font-bold text-lg text-white flex-shrink-0"
                    style={{ background: `linear-gradient(135deg, ${a.primaryColor}, ${a.primaryColor}99)`, boxShadow: `0 0 20px ${a.primaryColor}30` }}>
                    {a.agencyName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-display font-semibold text-mist-100">{a.agencyName}</div>
                    {a.customDomain ? (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-neon-teal" />
                        <span className="text-sm text-neon-teal font-mono">{a.customDomain}</span>
                      </div>
                    ) : (
                      <div className="text-xs text-mist-600 font-body mt-0.5">No custom domain set</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-center">
                    <div className="text-xs text-mist-600 font-body">Color</div>
                    <div className="w-6 h-6 rounded-lg mt-1" style={{ background: a.primaryColor }} />
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-mono font-medium ${a.status === "active" ? "bg-neon-green/15 text-neon-green" : "bg-neon-red/15 text-neon-red"}`}>
                    {a.status}
                  </span>
                  <button onClick={() => handleDelete(a.id)} className="text-ink-500 hover:text-neon-red transition-colors p-2 rounded-xl hover:bg-neon-red/10">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
