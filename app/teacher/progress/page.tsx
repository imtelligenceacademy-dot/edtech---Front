"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Presentation } from "lucide-react";
import { PageHeader } from "@/components/layout/DashboardShell";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { listLessons, listProgress } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { Lesson, ProgressEntry } from "@/types";

// "Grade 7 · Python · " prefix for a lesson line. Older lessons carry no
// course, in which case the grade stands on its own.
function lessonMeta(lesson?: Lesson): string {
  if (!lesson) return "";
  const course =
    lesson.course === "python"
      ? "Python"
      : lesson.course === "microbit"
      ? "micro:bit"
      : null;
  return `Grade ${lesson.grade}${course ? ` · ${course}` : ""} · `;
}

function isCompleted(p: ProgressEntry): boolean {
  return p.status === "completed" || p.percentComplete >= 100;
}

// A teacher only ever sees their own finished work plus the one lesson they
// still have open — never the lessons ahead of them, and never the watchdog /
// "late" signals, which exist for administrators.
export default function TeacherProgressPage() {
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([listProgress(), listLessons()])
      .then(([progressRows, lessonRows]) => {
        setProgress(progressRows);
        setLessons(lessonRows);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const lessonOf = (p: ProgressEntry) => lessons.find((l) => l.id === p.lessonId);

  // Most recently touched first — the API already orders by updated_at, but the
  // teacher's mental model is "when did I last open it".
  const byLastOpened = (a: ProgressEntry, b: ProgressEntry) =>
    (b.lastOpenedAt ?? "").localeCompare(a.lastOpenedAt ?? "");

  const completed = progress.filter(isCompleted).sort(byLastOpened);
  // "Where you left off" = the last lesson they opened that isn't finished.
  const inProgress =
    progress
      .filter((p) => !isCompleted(p) && Boolean(p.lastOpenedAt))
      .sort(byLastOpened)[0] ?? null;
  const inProgressLesson = inProgress ? lessonOf(inProgress) : undefined;

  if (loading) {
    return (
      <>
        <PageHeader title="Your progress" subtitle="Your finished lessons and where you left off." />
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="h-[92px] animate-pulse rounded-xl bg-slate-100" />
          <div className="h-[92px] animate-pulse rounded-xl bg-slate-100" />
        </div>
        <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Your progress"
        subtitle="Your finished lessons and where you left off."
        actions={
          <Link
            href="/teacher/ai"
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-brand to-brand-700 px-3.5 py-2 text-sm font-medium text-white shadow-lg shadow-brand/30 transition hover:brightness-110"
          >
            Back to lessons <ArrowRight size={14} />
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label="Lessons completed"
          value={completed.length}
          icon={<CheckCircle2 size={18} />}
        />
        <StatCard
          label="Currently open"
          value={inProgress ? `${inProgress.percentComplete}%` : "—"}
          delta={
            inProgress
              ? inProgressLesson?.title ?? "In progress"
              : "No lesson in progress"
          }
          icon={<Presentation size={18} />}
        />
      </div>

      <Card className="mb-6">
        <CardHeader title="Where you left off" />
        <CardBody>
          {inProgress ? (
            <div className="rounded-lg border border-brand/30 bg-brand-50/50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h4 className="truncate font-medium text-slate-900">
                    {inProgressLesson?.title ?? "Your current lesson"}
                  </h4>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {lessonMeta(inProgressLesson)}
                    Last opened {formatDate(inProgress.lastOpenedAt)}
                  </p>
                </div>
                <Link
                  href="/teacher/ai"
                  className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Continue
                </Link>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white">
                  <div
                    className="h-full bg-brand"
                    style={{ width: `${inProgress.percentComplete}%` }}
                  />
                </div>
                <span className="w-24 text-right text-xs tabular-nums text-slate-500">
                  {inProgress.percentComplete}% read
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              You don&apos;t have a lesson in progress. Open your next lesson from
              the assistant and it will show up here.
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Completed lessons" />
        <CardBody className="space-y-3">
          {completed.length === 0 ? (
            <p className="text-sm text-slate-500">
              You haven&apos;t completed a lesson yet.
            </p>
          ) : (
            completed.map((p) => {
              const l = lessonOf(p);
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 p-4"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <CheckCircle2 size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate font-medium text-slate-900">
                      {l?.title ?? "Lesson"}
                    </h4>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {lessonMeta(l)}
                      Completed {formatDate(p.lastOpenedAt)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </CardBody>
      </Card>
    </>
  );
}
