"use client";

import { useEffect, useState } from "react";
import { Minimize2, Presentation } from "lucide-react";
import { cn } from "@/lib/utils";
import { PdfCanvasViewer } from "@/components/lesson-viewer/PdfCanvasViewer";
import { FairSectionList } from "@/components/teacher/fair/FairSectionList";
import type { FairProject, FairSection } from "@/types";

export function FairProjectsScreen({
  sections,
  teacherGrades,
  onOpen,
}: {
  sections: FairSection[];
  teacherGrades: string[];
  onOpen: (project: FairProject) => void;
}) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"mine" | "all">("all");
  // Whether the teacher has picked a scope themselves. Without this the effect
  // below would keep dragging them back to "My grades" every time it ran.
  const [chosen, setChosen] = useState(false);

  // Teachers land on their own grades, because that is what they came for.
  // It cannot be the initial state: the session arrives a moment after the
  // first render, so `teacherGrades` is still empty when useState runs and the
  // screen would open on "All grades" for everybody.
  useEffect(() => {
    if (!chosen && teacherGrades.length > 0) setScope("mine");
  }, [chosen, teacherGrades]);

  return (
    <FairSectionList
      sections={sections}
      query={query}
      onQuery={setQuery}
      scope={scope}
      onScope={(next) => {
        setChosen(true);
        setScope(next);
      }}
      teacherGrades={teacherGrades}
      onOpen={onOpen}
    />
  );
}

// A lesson tile in the welcome list. Reflects the sequential-unlock state:
// available lessons open normally; completed/waiting/locked ones show why and,
// when clicked, surface a "ask your admin" message in the chat.


export function FairButton({
  active,
  onClick,
  light,
}: {
  active: boolean;
  onClick: () => void;
  light: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title="ICT Fair projects"
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[11px] font-medium shadow-sm transition active:scale-95",
        // Touch area only — the pill itself is unchanged. See ChatHeader.
        "relative after:absolute after:-inset-x-1 after:-inset-y-2.5 after:content-['']",
        active
          ? "border-slate-900 bg-white text-slate-900"
          : light
          ? "border-slate-200 bg-white text-slate-700 hover:border-brand/40 hover:text-brand-700"
          : "border-white/10 bg-white/5 text-slate-200 hover:border-brand/40 hover:bg-white/10"
      )}
    >
      <Presentation size={13} /> <span className="hidden sm:inline">ICT Fair</span>
    </button>
  );
}


// Full-screen viewer for an ICT Fair project — same copy protection as lessons,
// but no lessonId so there's no progress tracking or completion.
export function FairFullscreen({
  project,
  onClose,
}: {
  project: FairProject;
  onClose: () => void;
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
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow">
          <Presentation size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{project.title}</p>
          <p className="text-[11px] text-slate-500">ICT Fair · Full-screen preview</p>
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
        <PdfCanvasViewer fileId={project.fileId as string} light onExit={onClose} />
      </div>
    </div>
  );
}
