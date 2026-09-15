"use client";

import { useRef } from "react";

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
 */
export function useLatestOnly() {
  const latest = useRef(0);

  return {
    /** Claim the screen for this question. Returns: is it still mine? */
    claim() {
      const mine = ++latest.current;
      return () => latest.current === mine;
    },
    /** Abandon whatever is outstanding. Nothing in flight owns the screen. */
    retire() {
      latest.current += 1;
    },
  };
}
