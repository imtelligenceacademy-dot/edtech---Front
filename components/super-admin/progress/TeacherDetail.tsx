"use client";

import { ArrowLeft, BookOpen, Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { MeterLegend, ProgressMeter, STATE_DOT } from "./ProgressMeter";
import {
  STATE_LABEL,
  byTrack,
  courseLabel,
  filterLessons,
  whenLabel,
  type ProgressFilter,
  type TeacherLesson,
  type TeacherProgress,
} from "@/lib/super-admin/progress";

// The right pane: one teacher, every lesson they have, nothing hidden.
//
// It opens with the lesson they are actually sitting in, because "where are
// they right now" is the question and everything else on the page is context
// for it. Underneath, the full course in order, with grade headings that are
// labels rather than folders - there is no disclosure control anywhere here,
// so the answer is always one scroll away rather than one click plus a scroll.
//
// The filter is the only interaction, and it exists because "what have they
// finished" and "what is left" are two different questions people arrive with.

function LessonRow({ lesson }: { lesson: TeacherLesson }) {
  const done = lesson.state === "finished";
  const where =
    lesson.state === "in-progress"
      ? lesson.slide && lesson.slideTotal
        ? `Slide ${lesson.slide} of ${lesson.slideTotal}`
        : `${lesson.percent}% through`
      : null;

  return (
    <li className="flex items-start gap-3 px-4 py-2.5 sm:px-5">
      <span
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
          done ? "bg-brand text-white" : "border border-slate-200 bg-white"
        )}
        aria-hidden
      >
        {done ? (
          <Check size={12} strokeWidth={3} />
        ) : (
          <span className={cn("h-2 w-2 rounded-full", STATE_DOT[lesson.state])} />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm", done ? "text-slate-500" : "text-slate-900")}>
          {lesson.lessonNo !== null && (
            <span className="mr-1.5 tabular-nums text-slate-400">{lesson.lessonNo}.</span>
          )}
          {lesson.title}
        </p>
        {(where || lesson.lastOpenedAt) && (
          <p className="mt-0.5 text-[11px] text-slate-500">
            {where}
            {where && lesson.lastOpenedAt ? " · " : ""}
            {lesson.lastOpenedAt ? whenLabel(lesson.lastOpenedAt) : ""}
          </p>
        )}
      </div>

      <span
        className={cn(
          "shrink-0 self-center text-[11px] font-medium",
          done ? "text-brand-700" : lesson.state === "in-progress" ? "text-slate-700" : "text-slate-400"
        )}
      >
        {STATE_LABEL[lesson.state]}
      </span>
    </li>
  );
}

function CurrentlyOn({ teacher }: { teacher: TeacherProgress }) {
  if (teacher.assigned === 0) {
    return (
      <p className="text-sm text-slate-500">
        No lessons assigned to this teacher yet.
      </p>
    );
  }
  if (teacher.current.length === 0) {
    const done = teacher.finished === teacher.assigned;
    return (
      <p className="text-sm text-slate-600">
        {done
          ? "Finished every lesson assigned to them."
          : "Not in the middle of a lesson right now."}
      </p>
    );
  }

  // Three is enough to see what they are juggling. Beyond that this block
  // starts pushing the actual lesson list off the screen, which is the thing
  // it is meant to introduce.
  const shown = teacher.current.slice(0, 3);
  const rest = teacher.current.length - shown.length;

  return (
    <div className="space-y-2">
      {shown.map((lesson) => (
        <div
          key={lesson.lessonId}
          className="flex items-start gap-3 rounded-lg border border-brand-100 bg-brand-50/60 px-3.5 py-2.5"
        >
          <BookOpen size={15} className="mt-0.5 shrink-0 text-brand-600" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">
              Grade {lesson.grade}
              {lesson.lessonNo !== null ? ` · Lesson ${lesson.lessonNo}` : ""} —{" "}
              {lesson.title}
            </p>
            <p className="mt-0.5 text-xs text-brand-700">
              {lesson.slide && lesson.slideTotal
                ? `Stopped on slide ${lesson.slide} of ${lesson.slideTotal}`
                : `${lesson.percent}% through`}
              {lesson.lastOpenedAt ? ` · ${whenLabel(lesson.lastOpenedAt).toLowerCase()}` : ""}
            </p>
          </div>
        </div>
      ))}
      {rest > 0 && (
        <p className="text-xs text-slate-500">
          and {rest} more lesson{rest === 1 ? "" : "s"} part-way through, below.
        </p>
      )}
    </div>
  );
}

const FILTERS: [ProgressFilter, string][] = [
  ["all", "All"],
  ["unfinished", "Not finished"],
  ["finished", "Finished"],
];

export function TeacherDetail({
  teacher,
  filter,
  onFilter,
  onBack,
}: {
  teacher: TeacherProgress;
  filter: ProgressFilter;
  onFilter: (value: ProgressFilter) => void;
  /** Mobile only — the rail and the detail share one screen there. */
  onBack: () => void;
}) {
  const shown = filterLessons(teacher.lessons, filter);
  const tracks = byTrack(shown);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
        <button
          type="button"
          onClick={onBack}
          className="mb-2 -ml-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-medium text-slate-500 hover:text-slate-800 lg:hidden"
        >
          <ArrowLeft size={13} /> All teachers
        </button>

        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-base font-semibold text-slate-900">{teacher.name}</h2>
          <p className="text-xs text-slate-500">
            {teacher.schoolName}
            {teacher.grades.length > 0 ? ` · ${teacher.grades.join(", ")}` : ""}
            {teacher.language ? ` · ${teacher.language.toUpperCase()}` : ""}
          </p>
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums leading-none text-slate-900">
            {teacher.finished}
          </span>
          <span className="text-sm text-slate-500">
            of {teacher.assigned} lessons finished
          </span>
        </div>
        <ProgressMeter
          className="mt-2.5"
          height="h-2"
          finished={teacher.finished}
          inProgress={teacher.inProgress}
          notStarted={teacher.notStarted}
        />
        <MeterLegend
          className="mt-2"
          finished={teacher.finished}
          inProgress={teacher.inProgress}
          notStarted={teacher.notStarted}
        />
      </div>

      <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Currently on
        </p>
        <CurrentlyOn teacher={teacher} />
      </div>

      {teacher.assigned > 0 && (
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 sm:px-5">
          <p className="mr-auto text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            All lessons
          </p>
          <div className="flex rounded-lg bg-slate-100 p-0.5">
            {FILTERS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => onFilter(value)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  filter === value
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {shown.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">
            {teacher.assigned === 0
              ? "Nothing assigned yet."
              : filter === "finished"
              ? "Nothing finished yet."
              : "Everything assigned is finished."}
          </p>
        ) : (
          tracks.map((track) => (
            <section key={track.lessons[0].lessonId}>
              {/* A heading, not a folder. Nothing collapses. */}
              <h3 className="flex items-center gap-2 bg-slate-50/80 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 sm:px-5">
                <Circle size={6} className="fill-slate-300 text-slate-300" />
                Grade {track.grade}
                {courseLabel(track.course) && (
                  <span className="text-slate-400">· {courseLabel(track.course)}</span>
                )}
                <span className="font-normal normal-case tracking-normal text-slate-400">
                  {track.lessons.filter((l) => l.state === "finished").length} of{" "}
                  {track.lessons.length} finished
                </span>
              </h3>
              <ul className="divide-y divide-slate-50">
                {track.lessons.map((lesson) => (
                  <LessonRow key={lesson.lessonId} lesson={lesson} />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
