/**
 * The guard the delete dialog depends on, tested where it actually lives.
 *
 * Two impact questions can be outstanding at once — Cancel stays live while the
 * first is loading, so an admin who gives up on a slow one and deletes
 * something else has both in flight — and answers are not required to come back
 * in the order they were asked. The slower one landing second used to overwrite
 * the newer, putting a description of one selection in front of a Delete button
 * holding another.
 *
 * The direction of that failure is the problem: the reassuring answer is the
 * small one. "These files aren't linked to any lesson, so nothing else is
 * affected", over a folder that takes its lessons, progress and chat history
 * with it.
 */
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";

import { useLatestOnly } from "@/lib/use-latest-only";

describe("useLatestOnly", () => {
  it("lets a single question own the screen", () => {
    const { result } = renderHook(() => useLatestOnly());

    const isCurrent = result.current.claim();

    expect(isCurrent()).toBe(true);
  });

  it("gives the screen to the newest question, whatever order they answer in", () => {
    const { result } = renderHook(() => useLatestOnly());

    const slow = result.current.claim();
    const newer = result.current.claim();

    // The abandoned one answers last, which is the whole bug.
    expect(slow()).toBe(false);
    expect(newer()).toBe(true);
  });

  it("treats two questions about the same thing as two questions", () => {
    const { result } = renderHook(() => useLatestOnly());

    const first = result.current.claim();
    const second = result.current.claim();

    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });

  it("abandons what is outstanding when the dialog closes", () => {
    const { result } = renderHook(() => useLatestOnly());
    const inFlight = result.current.claim();

    result.current.retire();

    expect(inFlight()).toBe(false);
  });

  it("does not hand a retired question's screen to the next one", () => {
    const { result } = renderHook(() => useLatestOnly());
    const abandoned = result.current.claim();
    result.current.retire();

    const reopened = result.current.claim();

    expect(abandoned()).toBe(false);
    expect(reopened()).toBe(true);
  });

  it("is the same object on every render", () => {
    // Load-bearing, not tidiness. Callers hold this inside a `useCallback`, and
    // that callback is a dependency of the effect that runs it — so a fresh
    // object each render rebuilds the callback, re-runs the effect, and puts
    // the component in a refetch loop against the API. The guard would have
    // caused the thing it guards against.
    const { result, rerender } = renderHook(() => useLatestOnly());
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });

  it("survives a re-render, because a request outlives one", () => {
    const { result, rerender } = renderHook(() => useLatestOnly());
    const inFlight = result.current.claim();

    rerender();

    expect(inFlight()).toBe(true);
  });
});

describe("the shape askToDelete uses it in", () => {
  it("keeps the newer answer when the older one resolves last", async () => {
    const { result } = renderHook(() => useLatestOnly());
    const shown: string[] = [];

    async function ask(label: string, answer: Promise<string>) {
      const isCurrent = result.current.claim();
      const resolved = await answer;
      if (!isCurrent()) return;
      shown.push(resolved);
    }

    let releaseSlow: (v: string) => void = () => {};
    const slow = new Promise<string>((res) => {
      releaseSlow = res;
    });
    const abandoned = ask("unlinked file", slow);
    await ask("whole grade", Promise.resolve("40 files, 12 lessons, 318 progress rows"));

    releaseSlow("1 file, nothing else affected");
    await abandoned;

    expect(shown).toEqual(["40 files, 12 lessons, 318 progress rows"]);
  });
});
