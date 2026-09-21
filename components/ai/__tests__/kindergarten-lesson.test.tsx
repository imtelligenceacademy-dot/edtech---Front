/**
 * No assistant on a kindergarten page.
 *
 * The rule shipped as a per-account one: a teacher whose every grade is a
 * kindergarten grade lost the composer, and everyone else kept it everywhere.
 * That is half a rule. A teacher of KG2 *and* Grade 1 still teaches the
 * curriculum the assistant is grounded in, so she kept it — including on her
 * KG2 pages, where the assistant has never read a line of MTiny and every
 * answer it gave was invented.
 *
 * So the gate belongs to the page, not only to the account. Both halves are
 * pinned here, with the same session: the composer is gone on KG2 and still
 * there on Grade 1.
 *
 * Both settle on the empty-lesson-list line, which is the one thing on the
 * welcome screen that does not read the gate. Waiting on the heading would
 * work too, but the heading is a second consumer of the same boolean, and a
 * test should fail at the thing it is about. The assertion that carries each
 * test is the composer.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { Chatbot } from "@/components/ai/Chatbot";
import { getSession } from "@/lib/api";
import type { Session } from "@/types";

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

// Hoisted above the imports by vitest, so the static import binds to the mock.
const getSessionMock = vi.mocked(getSession);

// She takes both, which is the whole point: the account rule leaves her the
// assistant, so anything hiding it on the KG2 page can only be the page.
const SESSION = {
  userId: "u_1",
  name: "Teacher",
  role: "teacher",
  grades: ["KG2", "G1"],
  sections: {},
} as unknown as Session;

// KG2 and Grade 1 as the database stores them: kindergarten counts backwards
// from zero so that ordering a teacher's grades sorts them correctly.
const KG2 = -2;
const GRADE_1 = 1;

beforeAll(() => {
  // jsdom lays nothing out, so it ships no scrollTo. The transcript scrolls
  // itself to the bottom on mount, and without this the component throws
  // before it has rendered anything to assert on.
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
});

const composer = () => screen.queryByPlaceholderText(/Message IM-Telligence AI/);
const newChat = () => screen.queryByTitle("Start a new session");
const backToLessons = () => screen.queryByTitle("Back to your lessons");

describe("the assistant on a kindergarten page", () => {
  it("is not offered, to a teacher who has it everywhere else", async () => {
    render(<Chatbot grade={KG2} />);

    await waitFor(() => screen.getByText(/No lessons assigned/));

    expect(composer()).toBeNull();
  });

  it("is still offered to the same teacher on her Grade 1 page", async () => {
    render(<Chatbot grade={GRADE_1} />);

    await waitFor(() => screen.getByText(/No lessons assigned/));

    expect(composer()).toBeInTheDocument();
  });
});

describe("the header's new-chat button", () => {
  /**
   * It followed the composer, so hiding the assistant took it away too — and a
   * kindergarten teacher lost the only control that closes the lesson she has
   * open and puts her back on her list. The two are separate concerns: one
   * clears a conversation she does not have, the other is navigation everyone
   * needs.
   */
  it("is there on a kindergarten page, under the name of what it does", async () => {
    render(<Chatbot grade={KG2} />);

    await waitFor(() => screen.getByText(/No lessons assigned/));

    expect(composer()).toBeNull();
    expect(backToLessons()).toBeInTheDocument();
    expect(screen.getByText("My lessons")).toBeInTheDocument();
    // "New chat" would name a conversation this teacher cannot have.
    expect(newChat()).toBeNull();
  });

  it("is a new chat on a Grade 1 page, where there is one to start", async () => {
    render(<Chatbot grade={GRADE_1} />);

    await waitFor(() => screen.getByText(/No lessons assigned/));

    expect(newChat()).toBeInTheDocument();
    expect(screen.getByText("New chat")).toBeInTheDocument();
    expect(backToLessons()).toBeNull();
  });
});
