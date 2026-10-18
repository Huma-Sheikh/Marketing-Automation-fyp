import React from "react";

type PageHeaderProps = {
  title: string;
  subtitle?: React.ReactNode;
  /** Right-aligned content such as a primary action button. */
  action?: React.ReactNode;
};

/** Title + subtitle row at the top of every authenticated page. */
export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  const heading = (
    <div>
      <h1 className="font-display font-bold text-2xl text-mist-100">{title}</h1>
      {subtitle && <p className="text-mist-500 text-sm font-body mt-1">{subtitle}</p>}
    </div>
  );
  if (!action) return <div className="mb-8">{heading}</div>;
  return (
    <div className="flex justify-between items-center mb-8">
      {heading}
      {action}
    </div>
  );
}
