"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { DeletionImpact } from "@/lib/api";

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <p className="text-lg font-semibold tabular-nums text-slate-900">{value}</p>
      <p className="text-[11px] leading-tight text-slate-500">{label}</p>
    </div>
  );
}

/**
 * Deleting a lesson PDF deletes the lesson, and the lesson takes every teacher's
 * assignment, progress, chat thread and access request with it. The old
 * confirmation said so in prose; this one counts it, because "12 lessons" and
 * "12 lessons, 3 of them half-taught, 214 chat messages" are different decisions.
 */
export function DeleteImpactModal({
  open,
  onClose,
  impact,
  loading,
  busy,
  error,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  impact: DeletionImpact | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
}) {
  const nothingLinked = impact != null && impact.lessons === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Delete lessons"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy || loading}>
            {busy
              ? "Deleting…"
              : `Delete ${impact ? impact.files : ""} file${
                  impact?.files === 1 ? "" : "s"
                }`.trim()}
          </Button>
        </>
      }
    >
      {loading || !impact ? (
        <p className="flex items-center gap-2 py-4 text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" /> Working out what this removes…
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Stat value={impact.files} label={`PDF${impact.files === 1 ? "" : "s"}`} />
            <Stat value={impact.lessons} label={`lesson${impact.lessons === 1 ? "" : "s"}`} />
            <Stat
              value={impact.teachers}
              label={`teacher${impact.teachers === 1 ? "" : "s"} affected`}
            />
            <Stat value={impact.progress} label="progress records" />
            <Stat value={impact.chatMessages} label="chat messages" />
            <Stat value={impact.accessRequests} label="access requests" />
          </div>

          {impact.lessonsInProgress > 0 && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                <strong className="font-semibold">
                  {impact.lessonsInProgress} of these lessons {impact.lessonsInProgress === 1 ? "has" : "have"} already been
                  started or finished
                </strong>{" "}
                by a teacher. Their progress and chat history for {impact.lessonsInProgress === 1 ? "it" : "them"} goes too, and
                a database restore will not bring the chats back.
              </span>
            </p>
          )}

          {nothingLinked && (
            <p className="text-xs text-slate-500">
              These files aren’t linked to any lesson, so nothing else is affected.
            </p>
          )}

          {impact.lessonTitles.length > 0 && (
            <details className="rounded-lg border border-slate-200">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-700">
                Lessons being removed ({impact.lessonTitles.length})
              </summary>
              <ul className="max-h-40 space-y-0.5 overflow-y-auto border-t border-slate-100 px-3 py-2 text-xs text-slate-600">
                {impact.lessonTitles.map((title) => (
                  <li key={title} className="truncate" title={title}>
                    {title}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {impact.missing > 0 && (
            <p className="text-xs text-slate-400">
              {impact.missing} selected file{impact.missing === 1 ? " was" : "s were"} already gone.
            </p>
          )}

          <p className="text-xs text-slate-500">This cannot be undone.</p>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
