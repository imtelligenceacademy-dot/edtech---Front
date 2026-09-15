/**
 * Scrolling up to re-read something, while an answer is still arriving.
 *
 * The transcript follows the newest message only while the teacher is reading
 * the newest message — that is what the hook's doc comment promises. It could
 * not keep that promise during the one period it matters: every streamed delta
 * re-ran the follow effect, which re-armed an 800ms window in which scroll
 * events are ignored, so across a long answer the window never lapsed. Each
 * event was discarded, `atBottom` could not go false, and the view was dragged
 * back to the bottom on every chunk.
 *
 * The window is there for a real reason — a smooth scroll fires an event per
 * frame, and each looks like the teacher scrolling. But it only ever moves
 * *down*. Moving up is something only a person does.
 */
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useTranscriptScroll } from "@/components/teacher/hooks/useTranscriptScroll";

/** A scroll event carrying the geometry the hook reads. */
function scrollTo(top: number, { height = 4000, view = 600 } = {}) {
  return {
    currentTarget: { scrollTop: top, scrollHeight: height, clientHeight: view },
  } as unknown as React.UIEvent<HTMLDivElement>;
}

/** Attach a container the hook can actually scroll, as the transcript does. */
function withElement(result: { current: ReturnType<typeof useTranscriptScroll> }) {
  const el = document.createElement("div");
  el.scrollTo = () => {};
  Object.defineProperty(el, "scrollHeight", { value: 4000, configurable: true });
  (result.current.scrollRef as { current: HTMLDivElement | null }).current = el;
}

describe("useTranscriptScroll", () => {
  it("follows the newest message to begin with", () => {
    const { result } = renderHook(() => useTranscriptScroll([]));

    expect(result.current.atBottom).toBe(true);
  });

  it("stops following when the teacher scrolls up", () => {
    const { result } = renderHook(() => useTranscriptScroll([]));

    act(() => {
      result.current.onTranscriptScroll(scrollTo(3400));
      result.current.onTranscriptScroll(scrollTo(1200));
    });

    expect(result.current.atBottom).toBe(false);
  });

  it("hears a scroll up during an answer, however fast the deltas arrive", () => {
    // The bug, stated as the teacher meets it. Each delta re-arms the window,
    // and it used to swallow every scroll for the whole length of the reply.
    const { result, rerender } = renderHook(
      ({ follow }: { follow: unknown[] }) => useTranscriptScroll(follow),
      { initialProps: { follow: ["" as unknown] } }
    );
    withElement(result);

    act(() => {
      result.current.onTranscriptScroll(scrollTo(3400));
    });

    let answer = "";
    for (const word of ["Connect", "the", "servo", "to", "pin", "0"]) {
      answer += word;
      rerender({ follow: [answer] });
    }

    act(() => {
      // Mid-answer, the teacher scrolls back to re-read the previous one.
      result.current.onTranscriptScroll(scrollTo(900));
    });

    expect(result.current.atBottom).toBe(false);
  });

  it("still ignores the transcript's own scroll down", () => {
    // The other half. Without this the smooth scroll's own events read as the
    // teacher moving and the transcript fights itself.
    const { result } = renderHook(() => useTranscriptScroll([]));
    withElement(result);

    act(() => {
      result.current.jumpToLatest();
      // The animation reports its way down; none of this is the teacher.
      result.current.onTranscriptScroll(scrollTo(1000));
      result.current.onTranscriptScroll(scrollTo(2000));
      result.current.onTranscriptScroll(scrollTo(3000));
    });

    expect(result.current.atBottom).toBe(true);
  });

  it("follows again once the teacher scrolls back to the bottom", () => {
    const { result } = renderHook(() => useTranscriptScroll([]));

    act(() => {
      result.current.onTranscriptScroll(scrollTo(3400));
      result.current.onTranscriptScroll(scrollTo(900));
    });
    expect(result.current.atBottom).toBe(false);

    act(() => {
      result.current.onTranscriptScroll(scrollTo(3400));
    });
    expect(result.current.atBottom).toBe(true);
  });

  it("resumes following when the teacher sends a message", () => {
    // Sending is itself an intent to watch the reply.
    const { result } = renderHook(() => useTranscriptScroll([]));

    act(() => {
      result.current.onTranscriptScroll(scrollTo(3400));
      result.current.onTranscriptScroll(scrollTo(500));
    });
    expect(result.current.atBottom).toBe(false);

    act(() => {
      result.current.followLatest();
    });
    expect(result.current.atBottom).toBe(true);
  });
});
