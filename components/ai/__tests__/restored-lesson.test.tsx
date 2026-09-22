/**
 * A refresh with a lesson open must come back to the lesson, not the launcher.
 *
 * The lesson id survives a reload in sessionStorage, and the restore reopens it
 * in the left pane — but it used to do so silently. The right-hand side decides
 * between the launcher and the transcript on whether the transcript is empty,
 * and the only turn in a lesson nobody has asked about yet is the app's own
 * "Opening ..." line, which is local and does not survive the reload. So the
 * lesson came back on the left while the right went home to the launcher and
 * offered to open the lesson that was already open.
 *
 * Restoring now announces the lesson exactly as opening it does. The assertion
 * is on the launcher being gone rather than only on the line being present:
 * the line is the mechanism, the launcher is the thing the teacher complained
 * about, and a test should fail at what it is about.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { Chatbot } from "@/components/ai/Chatbot";
import { getSession, listLessons } from "@/lib/api";
import { CHAT_STATE_KEY } from "@/lib/teacher/prefs";
import type { Lesson, Session } from "@/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getSession: vi.fn(),
    logout: vi.fn(async () => {}),
    listLessons: vi.fn(async () => []),
    listProgress: vi.fn(async () => []),
    listMyClasses: vi.fn(async () => []),
    listMyAccessRequests: vi.fn(async () => []),
    listFairSections: vi.fn(async () => []),
    listChatMessages: vi.fn(async () => []),
    clearChatMessages: vi.fn(async () => {}),
    requestLessonAccess: vi.fn(async () => {}),
    saveLessonProgress: vi.fn(async () => {}),
    getMyAiQuota: vi.fn(async () => null),
    streamTeacherAI: vi.fn(),
  };
});

const getSessionMock = vi.mocked(getSession);
const listLessonsMock = vi.mocked(listLessons);

const GRADE_8 = 8;

const SESSION = {
  userId: "u_1",
  name: "test1",
  role: "teacher",
  grades: ["G8"],
  sections: {},
} as unknown as Session;

// The lesson from the screenshots, as the list hands it back.
const LESSON = {
  id: "les_1",
  title: "grade 8 microbit lesson 01 name badge",
  grade: GRADE_8,
  subject: "STEAM",
  language: "en",
  course: "microbit",
  lessonNo: 1,
  fileId: "file_1",
  slides: [],
  accessStatus: "available",
} as unknown as Lesson;

beforeAll(() => {
  // jsdom lays nothing out, so it ships neither of these and the transcript
  // scrolls itself to the bottom on mount.
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = () => {};
  }
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

beforeEach(() => {
  getSessionMock.mockResolvedValue(SESSION);
  listLessonsMock.mockResolvedValue([LESSON]);
  // What the page left behind before the teacher hit reload.
  window.sessionStorage.setItem(
    CHAT_STATE_KEY,
    JSON.stringify({ lastLessonId: LESSON.id })
  );
});

describe("a refresh with a lesson open", () => {
  it("comes back to the lesson rather than the launcher", async () => {
    render(<Chatbot grade={GRADE_8} />);

    await waitFor(() =>
      expect(screen.getByText(/Opening "grade 8 microbit lesson 01 name badge"/))
        .toBeInTheDocument()
    );

    // The launcher's starter prompts are the thing that should not be there:
    // they are the screen that invited her to open an already-open lesson.
    expect(screen.queryByText("How should I introduce this lesson?")).toBeNull();
  });

  it("still shows the launcher when nothing was left open", async () => {
    window.sessionStorage.clear();

    render(<Chatbot grade={GRADE_8} />);

    await waitFor(() =>
      expect(screen.getByText("How should I introduce this lesson?")).toBeInTheDocument()
    );
    expect(screen.queryByText(/^Opening "/)).toBeNull();
  });
});
