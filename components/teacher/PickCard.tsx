"use client";

import { cn } from "@/lib/utils";
import type { ClassSummary } from "@/types";
import { descriptivePart } from "@/lib/teacher/lesson-order";
import { formatUnlockDate } from "@/lib/teacher/lesson-copy";

// The card both teacher pickers are built from — the grade gate and, for a
// teacher who takes a grade more than once, the class gate that follows it.
// Purely presentational, so the two screens cannot drift apart: they choose the
// label and the numbers, this decides how a choice looks.
export function PickCard({
  kindLabel,
  value,
  status,
  statusIsNext,
  done,
  total,
  highlighted,
  highlightLabel,
  title,
  onPick,
  light,
}: {
  /** "Grade" or "Class" — the small caps word above the value. */
  kindLabel: string;
  /** "6" or "A" — what is being chosen. */
  value: string;
  /** One line saying what happens if they pick this. */
  status: string;
  /** Colours the status line as a live next step rather than a note. */
  statusIsNext: boolean;
  done: number;
  total: number;
  highlighted: boolean;
  highlightLabel?: string;
  title?: string;
  onPick: () => void;
  light: boolean;
}) {
  return (
    <button
      onClick={onPick}
      className={cn(
        "group flex flex-col gap-2 rounded-2xl border px-5 py-4 text-left transition hover:border-brand/50",
        highlighted
          ? "border-brand/40 bg-white shadow-lg shadow-brand/10"
          : light
          ? "border-slate-200 bg-white/70 hover:bg-white"
          : "border-white/10 bg-white/5 hover:bg-white/10"
      )}
    >
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "text-[11px] uppercase tracking-wider",
            light ? "text-slate-400" : "text-slate-500"
          )}
        >
          {kindLabel}
        </span>
        <span
          className={cn(
            "text-2xl font-semibold leading-none",
            light ? "text-slate-900" : "text-white"
          )}
        >
          {value}
        </span>
        {highlighted && highlightLabel && (
          <span className="ml-auto rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">
            {highlightLabel}
          </span>
        )}
      </div>

      <p
        className={cn(
          "truncate text-[11px]",
          statusIsNext ? "text-brand-700" : light ? "text-slate-500" : "text-slate-400"
        )}
        title={title ?? status}
      >
        {status}
      </p>

      <div className="flex items-center gap-2">
        <div
          className={cn(
            "h-1 flex-1 overflow-hidden rounded-full",
            light ? "bg-slate-100" : "bg-white/10"
          )}
        >
          <div
            className="h-full bg-brand"
            style={{ width: `${total ? (done / total) * 100 : 0}%` }}
          />
        </div>
        <span
          className={cn(
            "shrink-0 text-[10px] tabular-nums",
            light ? "text-slate-500" : "text-slate-400"
          )}
        >
          {done}/{total} done
        </span>
      </div>
    </button>
  );
}

/**
 * The one line a card shows about where a class has got to.
 *
 * Kept here rather than in each gate so the grade card and the class card say
 * the same thing the same way about the same state.
 */
export function classStatusLine(summary: ClassSummary): {
  status: string;
  statusIsNext: boolean;
  title?: string;
} {
  if (summary.nextStatus === "available") {
    if (summary.lastSlide && summary.slideTotal) {
      return {
        status: `Resume · slide ${summary.lastSlide} of ${summary.slideTotal}`,
        statusIsNext: true,
        title: summary.nextTitle ?? undefined,
      };
    }
    const name = summary.nextTitle ?? "";
    return {
      status: `Next · ${descriptivePart(name) || name}`,
      statusIsNext: true,
      title: name,
    };
  }
  if (summary.nextStatus === "waiting") {
    return {
      status: `Unlocks ${formatUnlockDate(summary.availableAt)}`,
      statusIsNext: false,
    };
  }
  if (summary.total > 0 && summary.completed === summary.total) {
    return { status: "All lessons completed", statusIsNext: false };
  }
  return { status: "No lesson open yet", statusIsNext: false };
}
