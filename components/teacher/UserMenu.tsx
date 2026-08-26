"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, TrendingUp } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { logout } from "@/lib/api";
import { clearChatSession } from "@/lib/teacher/prefs";
import type { Session } from "@/types";

export function UserMenu({
  session,
  light,
}: {
  session: Session | null;
  light: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!session) {
    return (
      <button
        onClick={() => router.push("/")}
        className={cn(
          "rounded-full border px-3 py-1.5 text-[11px]",
          light
            ? "border-slate-200 bg-white/70 text-slate-700 hover:bg-white"
            : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
        )}
      >
        Sign in
      </button>
    );
  }

  async function handleSignOut() {
    clearChatSession();
    await logout();
    router.push("/");
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 rounded-full border py-1 pl-1 pr-2.5 text-left transition",
          light
            ? "border-slate-200 bg-white/70 hover:bg-white"
            : "border-white/10 bg-white/5 hover:bg-white/10"
        )}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-700 text-[11px] font-semibold text-white shadow-lg shadow-brand/30">
          {initials(session.name)}
        </span>
        <span className="hidden flex-col leading-tight md:flex">
          <span
            className={cn(
              "text-[12px] font-medium",
              light ? "text-slate-900" : "text-white"
            )}
          >
            {session.name}
          </span>
          <span
            className={cn(
              "text-[10px] capitalize",
              light ? "text-slate-500" : "text-slate-400"
            )}
          >
            {session.role.replace("-", " ")}
          </span>
        </span>
        <ChevronDown
          size={12}
          className={cn(
            "transition",
            light ? "text-slate-500" : "text-slate-400",
            open && (light ? "rotate-180 text-slate-900" : "rotate-180 text-white")
          )}
        />
      </button>

      {open && (
        <div
          className={cn(
            "absolute right-0 top-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-xl border shadow-2xl",
            light
              ? "border-slate-200 bg-white"
              : "border-white/10 bg-slate-900"
          )}
        >
          <div
            className={cn(
              "flex items-center gap-3 border-b px-4 py-3",
              light ? "border-slate-200" : "border-white/5"
            )}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-700 text-sm font-semibold text-white shadow-lg shadow-brand/30">
              {initials(session.name)}
            </span>
            <div className="min-w-0">
              <p
                className={cn(
                  "truncate text-sm font-medium",
                  light ? "text-slate-900" : "text-white"
                )}
              >
                {session.name}
              </p>
              <p
                className={cn(
                  "truncate text-[11px]",
                  light ? "text-slate-500" : "text-slate-400"
                )}
              >
                {session.email}
              </p>
            </div>
          </div>
          <div className="p-1.5">
            <button
              onClick={() => {
                setOpen(false);
                router.push("/teacher/progress");
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition",
                light
                  ? "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                  : "text-slate-200 hover:bg-white/5 hover:text-white"
              )}
            >
              <TrendingUp
                size={14}
                className={light ? "text-slate-500" : "text-slate-400"}
              />
              Your progress
            </button>
            <button
              onClick={handleSignOut}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition",
                light
                  ? "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                  : "text-slate-200 hover:bg-white/5 hover:text-white"
              )}
            >
              <LogOut
                size={14}
                className={light ? "text-slate-500" : "text-slate-400"}
              />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Controls for the lesson showing on the classroom screen. Everything the
// teacher needs while presenting lives here, so they never have to look at the
// projected window — which is exactly what keeps the assistant private.
