"use client";

import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { windowNotes } from "@/lib/super-admin/ai-usage";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { AITeacherUsageReport } from "@/types";

// What each column actually counts, with the boundary it counts from.
//
// This exists because the table's numbers are only checkable if the reader can
// see where each window starts — "last 24 hours" and "today" give different
// answers on the same data, and without saying so the screen is asking to be
// misread. Collapsed by default so it does not crowd the table, but it opens
// in place rather than in a modal, so it can be read next to the columns.
export function WindowLegend({ report }: { report: AITeacherUsageReport }) {
  const [open, setOpen] = useState(false);
  const notes = windowNotes(report);

  return (
    <Card className="mb-5">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-5 py-3 text-left"
      >
        <Info size={15} className="shrink-0 text-brand-600" />
        <span className="flex-1 text-sm text-slate-700">
          <span className="font-medium text-slate-900">
            What these numbers count
          </span>{" "}
          — counted in {report.timezone}, read at {formatDate(report.generatedAt)}.
        </span>
        <ChevronDown
          size={16}
          className={cn(
            "shrink-0 text-slate-400 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 border-t border-slate-100 px-5 py-4 sm:grid-cols-2">
          {notes.map(({ term, note }) => (
            <div key={term}>
              <dt className="text-xs font-semibold text-slate-900">{term}</dt>
              <dd className="mt-0.5 text-xs leading-relaxed text-slate-600">
                {note}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}
