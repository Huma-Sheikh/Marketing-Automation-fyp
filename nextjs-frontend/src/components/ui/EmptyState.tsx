import React from "react";

type EmptyStateProps = {
  icon: React.ReactNode;
  title?: string;
  description: React.ReactNode;
  action?: React.ReactNode;
  /** Large = big floating icon and title (full-page lists); small = compact. */
  size?: "large" | "small";
};

/** Placeholder content shown when a list has no items. */
export function EmptyState({ icon, title, description, action, size = "large" }: EmptyStateProps) {
  if (size === "small") {
    return (
      <>
        <div className="text-4xl mb-3">{icon}</div>
        <p className="text-mist-500 font-body text-sm">{description}</p>
        {action}
      </>
    );
  }
  return (
    <>
      <div className="text-5xl mb-4 animate-float">{icon}</div>
      {title && <h2 className="font-display font-semibold text-mist-200 mb-2">{title}</h2>}
      <p className="text-mist-500 text-sm font-body mb-6 max-w-sm mx-auto">{description}</p>
      {action}
    </>
  );
}
