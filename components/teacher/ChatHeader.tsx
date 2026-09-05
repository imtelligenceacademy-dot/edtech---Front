"use client";

// BookOpen, not Presentation: the ICT Fair button beside this one already uses
// Presentation, and below sm both labels are hidden — two identical icons would
// be two guesses.
import { BookOpen, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { FairButton } from "@/components/teacher/FairProjects";
import { UserMenu } from "@/components/teacher/UserMenu";
import type { Session } from "@/types";

/**
 * The bar across the top of the assistant. `relative z-30` lifts it — and the
 * dropdown inside it — above the messages below, which otherwise paint over it.
 */
export function ChatHeader({
  session,
  canStartNewChat,
  onNewChat,
  showFairProjects,
  onOpenFair,
  showLessonsButton,
  onOpenLessons,
  light,
}: {
  session: Session | null;
  /** Nothing to start over from on a fresh grade gate. */
  canStartNewChat: boolean;
  onNewChat: () => void;
  showFairProjects: boolean;
  onOpenFair: () => void;
  /** Whether there is a lesson rail to open. Below xl it is a sheet, and this
   *  is the only way to reach it; from xl the rail is always on screen and the
   *  button is hidden. */
  showLessonsButton: boolean;
  onOpenLessons: () => void;
  light: boolean;
}) {
  return (
    <div
      className={cn(
        "relative z-30 flex items-center gap-2 border-b px-3 py-4 backdrop-blur-xl sm:gap-3 sm:px-6",
        light ? "border-slate-200/60 bg-white/70" : "border-white/5 bg-slate-950/40"
      )}
    >
      <div className="relative shrink-0 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 p-[2px] shadow-lg shadow-brand/30">
        <img
          src="/logo.png"
          alt="IM-Telligence"
          className="h-9 w-9 rounded-full bg-white object-contain p-0.5"
        />
        <div
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 bg-emerald-400",
            light ? "border-white" : "border-slate-900"
          )}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-sm font-semibold tracking-tight",
            light ? "text-slate-900" : "text-white"
          )}
        >
          IM-Telligence AI
        </p>
        <p
          className={cn(
            "hidden items-center gap-1.5 truncate text-[11px] sm:flex",
            light ? "text-slate-500" : "text-slate-400"
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Online · Lesson copilot
        </p>
      </div>
      {canStartNewChat && (
        <button
          onClick={onNewChat}
          title="Start a new session"
          // The pill stays 27px tall; the pseudo-element takes the touch area to
          // 47 so a thumb hits it. Same on the two buttons beside it.
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[11px] font-medium shadow-sm transition active:scale-95",
            "relative after:absolute after:-inset-x-1 after:-inset-y-2.5 after:content-['']",
            light
              ? "border-slate-200 bg-white text-slate-700 hover:border-brand/40 hover:text-brand-700"
              : "border-white/10 bg-white/5 text-slate-200 hover:border-brand/40 hover:bg-white/10"
          )}
        >
          <Plus size={13} /> <span className="hidden sm:inline">New chat</span>
        </button>
      )}
      {showLessonsButton && (
        <button
          onClick={onOpenLessons}
          title="Your lesson"
          aria-label="Your lesson"
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[11px] font-medium shadow-sm transition active:scale-95 xl:hidden",
            "relative after:absolute after:-inset-x-1 after:-inset-y-2.5 after:content-['']",
            light
              ? "border-slate-200 bg-white text-slate-700 hover:border-brand/40 hover:text-brand-700"
              : "border-white/10 bg-white/5 text-slate-200 hover:border-brand/40 hover:bg-white/10"
          )}
        >
          <BookOpen size={13} /> <span className="hidden sm:inline">Lesson</span>
        </button>
      )}
      {session?.ictFairAccess && (
        <FairButton active={showFairProjects} onClick={onOpenFair} light={light} />
      )}
      <UserMenu session={session} light={light} />
    </div>
  );
}
