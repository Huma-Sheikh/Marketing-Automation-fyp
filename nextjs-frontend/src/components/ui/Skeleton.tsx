import React from "react";

/** Shimmering placeholder block shown while data loads. */
export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} />;
}

/** Renders `count` skeletons with the same classes. */
export function SkeletonList({ count, className }: { count: number; className?: string }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={className} />
      ))}
    </>
  );
}
