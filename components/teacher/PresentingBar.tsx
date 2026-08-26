"use client";

import { useState } from "react";
import {
  BookmarkCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Monitor,
  MonitorX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { saveLessonProgress } from "@/lib/api";
import type { Lesson } from "@/types";

// Controls for the lesson showing on the classroom screen. Everything the
// teacher needs while presenting lives here, so they never have to look at the
// projected window — which is exactly what keeps the assistant private.
export function PresentingBar({
  lesson,
  page,
  total,
  onPrev,
  onNext,
  onStop,
  onCompleted,
  light,
}: {
  lesson: Lesson;
  page: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onStop: () => void;
  onCompleted: () => void;
  light: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [confirmingComplete, setConfirmingComplete] = useState(false);

  // Only this window writes progress — the projected one has no lesson id and
  // cannot save, so there is never a double count.
  async function save(complete: boolean) {
    setSaving(true);
    setSaved(null);
    try {
      await saveLessonProgress(
        lesson.id,
        complete ? { complete: true, total } : { slide: page, total }
      );
      setSaved(complete ? "Marked complete" : `Saved — page ${page}`);
      if (complete) onCompleted();
    } catch {
      setSaved("Couldn't save just now.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-t px-4 py-2.5 text-[11px] sm:px-8",
        light ? "border-slate-200/60 bg-white/60" : "border-white/5 bg-slate-950/40"
      )}
    >
      <span className="flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 font-medium text-brand-700">
        <Monitor size={12} /> On the classroom screen
      </span>

      <div className="flex items-center gap-1">
        <button
          onClick={onPrev}
          disabled={page <= 1}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg border transition disabled:opacity-40",
            light ? "border-slate-200 bg-white text-slate-700" : "border-white/10 text-slate-200"
          )}
          aria-label="Previous page"
        >
          <ChevronLeft size={14} />
        </button>
        <span
          className={cn(
            "w-24 text-center tabular-nums",
            light ? "text-slate-600" : "text-slate-300"
          )}
        >
          Page {page}
          {total ? ` of ${total}` : ""}
        </span>
        <button
          onClick={onNext}
          disabled={Boolean(total) && page >= total}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg border transition disabled:opacity-40",
            light ? "border-slate-200 bg-white text-slate-700" : "border-white/10 text-slate-200"
          )}
          aria-label="Next page"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {saved && (
        <span
          className={cn(
            "flex items-center gap-1",
            saved.startsWith("Couldn't") ? "text-red-500" : "text-emerald-600"
          )}
        >
          <Check size={12} /> {saved}
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        {confirmingComplete ? (
          <>
            <span className={light ? "text-slate-600" : "text-slate-300"}>
              Finish this lesson? It locks and the next one starts its wait.
            </span>
            <button
              onClick={() => setConfirmingComplete(false)}
              disabled={saving}
              className={cn(
                "rounded-lg border px-3 py-1.5 transition",
                light ? "border-slate-200 bg-white text-slate-700" : "border-white/10 text-slate-200"
              )}
            >
              Not yet
            </button>
            <button
              onClick={() => {
                setConfirmingComplete(false);
                void save(true);
              }}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-brand to-brand-700 px-3 py-1.5 font-medium text-white shadow-lg shadow-brand/30 transition hover:brightness-110"
            >
              <Check size={13} /> {saving ? "Saving..." : "Yes, complete it"}
            </button>
          </>
        ) : (
          <>
            <span className={cn("hidden lg:inline", light ? "text-slate-400" : "text-slate-500")}>
              Screens must be set to Extend (Win + P), not Duplicate
            </span>
            <button
              onClick={() => save(false)}
              disabled={saving}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 transition",
                light ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50" : "border-white/10 text-slate-200 hover:bg-white/10"
              )}
            >
              <BookmarkCheck size={13} /> Save progress
            </button>
            <button
              onClick={() => setConfirmingComplete(true)}
              disabled={saving}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 transition",
                light ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50" : "border-white/10 text-slate-200 hover:bg-white/10"
              )}
            >
              <Check size={13} /> Mark complete
            </button>
            <button
              onClick={onStop}
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 font-medium text-white transition hover:bg-slate-700"
            >
              <MonitorX size={13} /> Stop presenting
            </button>
          </>
        )}
      </div>
    </div>
  );
}
