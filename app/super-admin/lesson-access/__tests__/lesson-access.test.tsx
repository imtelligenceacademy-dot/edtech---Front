/**
 * Two screens where a failed request was reported as a fact about a teacher.
 *
 * The Lesson Unlock index swallowed a failed grant with a bare `catch`. Leaving
 * the row in place is right — the request is still pending — but on its own it
 * is indistinguishable from the click not registering: nothing moves, nothing
 * spins, nothing is said. So the admin clicks Grant again, and again, decides
 * the button is broken, and the teacher stays blocked on a lesson somebody
 * meant to unlock for her. `AttentionPanel` runs the same operation and has
 * always surfaced the error, so the two entry points disagreed about whether a
 * failure was worth mentioning.
 *
 * The per-teacher screen wrote a failed load into state and then never rendered
 * it — the error is only printed further down, inside the branch that requires
 * the data that failed to arrive — and showed "Teacher not found." instead. An
 * expired session or a dropped connection therefore told an admin the account
 * was gone, about an account that exists, with no way to try again short of the
 * browser's back button.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const grantAccessRequest = vi.fn();
const denyAccessRequest = vi.fn();
const listUsers = vi.fn();
const listSchools = vi.fn();
const listAccessRequests = vi.fn();
const getTeacherAccess = vi.fn();

vi.mock("@/lib/api", () => ({
  grantAccessRequest: (...a: unknown[]) => grantAccessRequest(...a),
  denyAccessRequest: (...a: unknown[]) => denyAccessRequest(...a),
  listUsers: (...a: unknown[]) => listUsers(...a),
  listSchools: (...a: unknown[]) => listSchools(...a),
  listAccessRequests: (...a: unknown[]) => listAccessRequests(...a),
  getTeacherAccess: (...a: unknown[]) => getTeacherAccess(...a),
  resetTeacherProgress: vi.fn(),
  setLessonOverride: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ teacherId: "usr_1" }),
}));

import LessonAccessPage from "@/app/super-admin/lesson-access/page";
import TeacherAccessPage from "@/app/super-admin/lesson-access/[teacherId]/page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const TEACHER = {
  id: "usr_1",
  name: "Rita",
  email: "rita@example.com",
  role: "teacher",
  status: "active",
  schoolId: "sch_1",
  grades: ["G7"],
};

/** The real shape the page renders, so a passing test is not a thrown one. */
const TEACHER_ACCESS = {
  teacherId: "usr_1",
  teacherName: "Rita",
  email: "rita@example.com",
  schoolId: "sch_1",
  grades: ["G7"],
  sections: { G7: ["A"] },
  language: "en" as const,
  tracks: [],
};

const PENDING = {
  id: "req_1",
  teacherId: "usr_1",
  lessonId: "les_1",
  lessonTitle: "Grade 7 python lesson 04",
  section: "A",
  status: "pending",
  createdAt: "2026-09-01T10:00:00Z",
};

// --------------------------------------------------------------------------- #
// Granting from the index
// --------------------------------------------------------------------------- #
describe("a grant that fails", () => {
  async function renderIndex() {
    listUsers.mockResolvedValue([TEACHER]);
    listSchools.mockResolvedValue([{ id: "sch_1", name: "Balamand" }]);
    listAccessRequests.mockResolvedValue([PENDING]);
    render(<LessonAccessPage />);
    await screen.findByText(/Grade 7 python lesson 04/i);
  }

  it("says so instead of looking like the click missed", async () => {
    grantAccessRequest.mockRejectedValue(new Error("That request was already resolved."));
    await renderIndex();

    await userEvent.click(screen.getByRole("button", { name: /grant access/i }));

    await waitFor(() =>
      expect(screen.getByText(/already resolved/i)).toBeInTheDocument()
    );
  });

  it("leaves the request in the list, because it is still pending", async () => {
    grantAccessRequest.mockRejectedValue(new Error("nope"));
    await renderIndex();

    await userEvent.click(screen.getByRole("button", { name: /grant access/i }));

    await waitFor(() => expect(grantAccessRequest).toHaveBeenCalled());
    expect(screen.getByText(/Grade 7 python lesson 04/i)).toBeInTheDocument();
  });

  it("takes the row away when it works, and says nothing", async () => {
    grantAccessRequest.mockResolvedValue({});
    await renderIndex();

    await userEvent.click(screen.getByRole("button", { name: /grant access/i }));

    await waitFor(() =>
      expect(screen.queryByText(/Grade 7 python lesson 04/i)).not.toBeInTheDocument()
    );
    expect(screen.queryByText(/could not/i)).not.toBeInTheDocument();
  });
});

// --------------------------------------------------------------------------- #
// Opening one teacher
// --------------------------------------------------------------------------- #
describe("opening a teacher whose page will not load", () => {
  it("does not report the account as missing", async () => {
    getTeacherAccess.mockRejectedValue(new Error("Your session has expired."));

    render(<TeacherAccessPage />);

    await waitFor(() =>
      expect(screen.getByText(/Your session has expired/i)).toBeInTheDocument()
    );
    expect(screen.queryByText(/Teacher not found/i)).not.toBeInTheDocument();
  });

  it("offers to try again, and does", async () => {
    getTeacherAccess
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(TEACHER_ACCESS);

    render(<TeacherAccessPage />);
    await waitFor(() => expect(screen.getByText(/Network error/i)).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /try again/i }));

    await waitFor(() =>
      expect(screen.queryByText(/Network error/i)).not.toBeInTheDocument()
    );
    expect(getTeacherAccess).toHaveBeenCalledTimes(2);
  });
});
