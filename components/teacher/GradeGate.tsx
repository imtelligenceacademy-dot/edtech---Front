"use client";

import { useState } from "react";
import { GraduationCap, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { lastTaughtGrade } from "@/lib/teacher/prefs";
import { classStatusLine, PickCard } from "@/components/teacher/PickCard";
import type { ClassSummary } from "@/types";

// Required first step — the teacher must choose which grade they're teaching
// before the assistant is usable. Lessons + answers are scoped to it.
export function GradeGate({
  grades,
  classes,
  loading,
  onPick,
  light,
}: {
  grades: number[];
  /** One row per class of each grade — one row for a grade taught once. */
  classes: ClassSummary[];
  loading: boolean;
  onPick: (grade: number) => void;
  light: boolean;
}) {
  // Read once on mount: the value changes only by picking a grade, which
  // navigates away from this screen anyway.
  const [lastGrade] = useState(lastTaughtGrade);

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 via-brand to-brand-800 shadow-xl shadow-brand/40">
        <GraduationCap size={28} className="text-white" />
      </div>
      <h1
        className={cn(
          "bg-clip-text text-3xl font-semibold text-transparent sm:text-4xl",
          light
            ? "bg-gradient-to-r from-slate-900 via-slate-700 to-slate-500"
            : "bg-gradient-to-r from-white via-slate-200 to-slate-400"
        )}
      >
        What grade are we teaching?
      </h1>
      <p className={cn("mt-3 text-sm", light ? "text-slate-600" : "text-slate-400")}>
        Pick the grade for this session — your lessons and the assistant will be
        scoped to it.
      </p>

      {loading ? (
        <div
          className={cn(
            "mt-8 flex items-center gap-2 text-sm",
            light ? "text-slate-500" : "text-slate-400"
          )}
        >
          <Loader2 size={16} className="animate-spin" /> Loading your grades…
        </div>
      ) : grades.length === 0 ? (
        <p className={cn("mt-8 text-sm", light ? "text-slate-500" : "text-slate-400")}>
          You have no assigned lessons yet. Ask your administrator to assign you a
          lesson.
        </p>
      ) : (
        <div className="mt-8 grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {grades.map((g) => (
            <GradeCard
              key={g}
              grade={g}
              classes={classes.filter((c) => c.grade === g)}
              lastTaught={g === lastGrade}
              onPick={onPick}
              light={light}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// One grade, with enough of its state to choose without guessing: how far
// through the grade they are, and which lesson opens next.
export function GradeCard({
  grade,
  classes,
  lastTaught,
  onPick,
  light,
}: {
  grade: number;
  classes: ClassSummary[];
  lastTaught: boolean;
  onPick: (grade: number) => void;
  light: boolean;
}) {
  // A grade taught more than once has no single "next lesson" — each class is
  // at its own point — so the card totals the work across them and leaves the
  // detail to the class picker behind it. For the ordinary grade, taught once,
  // there is exactly one class here and the card reads as it always has.
  const many = classes.length > 1;
  const line = many
    ? {
        status: `${classes.length} classes — pick one`,
        statusIsNext: false,
        title: undefined,
      }
    : classes[0]
    ? classStatusLine(classes[0])
    : { status: "No lesson open yet", statusIsNext: false, title: undefined };

  return (
    <PickCard
      kindLabel="Grade"
      value={String(grade)}
      status={line.status}
      statusIsNext={line.statusIsNext}
      title={line.title}
      done={classes.reduce((n, c) => n + c.completed, 0)}
      total={classes.reduce((n, c) => n + c.total, 0)}
      highlighted={lastTaught}
      highlightLabel="Last taught"
      onPick={() => onPick(grade)}
      light={light}
    />
  );
}
