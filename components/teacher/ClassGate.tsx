"use client";

import { useState } from "react";
import { Loader2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { lastTaughtSection } from "@/lib/teacher/prefs";
import { classStatusLine, PickCard } from "@/components/teacher/PickCard";
import type { ClassSummary } from "@/types";

/**
 * The class gate — shown only to a teacher who takes the same grade more than
 * once, between the grade gate and their lessons.
 *
 * Each class walks the curriculum on its own: 6A can be three lessons ahead of
 * 6C, and finishing a lesson with one leaves it open for the others. So the
 * class has to be chosen before anything is recorded, and this is where.
 *
 * A teacher with one class per grade never reaches this screen, and no class is
 * named to them anywhere else either.
 */
export function ClassGate({
  grade,
  classes,
  loading,
  onPick,
  onBack,
  light,
}: {
  grade: number;
  classes: ClassSummary[];
  loading: boolean;
  onPick: (section: string) => void;
  onBack: () => void;
  light: boolean;
}) {
  // Read once on mount, like the grade gate: picking navigates away.
  const [lastSection] = useState(() => lastTaughtSection(grade));

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 via-brand to-brand-800 shadow-xl shadow-brand/40">
        <Users size={28} className="text-white" />
      </div>
      <h1
        className={cn(
          "bg-clip-text text-3xl font-semibold text-transparent sm:text-4xl",
          light
            ? "bg-gradient-to-r from-slate-900 via-slate-700 to-slate-500"
            : "bg-gradient-to-r from-white via-slate-200 to-slate-400"
        )}
      >
        Which Grade {grade} class?
      </h1>
      <p className={cn("mt-3 text-sm", light ? "text-slate-600" : "text-slate-400")}>
        Each class keeps its own progress — pick the one in front of you and
        what you record will stay with them.
      </p>

      {loading ? (
        <div
          className={cn(
            "mt-8 flex items-center gap-2 text-sm",
            light ? "text-slate-500" : "text-slate-400"
          )}
        >
          <Loader2 size={16} className="animate-spin" /> Loading your classes…
        </div>
      ) : (
        <div className="mt-8 grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((summary) => {
            const line = classStatusLine(summary);
            return (
              <PickCard
                key={summary.section}
                kindLabel="Class"
                value={summary.section}
                status={line.status}
                statusIsNext={line.statusIsNext}
                title={line.title}
                done={summary.completed}
                total={summary.total}
                highlighted={summary.section === lastSection}
                highlightLabel="Last taught"
                onPick={() => onPick(summary.section)}
                light={light}
              />
            );
          })}
        </div>
      )}

      <button
        onClick={onBack}
        // Padding pulled back out by the negative margin: a 17px-tall line of
        // text is not something a thumb can aim at.
        className={cn(
          "-mx-4 -mb-3 mt-5 px-4 py-3 text-[11px] underline-offset-4 transition hover:underline",
          light ? "text-slate-500 hover:text-slate-700" : "text-slate-400 hover:text-slate-200"
        )}
      >
        Choose a different grade
      </button>
    </div>
  );
}
