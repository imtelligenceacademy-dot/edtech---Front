"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  FolderClosed,
  FolderOpen,
  Presentation,
} from "lucide-react";
import { PageHeader } from "@/components/layout/DashboardShell";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { listLessons, listProgress } from "@/lib/api";
import { gradePath, TEACHER_HOME } from "@/lib/teacher-routes";
import { courseLabel } from "@/lib/teacher/lesson-order";
import { cn, formatDate } from "@/lib/utils";
import type { Lesson, ProgressEntry } from "@/types";

// "Python · " prefix for a lesson line inside a grade folder. Older lessons
// carry no course, and then the title stands on its own.
function coursePrefix(lesson?: Lesson): string {
  const label = lesson?.course ? courseLabel(lesson.course) : null;
  return label && label !== "Lessons" ? `${label} · ` : "";
}

// "Grade 7 · Python · " prefix, for lines that stand outside a grade folder.
function lessonMeta(lesson?: Lesson): string {
  if (!lesson) return "";
  return `Grade ${lesson.grade} · ${coursePrefix(lesson)}`;
}

function isCompleted(p: ProgressEntry): boolean {
  return p.status === "completed" || p.percentComplete >= 100;
}

// Teachers navigate by slide, so name the slide they stopped on. Rows saved
// before slide positions were recorded only carry the percentage.
function positionLabel(p: ProgressEntry): string {
  if (p.lastSlide && p.slideTotal) return `Slide ${p.lastSlide} of ${p.slideTotal}`;
  return `${p.percentComplete}% read`;
}

type GradeFolderData = {
  grade: number | null;
  // The class this folder is for. "" for the single unnamed class most
  // teachers have, and then no class is named on the folder at all.
  section: string;
  lessons: { entry: ProgressEntry; lesson?: Lesson }[];
  lastCompletedAt?: string;
};

// A year's worth of finished lessons is a long flat list, and a teacher reads
// it by grade — "what has Grade 7 done" — so each grade is its own folder.
function GradeFolder({
  folder,
  defaultOpen,
}: {
  folder: GradeFolderData;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const count = folder.lessons.length;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 bg-slate-50/70 px-4 py-3 text-left transition hover:bg-slate-100"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-brand-600 shadow-sm">
          {open ? <FolderOpen size={16} /> : <FolderClosed size={16} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-slate-900">
            {folder.grade === null ? "Other lessons" : `Grade ${folder.grade}`}
            {folder.section ? ` · Class ${folder.section}` : ""}
          </span>
          <span className="text-xs text-slate-500">
            {count} lesson{count === 1 ? "" : "s"} · last completed{" "}
            {formatDate(folder.lastCompletedAt)}
          </span>
        </span>
        <ChevronDown
          size={16}
          className={cn("shrink-0 text-slate-400 transition", open && "rotate-180")}
        />
      </button>

      {open && (
        <ul className="divide-y divide-slate-100">
          {folder.lessons.map(({ entry, lesson }) => (
            <li key={entry.id} className="flex items-center gap-3 px-4 py-3">
              <CheckCircle2 size={15} className="shrink-0 text-emerald-500" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-slate-800">
                  {lesson?.title ?? "Lesson"}
                </span>
                <span className="text-[11px] text-slate-500">
                  {coursePrefix(lesson)}
                  Completed {formatDate(entry.lastOpenedAt)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
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

  // Finished lessons, filed by grade: grades ascending, and inside each one the
  // curriculum order the teacher taught them in.
  // Filed by grade and class: a teacher who takes 6A and 6B taught each lesson
  // twice, and one folder holding both copies would read as a duplicate rather
  // than as two classes.
  const gradeFolders: GradeFolderData[] = (() => {
    const byGrade = new Map<string, GradeFolderData>();
    for (const entry of completed) {
      const lesson = lessonOf(entry);
      const grade = lesson?.grade ?? null;
      const key = `${grade}|${entry.section}`;
      const folder =
        byGrade.get(key) ?? { grade, section: entry.section, lessons: [] };
      folder.lessons.push({ entry, lesson });
      if (!folder.lastCompletedAt || (entry.lastOpenedAt ?? "") > folder.lastCompletedAt) {
        folder.lastCompletedAt = entry.lastOpenedAt;
      }
      byGrade.set(key, folder);
    }
    const folders: GradeFolderData[] = Array.from(byGrade.values());
    for (const folder of folders) {
      folder.lessons.sort(
        (a: { lesson?: Lesson }, b: { lesson?: Lesson }) =>
          (a.lesson?.lessonNo ?? 0) - (b.lesson?.lessonNo ?? 0)
      );
    }
    folders.sort(
      (a, b) =>
        (a.grade ?? 99) - (b.grade ?? 99) || a.section.localeCompare(b.section)
    );
    return folders;
  })();

  // Open the grade they finished something in most recently; the rest stay
  // filed away.
  // Opened by default: the exact folder they last finished something in, class
  // included, so a teacher of 6A and 6B lands on the one they just taught.
  const mostRecentFolder =
    completed.length > 0
      ? `${lessonOf(completed[0])?.grade ?? null}|${completed[0].section}`
      : null;

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
            href={TEACHER_HOME}
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
          value={
            inProgress
              ? inProgress.lastSlide && inProgress.slideTotal
                ? `Slide ${inProgress.lastSlide}`
                : `${inProgress.percentComplete}%`
              : "—"
          }
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
                  href={
                    inProgressLesson
                      ? gradePath(inProgressLesson.grade)
                      : TEACHER_HOME
                  }
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
                <span className="shrink-0 text-right text-xs tabular-nums text-slate-500">
                  {positionLabel(inProgress)}
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
        <CardHeader
          title="Completed lessons"
          subtitle={
            completed.length > 0
              ? `${completed.length} across ${gradeFolders.length} grade${
                  gradeFolders.length === 1 ? "" : "s"
                }`
              : undefined
          }
        />
        <CardBody className="space-y-2">
          {completed.length === 0 ? (
            <p className="text-sm text-slate-500">
              You haven&apos;t completed a lesson yet.
            </p>
          ) : (
            gradeFolders.map((folder) => (
              <GradeFolder
                key={`${folder.grade ?? "other"}|${folder.section}`}
                folder={folder}
                defaultOpen={
                  `${folder.grade}|${folder.section}` === mostRecentFolder
                }
              />
            ))
          )}
        </CardBody>
      </Card>
    </>
  );
}
