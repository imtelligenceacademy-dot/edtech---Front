"use client";

import { Loader2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { PendingEdit } from "@/lib/super-admin/access";

/**
 * The pending edit, stated in full, pinned to the bottom of the window.
 *
 * It is fixed rather than sticky on purpose: DashboardShell's root sets
 * overflow-hidden, which silently disables position:sticky for everything
 * inside it. `md:left-60` clears the sidebar.
 */
export function ApplyBar({
  edit,
  summary,
  busy,
  error,
  onReset,
  onApply,
}: {
  edit: PendingEdit;
  summary: string;
  busy: boolean;
  error: string | null;
  onReset: () => void;
  onApply: () => void;
}) {
  const nothing = edit.adds === 0 && edit.removes === 0;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur md:left-60">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6 md:px-8">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-slate-800">{summary}</p>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-2 text-xs font-medium tabular-nums">
          {edit.adds > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">
              <Plus size={12} /> {edit.adds}
            </span>
          )}
          {edit.removes > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-red-700">
              <Minus size={12} /> {edit.removes}
            </span>
          )}
          {!nothing && (
            <span className="text-slate-500">
              across {edit.lessonsTouched} lesson{edit.lessonsTouched === 1 ? "" : "s"}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onReset} disabled={busy || nothing}>
            Reset
          </Button>
          <Button size="sm" onClick={onApply} disabled={busy || nothing}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : null}
            {busy ? "Applying…" : "Apply"}
          </Button>
        </div>
      </div>
    </div>
  );
}
