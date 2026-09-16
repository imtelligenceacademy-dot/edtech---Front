/**
 * Three admin screens that could act on, or speak about, the wrong thing.
 *
 * - Teacher Chats fetched a transcript with no latest-only guard, so one
 *   teacher's private conversation could render under another teacher's name.
 * - Lesson Unlock wrote action failures into the same state as load failures,
 *   so a refused grant replaced the whole page with "Could not load this
 *   teacher" about an account that was on screen.
 * - Access read the pickers back when the confirm button was pressed, so the
 *   modal could describe a smaller removal than it performed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  getTeacherAccess,
  listChatMessages,
  listChatThreads,
  listUsers,
  setLessonOverride,
} from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    listUsers: vi.fn(async () => []),
    listChatThreads: vi.fn(async () => []),
    listChatMessages: vi.fn(async () => []),
    getTeacherAccess: vi.fn(),
    setLessonOverride: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useParams: () => ({ teacherId: "u_1" }),
  useSearchParams: () => new URLSearchParams(),
}));

const threadsMock = vi.mocked(listChatThreads);
const messagesMock = vi.mocked(listChatMessages);
const usersMock = vi.mocked(listUsers);
const accessMock = vi.mocked(getTeacherAccess);
const overrideMock = vi.mocked(setLessonOverride);

beforeEach(() => {
  vi.clearAllMocks();
});

// --------------------------------------------------------------------------
// Teacher Chats: whose conversation is on screen
// --------------------------------------------------------------------------
describe("Teacher Chats", () => {
  it("drops a transcript that arrives after the admin moved on", async () => {
    const ChatsPage = (await import("@/app/super-admin/chats/page")).default;
    usersMock.mockResolvedValue([
      { id: "u_rita", name: "Rita", role: "teacher", email: "r@x.com" },
      { id: "u_sami", name: "Sami", role: "teacher", email: "s@x.com" },
    ] as never);
    threadsMock.mockResolvedValue([
      { lessonId: "les_1", section: "", lessonTitle: "Lesson 1", messageCount: 2 },
    ] as never);

    let releaseRita: (rows: unknown[]) => void = () => {};
    messagesMock.mockImplementationOnce(
      () => new Promise((resolve) => (releaseRita = resolve as never))
    );

    render(<ChatsPage />);
    await waitFor(() => expect(usersMock).toHaveBeenCalled());

    const user = userEvent.setup();
    const picker = await screen.findByRole("combobox");
    await user.selectOptions(picker, "u_rita");
    const thread = await screen.findByText(/Lesson 1/);
    await user.click(thread);

    // The admin switches teacher while Rita's transcript is still in flight.
    await user.selectOptions(picker, "u_sami");
    releaseRita([
      { id: "m_1", role: "user", content: "RITA PRIVATE MESSAGE", createdAt: "2026-01-01" },
    ]);

    await waitFor(() => expect(messagesMock).toHaveBeenCalled());
    // Rita's words must never appear while the picker names Sami.
    expect(screen.queryByText(/RITA PRIVATE MESSAGE/)).not.toBeInTheDocument();
  });
});

// --------------------------------------------------------------------------
// Lesson Unlock: a failed action is not a failed load
// --------------------------------------------------------------------------
describe("Lesson Unlock", () => {
  const TEACHER = {
    teacherId: "u_1",
    teacherName: "Rita",
    email: "rita@example.com",
    schoolId: "sch_1",
    grades: ["G7"],
    sections: { G7: [""] },
    language: "en" as const,
    tracks: [
      {
        grade: 7,
        section: "",
        language: "en" as const,
        year: 2,
        lessons: [
          {
            lessonId: "les_1",
            title: "Grade 7 python lesson 01",
            grade: 7,
            section: "",
            language: "en" as const,
            course: "python",
            lessonNo: 1,
            status: "waiting" as const,
            availableAt: null,
            percentComplete: 0,
            completedAt: null,
            unlockedOverride: false,
          },
        ],
      },
    ],
  };

  it("keeps the page when a grant is refused", async () => {
    const Page = (await import("@/app/super-admin/lesson-access/[teacherId]/page")).default;
    accessMock.mockResolvedValue(TEACHER as never);
    overrideMock.mockRejectedValue(new Error("Already resolved by someone else."));

    render(<Page />);
    await screen.findByText(/Rita/);

    const user = userEvent.setup();
    const grant = await screen.findByRole("button", { name: /unlock|grant/i });
    await user.click(grant);

    await waitFor(() =>
      expect(screen.getByText(/Already resolved by someone else/)).toBeInTheDocument()
    );
    // The teacher and her tracks are still on screen; the page was not replaced.
    expect(screen.getByText(/Rita/)).toBeInTheDocument();
    expect(screen.queryByText(/Could not load this teacher/i)).not.toBeInTheDocument();
  });

  it("still replaces the page when the load itself failed", async () => {
    const Page = (await import("@/app/super-admin/lesson-access/[teacherId]/page")).default;
    accessMock.mockRejectedValue(new Error("The server is not responding."));

    render(<Page />);

    await waitFor(() =>
      expect(screen.getByText(/Could not load this teacher/i)).toBeInTheDocument()
    );
  });
});
