// Progress saves that could not reach the server, held until they can.
//
// A teacher on an unreliable connection marks a lesson complete, the request
// never arrives, and until now the save was simply gone: "Couldn't save
// progress." and nothing more. Here it is kept and sent again — when the
// browser reports it is back online, and every half minute meanwhile, because
// a school's wifi can stay "connected" for an hour with no internet behind it
// and the browser never notices.
//
// Kept in this tab's memory only, which is the promise this makes: leave the
// tab open and the save arrives. Closing the tab while still offline loses it.
//
// Re-sending is safe. The server treats saving progress on a lesson that is
// already complete as a no-op, so a request that did arrive but whose reply was
// lost costs nothing when it is sent again.

import { ApiError, currentAccountId, saveLessonProgress } from "@/lib/api";
import type { ProgressEntry } from "@/types";

type ProgressPayload = Parameters<typeof saveLessonProgress>[1];

type PendingSave = {
  // Whose save this is. The stored token is shared by every tab, so another
  // teacher signing in elsewhere in this browser changes who this tab's
  // requests are sent as — and her progress must not be written under his.
  accountId: string;
  lessonId: string;
  payload: ProgressPayload;
};

export type SaveOutcome =
  | { status: "saved"; entry: ProgressEntry }
  | { status: "queued" };

/** Fired on `window` once at least one held save has reached the server. */
export const PROGRESS_SYNCED_EVENT = "imt:progress-synced";

const RETRY_MS = 30_000;

// One entry per lesson and class: only the latest position is worth sending.
const pending = new Map<string, PendingSave>();
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let listeningForOnline = false;
let flushing = false;

/**
 * An answer from the server is final; a request that never got one is not.
 * A 403 for a lesson locked since will be a 403 on every retry, so it is not
 * held. A 5xx is the server or the proxy in front of it failing, which is
 * exactly what a retry is for.
 */
function worthRetrying(err: unknown): boolean {
  return !(err instanceof ApiError) || err.status >= 500;
}

function keyOf(save: PendingSave): string {
  return `${save.accountId}|${save.lessonId}|${save.payload.section ?? ""}`;
}

function hold(save: PendingSave) {
  const key = keyOf(save);
  // A completion is not replaced by a later page number. The lesson is done,
  // and the server would ignore a position on a completed lesson in any case.
  if (pending.get(key)?.payload.complete && !save.payload.complete) return;
  pending.set(key, save);
  scheduleRetry();
}

function scheduleRetry() {
  if (typeof window === "undefined") return;
  if (!listeningForOnline) {
    window.addEventListener("online", () => void flushPendingProgress());
    listeningForOnline = true;
  }
  if (retryTimer === null) {
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void flushPendingProgress();
    }, RETRY_MS);
  }
}

/** Save now, or hold the save if the server could not be reached. */
export async function saveProgressOrQueue(
  lessonId: string,
  payload: ProgressPayload
): Promise<SaveOutcome> {
  try {
    return { status: "saved", entry: await saveLessonProgress(lessonId, payload) };
  } catch (err) {
    const accountId = currentAccountId();
    // Without an account to file it under it cannot safely be sent later.
    if (!worthRetrying(err) || !accountId) throw err;
    hold({ accountId, lessonId, payload });
    return { status: "queued" };
  }
}

/** Send whatever is held for the account signed in now. */
export async function flushPendingProgress(): Promise<void> {
  if (flushing) return;
  flushing = true;
  const me = currentAccountId();
  let sent = 0;
  try {
    for (const [key, save] of Array.from(pending)) {
      if (save.accountId !== me) continue;
      try {
        await saveLessonProgress(save.lessonId, save.payload);
        pending.delete(key);
        sent++;
      } catch (err) {
        if (!worthRetrying(err)) {
          // Refused, and it will be refused again. Dropped rather than retried
          // forever; the lesson list the teacher sees will say why.
          pending.delete(key);
          continue;
        }
        // Still unreachable. The rest would fail the same way.
        break;
      }
    }
  } finally {
    flushing = false;
  }
  if (sent > 0 && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PROGRESS_SYNCED_EVENT));
  }
  if (Array.from(pending.values()).some((s) => s.accountId === me)) scheduleRetry();
}

/** How many saves are waiting, for any account. */
export function pendingProgressCount(): number {
  return pending.size;
}

/** Forget everything held. For tests; nothing in the app calls it. */
export function clearPendingProgress(): void {
  pending.clear();
  if (retryTimer !== null) clearTimeout(retryTimer);
  retryTimer = null;
}
