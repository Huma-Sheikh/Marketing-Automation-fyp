/** Icon and colours per campaign type, used on campaign cards. */
export const TYPE_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  call:  { icon: "📞", color: "#10B981", bg: "rgba(16,185,129,0.12)" },
  email: { icon: "✉",  color: "#3B82F6", bg: "rgba(59,130,246,0.12)" },
  sms:   { icon: "💬", color: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
  mixed: { icon: "⚡", color: "#8B5CF6", bg: "rgba(139,92,246,0.12)" },
};

/** Channel options offered by the new-campaign wizard. */
export const CAMPAIGN_TYPES = [
  { id: "call",  label: "Calls Only",        icon: "📞", desc: "AI voice calls to leads",       color: "#10B981" },
  { id: "email", label: "Email Only",        icon: "✉",  desc: "Personalized email outreach",   color: "#3B82F6" },
  { id: "sms",   label: "SMS Only",          icon: "💬", desc: "Short message campaigns",       color: "#F59E0B" },
  { id: "mixed", label: "Call + Email + SMS", icon: "⚡", desc: "Maximum reach across channels", color: "#8B5CF6" },
];

export const usesCalls = (t: string) => t === "call" || t === "mixed";
export const usesEmail = (t: string) => t === "email" || t === "mixed";
export const usesSms   = (t: string) => t === "sms" || t === "mixed";
