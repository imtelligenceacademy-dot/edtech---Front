/**
 * Opening a second lesson has to give it a second viewer.
 *
 * `PdfCanvasViewer` seeds `done` from `accessStatus === "completed"` once, and
 * `saved` and `current` the same way. The pane swaps its `lesson` prop without
 * the element moving, so React re-rendered the viewer instead of remounting it
 * and every one of those carried over.
 *
 * A teacher completing lesson A and then opening lesson B — which on desktop
 * she does by asking the assistant, the only way to change lessons with the
 * pane open — got a green "Lesson completed" badge over lesson B, and no Mark
 * complete button to correct it with. The viewer also scrolled B to A's page
 * and printed A's "stopped at slide 9" line under B's counter.
 *
 * The fix is a key, so this asserts the thing a key means: a different lesson
 * gets a different component instance. The PDF machinery is stubbed, because
 * the defect is about instance lifetime and nothing else.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

// jsdom has no matchMedia. The pane asks it whether there is room for the
// viewer at all — below md the viewer is not rendered, and the carry-over this
// test is about happens on desktop.
beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

import { LessonPane } from "@/components/teacher/LessonPane";
import type { Lesson } from "@/types";

const mounts: string[] = [];

vi.mock("@/components/lesson-viewer/PdfCanvasViewer", () => ({
  PdfCanvasViewer: ({ lessonId }: { lessonId: string }) => {
    // Recorded on mount only. If the component is re-rendered rather than
    // remounted, this does not run again — which is exactly the bug.
    const React = require("react") as typeof import("react");
    React.useEffect(() => {
      mounts.push(lessonId);
      // Mount only, on purpose: re-running this on a lessonId change is exactly
      // what would hide the defect.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div data-testid="viewer">{lessonId}</div>;
  },
}));

function lesson(id: string, accessStatus: string): Lesson {
  return {
    id,
    title: `Lesson ${id}`,
    fileId: `file_${id}`,
    grade: 7,
    slides: [],
    accessStatus,
  } as unknown as Lesson;
}

function paneProps(l: Lesson) {
  return {
    lesson: l,
    section: "",
    width: 900,
    chatCollapsed: false,
    onToggleChat: () => {},
    current: 1,
    onPrev: () => {},
    onNext: () => {},
    onClose: () => {},
    onFullscreen: () => {},
    onPresent: () => {},
    onCompleted: () => {},
    onSlideChange: () => {},
    light: true,
  };
}

describe("LessonPane", () => {
  it("gives a newly opened lesson its own viewer", () => {
    mounts.length = 0;
    const a = lesson("les_a", "completed");
    const b = lesson("les_b", "available");

    const { rerender } = render(<LessonPane {...paneProps(a)} />);
    expect(mounts).toEqual(["les_a"]);

    // The teacher opens another lesson; the pane stays where it is.
    rerender(<LessonPane {...paneProps(b)} />);

    // Without the key this is still ["les_a"]: same instance, still holding
    // lesson A's completed state.
    expect(mounts).toEqual(["les_a", "les_b"]);
  });

  it("does not churn the viewer on an unrelated re-render", () => {
    mounts.length = 0;
    const a = lesson("les_a", "available");

    const { rerender } = render(<LessonPane {...paneProps(a)} />);
    rerender(<LessonPane {...paneProps(a)} width={700} />);

    // Same lesson, same instance — a key must not remount on every render, or
    // the PDF would be refetched whenever the split is dragged.
    expect(mounts).toEqual(["les_a"]);
  });
});
