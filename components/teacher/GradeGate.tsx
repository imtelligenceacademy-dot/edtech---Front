"use client";

import { useState } from "react";
import { GraduationCap, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { byLessonNo, descriptivePart } from "@/lib/teacher/lesson-order";
import { formatUnlockDate } from "@/lib/teacher/lesson-copy";
import { lastTaughtGrade } from "@/lib/teacher/prefs";
import type { Lesson, ProgressEntry } from "@/types";

// Required first step — the teacher must choose which grade they're teaching
// before the assistant is usable. Lessons + answers are scoped to it.
export function GradeGate({
  grades,
  lessons,
  progressByLesson,
  loading,
  onPick,
  light,
}: {
  grades: number[];
  lessons: Lesson[];
  progressByLesson: Record<string, ProgressEntry>;
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
              lessons={lessons.filter((l) => l.grade === g)}
              progressByLesson={progressByLesson}
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


// One grade, with enough of its state to choose without guessing: how far
// through the grade they are, and which lesson opens next.
export function GradeCard({
  grade,
  lessons,
  progressByLesson,
  lastTaught,
  onPick,
  light,
}: {
  grade: number;
  lessons: Lesson[];
  progressByLesson: Record<string, ProgressEntry>;
  lastTaught: boolean;
  onPick: (grade: number) => void;
  light: boolean;
}) {
  const ordered = [...lessons].sort(byLessonNo);
  const done = ordered.filter((l) => l.accessStatus === "completed").length;
  const next = ordered.find((l) => (l.accessStatus ?? "available") === "available");
  const waiting = ordered.find((l) => l.accessStatus === "waiting");
  const progress = next ? progressByLesson[next.id] : undefined;

  // One line saying what happens if they pick this grade.
  const status = next
    ? progress?.lastSlide && progress.slideTotal
      ? `Resume · slide ${progress.lastSlide} of ${progress.slideTotal}`
      : `Next · ${descriptivePart(next.title) || next.title}`
    : waiting
    ? `Unlocks ${formatUnlockDate(waiting.availableAt)}`
    : done === ordered.length && ordered.length > 0
    ? "All lessons completed"
    : "No lesson open yet";

  return (
    <button
      onClick={() => onPick(grade)}
      className={cn(
        "group flex flex-col gap-2 rounded-2xl border px-5 py-4 text-left transition hover:border-brand/50",
        lastTaught
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
          Grade
        </span>
        <span
          className={cn(
            "text-2xl font-semibold leading-none",
            light ? "text-slate-900" : "text-white"
          )}
        >
          {grade}
        </span>
        {lastTaught && (
          <span className="ml-auto rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">
            Last taught
          </span>
        )}
      </div>

      <p
        className={cn(
          "truncate text-[11px]",
          next ? "text-brand-700" : light ? "text-slate-500" : "text-slate-400"
        )}
        title={next ? next.title : status}
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
            style={{
              width: `${ordered.length ? (done / ordered.length) * 100 : 0}%`,
            }}
          />
        </div>
        <span
          className={cn(
            "shrink-0 text-[10px] tabular-nums",
            light ? "text-slate-500" : "text-slate-400"
          )}
        >
          {done}/{ordered.length} done
        </span>
      </div>
    </button>
  );
}
