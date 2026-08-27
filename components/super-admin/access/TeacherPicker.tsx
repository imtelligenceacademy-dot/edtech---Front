"use client";

import { Check, Minus, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { CardBody, CardHeader } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import {
  assignedCount,
  autoMatches,
  coverageOf,
  shownState,
  type Intent,
} from "@/lib/super-admin/access";
import type { Lesson, User } from "@/types";

/**
 * Column 3, now answering for the whole selection rather than one lesson.
 *
 * A teacher who has eight of the twelve lessons you ticked reads "8 of 12"
 * with a dashed box; clicking fills the rest, clicking again takes them all
 * away, and a third click puts it back how it was. That mixed state is the
 * thing the old one-lesson-at-a-time page could never show.
 */
export function TeacherPicker({
  teachers,
  selection,
  intents,
  onToggle,
}: {
  teachers: User[];
  selection: Lesson[];
  intents: Record<string, Intent>;
  onToggle: (teacherId: string) => void;
}) {
  const many = selection.length > 1;

  return (
    <>
      <CardHeader
        title="3. Teachers"
        subtitle={
          selection.length === 0
            ? "Pick some lessons first"
            : many
            ? `Coverage across ${selection.length} selected lessons`
            : "Assigned to the selected lesson"
        }
      />
      <CardBody className="space-y-2">
        {teachers.length === 0 && (
          <p className="text-xs text-slate-500">No active teachers in this school.</p>
        )}
        {teachers.map((t) => {
          const coverage = coverageOf(t.id, selection);
          const intent = intents[t.id];
          const shown = shownState(intent, coverage);
          const have = assignedCount(t.id, selection);
          // "Auto" only when the rules already cover every selected lesson —
          // a partial match would be a promise the uploader doesn't keep.
          const auto =
            selection.length > 0 && selection.every((l) => autoMatches(l, t));
          const isException = selection.length > 0 && (shown === "all") !== auto;

          return (
            <button
              key={t.id}
              onClick={() => onToggle(t.id)}
              disabled={selection.length === 0}
              className={cn(
                "flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:opacity-50",
                intent
                  ? intent === "add"
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-red-200 bg-red-50"
                  : shown === "none"
                  ? "border-slate-200 hover:bg-slate-50"
                  : "border-brand bg-brand-50"
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                  shown === "all"
                    ? "border-brand bg-brand text-white"
                    : shown === "some"
                    ? "border-brand bg-white text-brand"
                    : "border-slate-300 bg-white"
                )}
                aria-hidden
              >
                {shown === "all" && <Check size={11} strokeWidth={3} />}
                {shown === "some" && <Minus size={11} strokeWidth={3} />}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block font-medium text-slate-900">{t.name}</span>
                <span className="block truncate text-xs text-slate-500">{t.email}</span>
                <span className="mt-1 flex flex-wrap items-center gap-1">
                  {many && (
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                        coverage === "all"
                          ? "bg-brand-50 text-brand-700"
                          : coverage === "some"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-slate-100 text-slate-500"
                      )}
                      title="How many of the selected lessons they already have"
                    >
                      {have} of {selection.length}
                    </span>
                  )}
                  {auto && <Badge tone="muted">Auto</Badge>}
                  {isException && (
                    <Badge tone="warning">
                      <Wand2 size={10} /> {shown === "all" ? "Added" : "Removed"} override
                    </Badge>
                  )}
                  {intent && (
                    <Badge tone={intent === "add" ? "success" : "danger"}>
                      {intent === "add" ? "will be added" : "will be removed"}
                    </Badge>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </CardBody>
    </>
  );
}
