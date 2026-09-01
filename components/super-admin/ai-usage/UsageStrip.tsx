"use client";

import { dayLabel } from "@/lib/super-admin/ai-usage";
import { cn } from "@/lib/utils";
import type { AIUsageDay } from "@/types";

// One bar per day, oldest on the left.
//
// The bars are scaled against the busiest day across the whole table, not each
// teacher's own peak, so two rows can be compared by eye — per-row scaling
// would draw one question and twelve questions at the same height.
//
// A day with no questions still gets a visible baseline tick. An empty gap
// reads as "no data"; a flat tick reads as "nothing happened", which is what it
// actually means and often the thing worth noticing.
export function UsageStrip({
  days,
  peak,
  className,
}: {
  days: AIUsageDay[];
  peak: number;
  className?: string;
}) {
  return (
    <div
      className={cn("flex h-8 items-end gap-[3px]", className)}
      role="img"
      aria-label={ariaSummary(days)}
    >
      {days.map((day) => {
        const ratio = peak > 0 ? day.count / peak : 0;
        return (
          <span
            key={day.date}
            // Native title so the exact figure is one hover away without
            // dragging a tooltip library in for it.
            title={`${dayLabel(day.date)} — ${day.count} ${
              day.count === 1 ? "question" : "questions"
            }`}
            className="flex h-full w-2 items-end justify-center"
          >
            <span
              className={cn(
                "w-full rounded-[2px]",
                day.count > 0 ? "bg-brand-500" : "bg-slate-200"
              )}
              style={{
                // 2px keeps an empty day as a baseline tick rather than a gap.
                height: day.count > 0 ? `${Math.max(12, ratio * 100)}%` : "2px",
              }}
            />
          </span>
        );
      })}
    </div>
  );
}

function ariaSummary(days: AIUsageDay[]): string {
  const total = days.reduce((acc, d) => acc + d.count, 0);
  if (days.length === 0) return "No daily data";
  if (total === 0) return `No questions in the last ${days.length} days`;
  const busiest = days.reduce((a, b) => (b.count > a.count ? b : a));
  return `${total} questions over the last ${days.length} days; busiest was ${dayLabel(
    busiest.date
  )} with ${busiest.count}`;
}

/** The strip's key, shown once above the table rather than on every row. */
export function StripLegend({ days, peak }: { days: number; peak: number }) {
  return (
    <span className="inline-flex items-center gap-2 text-[11px] text-slate-500">
      <span className="flex h-3 items-end gap-[3px]" aria-hidden>
        <span className="h-[2px] w-2 rounded-[2px] bg-slate-200" />
        <span className="h-1.5 w-2 rounded-[2px] bg-brand-500" />
        <span className="h-3 w-2 rounded-[2px] bg-brand-500" />
      </span>
      One bar per day, oldest first · last {days} days · tallest bar = {peak}{" "}
      {peak === 1 ? "question" : "questions"} in a day
    </span>
  );
}
