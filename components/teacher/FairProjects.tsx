"use client";

import { useEffect } from "react";
import { Minimize2, Presentation, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PdfCanvasViewer } from "@/components/lesson-viewer/PdfCanvasViewer";
import type { FairProject } from "@/types";

export function FairProjectsScreen({
  projects,
  onOpen,
  light,
}: {
  projects: FairProject[];
  onOpen: (project: FairProject) => void;
  light: boolean;
}) {
  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center py-6 text-center sm:py-10">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 via-brand to-brand-800 shadow-xl shadow-brand/40">
        <Presentation size={28} className="text-white" />
      </div>
      <h1
        className={cn(
          "bg-clip-text text-3xl font-semibold text-transparent sm:text-4xl",
          light
            ? "bg-gradient-to-r from-slate-900 via-slate-700 to-slate-500"
            : "bg-gradient-to-r from-white via-slate-200 to-slate-400"
        )}
      >
        ICT Fair projects
      </h1>
      <p className={cn("mt-3 text-sm", light ? "text-slate-600" : "text-slate-400")}>
        Open a shared ICT Fair project to present it in the protected viewer.
      </p>

      {projects.length === 0 ? (
        <p className={cn("mt-8 text-sm", light ? "text-slate-500" : "text-slate-400")}>
          No ICT Fair projects shared yet.
        </p>
      ) : (
        <div className="mt-8 grid w-full grid-cols-1 gap-2 text-left sm:grid-cols-2">
          {projects.map((project) => (
            <button
              key={project.id}
              onClick={() => project.fileId && onOpen(project)}
              disabled={!project.fileId}
              className={cn(
                "group flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition",
                project.fileId
                  ? "border-slate-200 bg-white/70 hover:border-brand/40 hover:bg-white"
                  : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                  project.fileId
                    ? "bg-slate-100 text-brand-600 group-hover:bg-brand/20"
                    : "bg-slate-100 text-slate-400"
                )}
              >
                <Presentation size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{project.title}</span>
                <span className="text-[11px] text-slate-400">
                  {project.fileId ? "PDF project" : "Missing file"}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
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
