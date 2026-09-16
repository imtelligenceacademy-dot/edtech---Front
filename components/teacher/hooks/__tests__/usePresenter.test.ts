/**
 * The pop-up-blocked warning, and getting out of it.
 *
 * `setPresentBlocked(false)` was reachable from exactly one place — a later
 * *successful* Present. A teacher whose pop-up was blocked and who decided to
 * teach from the laptop instead never took that path, so the amber banner sat
 * above the composer for the rest of the session, taking the row that matters
 * most on a short landscape-phone layout.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { openPresenterWindow } from "@/lib/window-placement";
import { usePresenter } from "@/components/teacher/hooks/usePresenter";
import type { Lesson } from "@/types";

vi.mock("@/lib/window-placement", () => ({
  openPresenterWindow: vi.fn(() => ({ win: null })),
  placeOnExternalScreen: vi.fn(async () => {}),
}));

vi.mock("@/lib/present-channel", () => ({
  openPresentChannel: vi.fn(() => ({ post: vi.fn(), close: vi.fn() })),
}));

const openWindow = vi.mocked(openPresenterWindow);

const LESSON = { id: "les_1", title: "Grade 7 lesson 01", fileId: "file_1" } as Lesson;

function harness() {
  return renderHook(() =>
    usePresenter({
      section: "A",
      onPageChange: vi.fn(),
      say: vi.fn(),
      onStart: vi.fn(),
      onStop: vi.fn(),
    })
  );
}

beforeEach(() => {
  openWindow.mockReset();
  // The browser refusing the pop-up, which is what `win: null` means here.
  openWindow.mockReturnValue({ win: null } as ReturnType<typeof openPresenterWindow>);
});

describe("usePresenter pop-up warning", () => {
  it("raises the warning when the browser refuses the window", () => {
    const { result } = harness();

    act(() => result.current.startPresenting(LESSON));

    expect(result.current.presentBlocked).toBe(true);
    // Nothing is being presented — the warning is the whole outcome.
    expect(result.current.presenting).toBeNull();
  });

  it("lets the teacher put the warning away", () => {
    const { result } = harness();
    act(() => result.current.startPresenting(LESSON));
    expect(result.current.presentBlocked).toBe(true);

    act(() => result.current.dismissPresentBlocked());

    expect(result.current.presentBlocked).toBe(false);
  });

  it("clears the warning when presenting stops", () => {
    const { result } = harness();
    act(() => result.current.startPresenting(LESSON));

    act(() => result.current.stopPresenting());

    expect(result.current.presentBlocked).toBe(false);
  });

  it("clears the warning when a later Present succeeds", () => {
    const { result } = harness();
    act(() => result.current.startPresenting(LESSON));
    expect(result.current.presentBlocked).toBe(true);

    // The teacher allows pop-ups and presses Present again.
    const win = { closed: false, focus: vi.fn(), close: vi.fn(), location: { href: "" } };
    openWindow.mockReturnValue({ win } as unknown as ReturnType<typeof openPresenterWindow>);
    act(() => result.current.startPresenting(LESSON));

    expect(result.current.presentBlocked).toBe(false);
    expect(result.current.presenting?.lesson.id).toBe("les_1");
  });
});
