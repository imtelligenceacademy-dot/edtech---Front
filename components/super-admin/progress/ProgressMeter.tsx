"use client";

import { cn } from "@/lib/utils";
import type { LessonState } from "@/lib/super-admin/progress";

// One bar, three states, no red.
//
// Red would be the page making a judgement, and this page does not make one -
// an unstarted lesson is a lesson the teacher has not reached yet, not a
// failure. So the palette runs from the brand colour for done, through a pale
// tint for in progress, to plain grey for untouched, and nothing on the page
// ever shouts.

export const STATE_FILL: Record<LessonState, string> = {
  finished: "bg-brand",
  "in-progress": "bg-brand-200",
  "not-started": "bg-slate-200",
};

export const STATE_DOT: Record<LessonState, string> = {
  finished: "bg-brand",
  "in-progress": "bg-brand-200",
  "not-started": "bg-slate-300",
};

export const ORDER: LessonState[] = ["finished", "in-progress", "not-started"];

export function ProgressMeter({
  finished,
  inProgress,
  notStarted,
  className,
  height = "h-1.5",
}: {
  finished: number;
  inProgress: number;
  notStarted: number;
  className?: string;
  height?: string;
}) {
  const total = finished + inProgress + notStarted;
  if (total === 0) {
    return <div className={cn(height, "rounded-full bg-slate-100", className)} />;
  }
  const parts: [LessonState, number][] = [
    ["finished", finished],
    ["in-progress", inProgress],
    ["not-started", notStarted],
  ];
  return (
    <div className={cn("flex overflow-hidden rounded-full bg-slate-100", height, className)}>
      {parts
        .filter(([, n]) => n > 0)
        .map(([state, n]) => (
          <span
            key={state}
            className={STATE_FILL[state]}
            style={{ width: `${(n / total) * 100}%` }}
          />
        ))}
    </div>
  );
}

export function MeterLegend({
  finished,
  inProgress,
  notStarted,
  className,
}: {
  finished: number;
  inProgress: number;
  notStarted: number;
  className?: string;
}) {
  const counts: Record<LessonState, number> = {
    finished,
    "in-progress": inProgress,
    "not-started": notStarted,
  };
  const label: Record<LessonState, string> = {
    finished: "Finished",
    "in-progress": "In progress",
    "not-started": "Not started",
  };
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1", className)}>
      {ORDER.map((state) => (
        <span key={state} className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <span className={cn("h-2 w-2 rounded-sm", STATE_DOT[state])} />
          {label[state]}
          <span className="tabular-nums font-medium text-slate-700">{counts[state]}</span>
        </span>
      ))}
    </div>
  );
}
