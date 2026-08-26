"use client";

import { useState } from "react";
import {
  BellRing,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Lock,
  Presentation,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { byLessonNo, courseLabel, groupLessonsByCourse } from "@/lib/teacher/lesson-order";
import { formatUnlockDate, STARTER_PROMPTS } from "@/lib/teacher/lesson-copy";
import type { Lesson, ProgressEntry } from "@/types";

export function WelcomeScreen({
  lessons,
  grade,
  progressByLesson,
  onOpenLesson,
  onRequestAccess,
  onPrompt,
  requestedLessonIds,
  light,
}: {
  lessons: Lesson[];
  grade: number;
  progressByLesson: Record<string, ProgressEntry>;
  onOpenLesson: (lesson: Lesson) => void;
  onRequestAccess: (lesson: Lesson) => void;
  onPrompt: (text: string) => void;
  requestedLessonIds: Set<string>;
  light: boolean;
}) {
  const [showCompleted, setShowCompleted] = useState(false);

  const ordered = [...lessons].sort(byLessonNo);
  // Sequential unlocking means exactly one lesson is normally open — that one
  // is the whole point of this screen, so it gets the hero treatment.
  const current = ordered.find((l) => (l.accessStatus ?? "available") === "available");
  const completed = ordered.filter((l) => l.accessStatus === "completed");
  const upcoming = ordered.filter(
    (l) => l.accessStatus !== "completed" && l.id !== current?.id
  );
  const currentProgress = current ? progressByLesson[current.id] : undefined;
  const percent = currentProgress?.percentComplete ?? 0;
  // Teachers navigate by slide, so say which one they stopped on. Rows saved
  // before slide positions were recorded only have the percentage.
  const position =
    currentProgress?.lastSlide && currentProgress.slideTotal
      ? `Slide ${currentProgress.lastSlide} of ${currentProgress.slideTotal}`
      : percent > 0
      ? `${percent}% read`
      : null;

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center py-6 text-center sm:py-10">
      <img
        src="/logo.png"
        alt="IM-Telligence"
        className="mb-6 h-16 w-16 rounded-2xl bg-white object-contain p-1.5 shadow-xl shadow-brand/40"
      />
      <h1
        className={cn(
          "bg-clip-text text-3xl font-semibold text-transparent sm:text-4xl",
          light
            ? "bg-gradient-to-r from-slate-900 via-slate-700 to-slate-500"
            : "bg-gradient-to-r from-white via-slate-200 to-slate-400"
        )}
      >
        How can I help you teach today?
      </h1>
      <p className={cn("mt-3 text-sm", light ? "text-slate-600" : "text-slate-400")}>
        Teaching <span className="font-medium">Grade {grade}</span>. Open your
        lesson to present it, or ask me a question.
      </p>

      {lessons.length === 0 && (
        <p className={cn("mt-6 text-sm", light ? "text-slate-500" : "text-slate-400")}>
          No lessons assigned for Grade {grade} yet.
        </p>
      )}

      {/* The lesson they're on — one obvious thing to click. */}
      {current && (
        <button
          onClick={() => onOpenLesson(current)}
          className="mt-8 w-full rounded-2xl border border-brand/30 bg-white p-5 text-left shadow-lg shadow-brand/10 transition hover:border-brand/60 hover:shadow-brand/20"
        >
          <div className="flex items-center gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-700 text-white shadow-lg shadow-brand/30">
              <Presentation size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium uppercase tracking-wider text-brand-600">
                {percent > 0 ? "Continue where you left off" : "Your current lesson"}
                {current.course ? ` · ${courseLabel(current.course)}` : ""}
              </p>
              <p className="mt-0.5 truncate text-base font-semibold text-slate-900">
                {current.title}
              </p>
            </div>
            <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-br from-brand to-brand-700 px-3.5 py-2 text-xs font-medium text-white shadow-lg shadow-brand/30">
              {percent > 0 ? "Continue" : "Open lesson"}
              <ChevronRight size={13} />
            </span>
          </div>
          {percent > 0 && (
            <div className="mt-4 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-brand" style={{ width: `${percent}%` }} />
              </div>
              <span className="shrink-0 text-right text-[11px] tabular-nums text-slate-500">
                {position}
              </span>
            </div>
          )}
        </button>
      )}

      {/* Openers, so the assistant isn't a blank box. */}
      {lessons.length > 0 && (
        <div className="mt-5 flex w-full flex-wrap justify-center gap-2">
          {STARTER_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => onPrompt(prompt)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[11px] transition",
                light
                  ? "border-slate-200 bg-white/70 text-slate-600 hover:border-brand/40 hover:text-brand-700"
                  : "border-white/10 bg-white/5 text-slate-300 hover:border-brand/40"
              )}
            >
              <Sparkles size={12} className="text-brand-600" /> {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Everything still ahead of them — locked or waiting out its period. */}
      {upcoming.length > 0 && (
        <div className="mt-8 w-full space-y-6 text-left">
          {groupLessonsByCourse(upcoming).map(({ course, items }) => (
            <div key={course ?? "default"}>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                {courseLabel(course)}
              </p>
              <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                {items.map((l) => (
                  <LessonChip
                    key={l.id}
                    lesson={l}
                    onOpen={onOpenLesson}
                    onRequestAccess={onRequestAccess}
                    requested={requestedLessonIds.has(l.id)}
                    light={light}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Finished lessons are history — folded away until asked for. */}
      {completed.length > 0 && (
        <div className="mt-6 w-full text-left">
          <button
            onClick={() => setShowCompleted((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 text-[11px] font-medium transition",
              light ? "text-slate-500 hover:text-slate-800" : "text-slate-400 hover:text-white"
            )}
          >
            <CheckCircle2 size={12} className="text-emerald-500" />
            {showCompleted ? "Hide" : "Show"} {completed.length} completed lesson
            {completed.length === 1 ? "" : "s"}
            <ChevronDown
              size={12}
              className={cn("transition", showCompleted && "rotate-180")}
            />
          </button>
          {showCompleted && (
            <div className="mt-2 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
              {completed.map((l) => (
                <LessonChip
                  key={l.id}
                  lesson={l}
                  onOpen={onOpenLesson}
                  onRequestAccess={onRequestAccess}
                  requested={requestedLessonIds.has(l.id)}
                  light={light}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// A lesson tile in the welcome list. Reflects the sequential-unlock state:
// available lessons open normally; completed/waiting/locked ones show why and,
// when clicked, surface a "ask your admin" message in the chat.
export function LessonChip({
  lesson,
  onOpen,
  onRequestAccess,
  requested,
  light,
}: {
  lesson: Lesson;
  onOpen: (lesson: Lesson) => void;
  onRequestAccess: (lesson: Lesson) => void;
  requested: boolean;
  light: boolean;
}) {
  const status = lesson.accessStatus ?? "available";
  const locked = status !== "available";

  const meta = {
    available: { Icon: Presentation, label: lesson.fileId ? "PDF" : "Slides", tone: "" },
    completed: { Icon: CheckCircle2, label: "Completed", tone: "text-emerald-600" },
    waiting: {
      Icon: Clock,
      label: `Unlocks ${formatUnlockDate(lesson.availableAt)}`,
      tone: "text-amber-600",
    },
    locked: { Icon: Lock, label: "Locked", tone: "text-slate-400" },
  }[status];
  const Icon = meta.Icon;

  const body = (
    <>
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
          locked
            ? "bg-slate-100 text-slate-400"
            : "bg-slate-100 text-brand-600 group-hover:bg-brand/20"
        )}
      >
        <Icon size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate font-medium", locked && "text-slate-500")}>
          {lesson.title}
        </span>
        <span className={cn("text-[11px]", meta.tone || "text-slate-400")}>{meta.label}</span>
      </span>
    </>
  );

  // Available lessons open on click.
  if (!locked) {
    return (
      <button
        onClick={() => onOpen(lesson)}
        className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-left text-sm transition hover:border-brand/40 hover:bg-white"
      >
        {body}
      </button>
    );
  }

  // Locked lessons explain themselves in the chat when clicked (same as the
  // lesson rail), and offer a "Request access" action that pings the
  // super-admin to unlock it.
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
      <button
        onClick={() => onOpen(lesson)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        title={`Why is "${lesson.title}" not available?`}
      >
        {body}
      </button>
      {status === "completed" ? null : requested ? (
        <span className="flex shrink-0 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700">
          <CheckCircle2 size={12} /> Requested
        </span>
      ) : (
        <button
          onClick={() => onRequestAccess(lesson)}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-brand/30 bg-brand-50 px-2.5 py-1.5 text-[11px] font-medium text-brand-700 transition hover:bg-brand-100"
        >
          <BellRing size={12} /> Request access
        </button>
      )}
    </div>
  );
}
