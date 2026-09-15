"use client";

import { useMemo, useRef } from "react";

/**
 * Ignore the answer to a question that is no longer the one on screen.
 *
 * Several places here ask the server something when a selection changes — which
 * school's ICT Fair sections, which teacher's conversations, what a delete
 * would cost — and the request that was sent first is not required to answer
 * first. Written the obvious way, each `await` writes its result into state
 * whenever it happens to return, so a slow answer landing after a newer one
 * replaces it, and the screen ends up describing something the user has already
 * navigated away from.
 *
 * That is at its worst in front of a destructive action. The delete dialog
 * showed the impact of whichever question answered last while the Delete button
 * held whichever selection was chosen last, and the reassuring answer is the
 * small one: "these files aren't linked to any lesson, so nothing else is
 * affected", over a folder that takes its lessons, progress and chat history
 * with it.
 *
 *     const impact = useLatestOnly();
 *
 *     async function ask(ids: string[]) {
 *       const isCurrent = impact.claim();
 *       const answer = await fetchImpact(ids);
 *       if (!isCurrent()) return;   // a newer question owns the screen
 *       setImpact(answer);
 *     }
 *
 * `retire()` abandons whatever is outstanding without asking anything new — for
 * closing the dialog, so a late answer cannot write itself into the next one.
 *
 * The returned object is the same one on every render, which matters more than
 * it looks: callers keep it inside a `useCallback`, and that callback is a
 * dependency of the effect that runs it. A fresh object each render would
 * rebuild the callback each render, re-run the effect each render, and put the
 * component in a refetch loop against the API — the failure being guarded
 * against, arrived at through the guard.
 */
export function useLatestOnly() {
  const latest = useRef(0);

  return useMemo(() => ({
    /** Claim the screen for this question. Returns: is it still mine? */
    claim() {
      const mine = ++latest.current;
      return () => latest.current === mine;
    },
    /** Abandon whatever is outstanding. Nothing in flight owns the screen. */
    retire() {
      latest.current += 1;
    },
  }), []);
}
