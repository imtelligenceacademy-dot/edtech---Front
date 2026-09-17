/**
 * The confirmation has to be about the change the button will make.
 *
 * `runApply` read `selectedIds` and `edit` back at click time, while the lesson
 * and teacher pickers stayed live through the preview request. An admin who
 * marked a second teacher for removal while the preview was in flight got a
 * modal counting the first teacher's ten assignments and naming the one teacher
 * losing progress — over a button that then removed twenty, deleting a second
 * teacher's progress that had never been counted or named.
 *
 * Removing an assignment deletes that teacher's progress on the lesson, which
 * is why this flow has a confirmation at all.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  bulkAssignments,
  deleteLesson,
  listLessons,
  listSchools,
  listUsers,
  previewBulkAssignments,
} from "@/lib/api";
import AccessPage from "@/app/super-admin/access/page";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    listLessons: vi.fn(),
    listSchools: vi.fn(),
    listUsers: vi.fn(),
    previewBulkAssignments: vi.fn(),
    bulkAssignments: vi.fn(),
    deleteLesson: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const lessonsMock = vi.mocked(listLessons);
const schoolsMock = vi.mocked(listSchools);
const usersMock = vi.mocked(listUsers);
const previewMock = vi.mocked(previewBulkAssignments);
const applyMock = vi.mocked(bulkAssignments);
const deleteLessonMock = vi.mocked(deleteLesson);

const LESSON = {
  id: "les_1",
  title: "Grade 7 python lesson 01",
  grade: 7,
  language: "en",
  year: 2,
  course: "python",
  lessonNo: 1,
  slides: [],
  assignedTeacherIds: ["u_a", "u_b"],
};

const TEACHERS = [
  { id: "u_a", name: "Teacher A", role: "teacher", status: "active", email: "a@x.com", schoolId: "sch_1", grades: ["G7"] },
  { id: "u_b", name: "Teacher B", role: "teacher", status: "active", email: "b@x.com", schoolId: "sch_1", grades: ["G7"] },
];

beforeEach(() => {
  vi.clearAllMocks();
  lessonsMock.mockResolvedValue([LESSON] as never);
  schoolsMock.mockResolvedValue([{ id: "sch_1", name: "Balamand" }] as never);
  usersMock.mockResolvedValue(TEACHERS as never);
});

describe("bulk assignment", () => {
  it("applies the change it previewed, not the pickers' latest state", async () => {
    // The preview is held open while the admin keeps clicking.
    let releasePreview: (value: unknown) => void = () => {};
    previewMock.mockImplementationOnce(
      () => new Promise((resolve) => (releasePreview = resolve as never))
    );
    applyMock.mockResolvedValue({
      lessons: [],
      assignmentsAdded: 0,
      assignmentsRemoved: 1,
      lessonsTouched: 1,
    } as never);

    render(<AccessPage />);
    const user = userEvent.setup();
    await screen.findByText(/Grade 7 python lesson 01/i);

    // A school first — the teacher list is scoped to one, and is empty until
    // one is chosen.
    await user.click(await screen.findByText(/Balamand/i));
    // Then the lesson, then mark Teacher A for removal.
    await user.click(screen.getByText(/Grade 7 python lesson 01/i));
    await user.click(await screen.findByText(/Teacher A/i));

    const applyButton = await screen.findByRole("button", { name: /^Apply$/i });
    await user.click(applyButton);
    await waitFor(() => expect(previewMock).toHaveBeenCalledTimes(1));

    const previewed = previewMock.mock.calls[0][0] as { removeTeacherIds: string[] };

    // While the preview is in flight the admin also marks Teacher B.
    await user.click(await screen.findByText(/Teacher B/i));

    releasePreview({
      lessons: 1,
      adds: 0,
      removes: previewed.removeTeacherIds.length,
      progressLost: 3,
      teachersLosingProgress: ["Teacher A"],
    });

    const confirm = await screen.findByRole("button", { name: /^Remove/i });
    await user.click(confirm);

    await waitFor(() => expect(applyMock).toHaveBeenCalledTimes(1));
    const applied = applyMock.mock.calls[0][0] as { removeTeacherIds: string[] };

    // The heart of it: what was applied is what was described.
    expect(applied.removeTeacherIds).toEqual(previewed.removeTeacherIds);
    expect(applied.removeTeacherIds).not.toContain("u_b");
  });
});

describe("deleting a lesson", () => {
  it("reports a refusal where the admin is actually looking", async () => {
    // `error` renders only inside ApplyBar — a z-40 strip pinned to the bottom
    // of the viewport, underneath this modal's own z-50 scrim. Reported there,
    // a refused delete was invisible, and the button returning from "Deleting…"
    // to "Delete lesson" read as a click that never registered.
    deleteLessonMock.mockRejectedValue(new Error("That lesson is still assigned."));

    render(<AccessPage />);
    const user = userEvent.setup();
    await screen.findByText(/Grade 7 python lesson 01/i);

    const trash = screen.getAllByRole("button", { name: /delete/i })[0];
    await user.click(trash);

    const confirm = await screen.findByRole("button", { name: /^Delete lesson$/i });
    await user.click(confirm);

    // Inside the dialog, specifically. The page renders it elsewhere too — in
    // a bar pinned to the bottom of the viewport, underneath this dialog's own
    // scrim — and jsdom has no stacking, so asserting only that the text exists
    // somewhere would pass against the bug.
    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(within(dialog).getByText(/still assigned/i)).toBeInTheDocument()
    );
    expect(within(dialog).getByRole("button", { name: /^Delete lesson$/i })).toBeInTheDocument();
  });
});
