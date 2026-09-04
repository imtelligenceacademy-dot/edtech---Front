"use client";

import { useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Monitor,
  PanelRightClose,
  PanelRightOpen,
  Presentation,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PdfCanvasViewer } from "@/components/lesson-viewer/PdfCanvasViewer";
import type { Lesson } from "@/types";

export function LessonPane({
  lesson,
  section,
  width,
  chatCollapsed,
  onToggleChat,
  current,
  onPrev,
  onNext,
  onClose,
  onFullscreen,
  onPresent,
  onCompleted,
  onSlideChange,
  light,
}: {
  lesson: Lesson;
  // The class being taught — what the viewer saves belongs to them.
  section: string;
  width: number;
  chatCollapsed: boolean;
  onToggleChat: () => void;
  current: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onFullscreen: () => void;
  onPresent: () => void;
  onCompleted?: () => void;
  onSlideChange?: (slide: number) => void;
  light: boolean;
}) {
  const isPdf = Boolean(lesson.fileId);
  const total = lesson.slides.length;
  const slide = isPdf ? undefined : lesson.slides[current - 1];

  return (
    <div
      style={{ width: `${width}%` }}
      className={cn(
        "relative z-10 hidden h-full shrink-0 flex-col border-r backdrop-blur-xl md:flex",
        light
          ? "border-slate-200/60 bg-white/40"
          : "border-white/5 bg-slate-950/40"
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center gap-3 border-b px-5 py-4",
          light ? "border-slate-200/60" : "border-white/5"
        )}
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-brand shadow-lg shadow-sky-500/20">
          <Presentation size={16} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "truncate text-sm font-semibold",
              light ? "text-slate-900" : "text-white"
            )}
          >
            {lesson.title}
          </p>
          <p
            className={cn(
              "text-[11px]",
              light ? "text-slate-500" : "text-slate-400"
            )}
          >
            Grade {lesson.grade} · {isPdf ? "PDF lesson" : `${total} slides`}
          </p>
        </div>
        {!isPdf && (
          <span
            className={cn(
              "rounded-full border px-3 py-1 text-[11px]",
              light
                ? "border-slate-200 bg-white/70 text-slate-700"
                : "border-white/10 bg-white/5 text-slate-300"
            )}
          >
            {current} / {total}
          </span>
        )}
        {isPdf && (
          <button
            onClick={onPresent}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-medium transition",
              light
                ? "border-slate-200 bg-white/70 text-slate-700 hover:bg-white"
                : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
            )}
            aria-label="Present on the second screen"
            title="Show this lesson on the classroom screen — the chat stays here"
          >
            <Monitor size={13} /> Present
          </button>
        )}
        {isPdf && (
          <button
            onClick={onFullscreen}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-medium transition",
              light
                ? "border-slate-200 bg-white/70 text-slate-700 hover:bg-white"
                : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
            )}
            aria-label="Open full-screen preview"
          >
            <Maximize2 size={13} /> Full screen
          </button>
        )}
        <button
          onClick={onToggleChat}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg transition",
            light
              ? "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              : "text-slate-400 hover:bg-white/5 hover:text-white"
          )}
          aria-label={chatCollapsed ? "Show the assistant" : "Hide the assistant"}
          title={chatCollapsed ? "Show the assistant" : "Hide the assistant"}
        >
          {chatCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
        </button>
        <button
          onClick={onClose}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg transition",
            light
              ? "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              : "text-slate-400 hover:bg-white/5 hover:text-white"
          )}
          aria-label="Close presentation"
        >
          <X size={16} />
        </button>
      </div>

      {/* Canvas: real PDF when linked, otherwise the slide deck */}
      {isPdf ? (
        <div className="min-h-0 flex-1">
          <PdfCanvasViewer
            fileId={lesson.fileId as string}
            lessonId={lesson.id}
            section={section}
            light={light}
            accessStatus={lesson.accessStatus}
            onExit={onClose}
            onCompleted={onCompleted}
            onSlideChange={onSlideChange}
          />
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-4 px-8 py-6 min-h-0">
          <div className="flex flex-1 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white via-slate-50 to-slate-100 text-slate-900 shadow-2xl min-h-0">
            {slide?.imageUrl ? (
              <img
                src={slide.imageUrl}
                alt={slide.title}
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-full w-full flex-col p-10">
                <p className="text-xs font-medium uppercase tracking-widest text-brand-600">
                  Slide {slide?.index} of {total}
                </p>
                <h2 className="mt-3 text-3xl font-semibold leading-tight text-slate-900 lg:text-4xl xl:text-5xl">
                  {slide?.title}
                </h2>
                <p className="mt-5 text-base leading-relaxed text-slate-600 lg:text-lg">
                  {slide?.body}
                </p>
                <div className="mt-auto flex min-h-[40%] flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-gradient-to-br from-brand-50 to-slate-100 text-sm text-slate-400">
                  Slide visual
                </div>
              </div>
            )}
          </div>

          {/* Slide rail */}
          <div className="flex flex-wrap gap-1.5">
            {lesson.slides.map((s) => (
              <span
                key={s.id}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition",
                  s.index === current
                    ? "bg-gradient-to-r from-brand to-brand-700"
                    : s.index < current
                    ? light
                      ? "bg-slate-300"
                      : "bg-white/30"
                    : light
                    ? "bg-slate-200"
                    : "bg-white/10"
                )}
              />
            ))}
          </div>
        </div>
      )}

      {/* Controls — slide navigation only applies to deck lessons */}
      {isPdf ? (
        <div
          className={cn(
            "flex items-center justify-center border-t px-5 py-3 text-[11px]",
            light ? "border-slate-200/60 text-slate-500" : "border-white/5 text-slate-500"
          )}
        >
          {chatCollapsed
            ? "Presenting full width · reopen the assistant from the header"
            : "Scroll the PDF on the left · ask the AI on the right about it"}
        </div>
      ) : (
        <div
          className={cn(
            "flex items-center justify-between border-t px-5 py-3",
            light ? "border-slate-200/60" : "border-white/5"
          )}
        >
          <button
            onClick={onPrev}
            disabled={current === 1}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition",
              light ? "border-slate-200" : "border-white/10",
              current === 1
                ? light
                  ? "cursor-not-allowed text-slate-400"
                  : "cursor-not-allowed text-slate-600"
                : light
                ? "text-slate-700 hover:bg-slate-100"
                : "text-slate-200 hover:bg-white/5"
            )}
          >
            <ChevronLeft size={14} />
            Previous
          </button>
          <p className={cn("text-[11px]", light ? "text-slate-500" : "text-slate-500")}>
            Ask the AI on the right to explain any slide
          </p>
          <button
            onClick={onNext}
            disabled={current === total}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition",
              current === total
                ? light
                  ? "cursor-not-allowed border border-slate-200 text-slate-400"
                  : "cursor-not-allowed border border-white/10 text-slate-600"
                : "bg-gradient-to-br from-brand to-brand-700 text-white shadow-lg shadow-brand/30 hover:brightness-110"
            )}
          >
            Next
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// Distraction-free full-screen PDF preview. Covers the whole screen with just
// the lesson PDF (same protected canvas viewer) and a close button — no AI,
// no chat, no slide controls. Esc closes it.


// Distraction-free full-screen PDF preview. Covers the whole screen with just
// the lesson PDF (same protected canvas viewer) and a close button — no AI,
// no chat, no slide controls. Esc closes it.
export function FullscreenPdf({
  lesson,
  section,
  onClose,
  onCompleted,
}: {
  lesson: Lesson;
  section: string;
  onClose: () => void;
  onCompleted?: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-100">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <img
          src="/logo.png"
          alt="IM-Telligence"
          className="h-8 w-8 rounded-full bg-white object-contain p-0.5 shadow"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{lesson.title}</p>
          <p className="text-[11px] text-slate-500">
            Grade {lesson.grade} · Full-screen preview
          </p>
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-100"
          aria-label="Exit full-screen preview"
        >
          <Minimize2 size={13} /> Exit full screen
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <PdfCanvasViewer
          fileId={lesson.fileId as string}
          lessonId={lesson.id}
          section={section}
          light
          accessStatus={lesson.accessStatus}
          onExit={onClose}
          onCompleted={onCompleted}
        />
      </div>
    </div>
  );
}

// Full-screen viewer for an ICT Fair project — same copy protection as lessons,
// but no lessonId so there's no progress tracking or completion.
