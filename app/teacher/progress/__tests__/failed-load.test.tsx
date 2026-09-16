/**
 * A teacher's own record, when the request for it failed.
 *
 * The load was `Promise.all([...]).catch(() => {})`. Swallowed, the page went on
 * to render its empty states as statements of fact: "Lessons completed: 0",
 * "You don't have a lesson in progress", "You haven't completed a lesson yet."
 * A teacher whose session had expired was told her year was empty, with no
 * error and nothing to retry.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { listLessons, listProgress } from "@/lib/api";
import TeacherProgressPage from "@/app/teacher/progress/page";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, listProgress: vi.fn(), listLessons: vi.fn() };
});

const progressMock = vi.mocked(listProgress);
const lessonsMock = vi.mocked(listLessons);

beforeEach(() => {
  progressMock.mockReset();
  lessonsMock.mockReset();
});

describe("the teacher progress page", () => {
  it("says the load failed instead of reporting an empty year", async () => {
    progressMock.mockRejectedValue(new Error("Your session has expired. Please sign in again."));
    lessonsMock.mockResolvedValue([]);

    render(<TeacherProgressPage />);

    await waitFor(() =>
      expect(screen.getByText(/session has expired/i)).toBeInTheDocument()
    );
    expect(screen.queryByText(/haven't completed a lesson yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/don't have a lesson in progress/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("one failure loses both, so either one has to say so", async () => {
    // Promise.all rejects on the first failure; the other result is discarded.
    progressMock.mockResolvedValue([]);
    lessonsMock.mockRejectedValue(new Error("The server is not responding."));

    render(<TeacherProgressPage />);

    await waitFor(() =>
      expect(screen.getByText(/server is not responding/i)).toBeInTheDocument()
    );
  });

  it("still reports an genuinely empty year as empty", async () => {
    progressMock.mockResolvedValue([]);
    lessonsMock.mockResolvedValue([]);

    render(<TeacherProgressPage />);

    await waitFor(() =>
      expect(screen.getByText(/haven't completed a lesson yet/i)).toBeInTheDocument()
    );
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });
});
