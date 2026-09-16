/**
 * What the teacher is told when the request failed.
 *
 * `useTeacherLessons` wrote a failed load into state as an empty list and
 * exposed no error, so every screen downstream read a 500 as "nothing
 * assigned". A teacher whose session had expired was told, as a statement about
 * her account, that she has no lessons — with nothing to retry.
 *
 * This is the pattern that was closed on seven admin screens across 0df3c5c and
 * 43f9aa7. The teacher surface, the one somebody stands in front of a class
 * using, was not included either time.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { renderHook } from "@testing-library/react";

import { listLessons } from "@/lib/api";
import { GradeGate } from "@/components/teacher/GradeGate";
import { WelcomeScreen } from "@/components/teacher/WelcomeScreen";
import { useTeacherLessons } from "@/components/teacher/hooks/useTeacherLessons";
import type { Session } from "@/types";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    listLessons: vi.fn(),
    listProgress: vi.fn(async () => []),
    listMyClasses: vi.fn(async () => []),
    listMyAccessRequests: vi.fn(async () => []),
    listFairSections: vi.fn(async () => []),
  };
});

// Hoisted above the imports by vitest, so the static import binds to the mock.
const listLessonsMock = vi.mocked(listLessons);

const SESSION = {
  userId: "u_1",
  name: "Teacher",
  role: "teacher",
  grades: ["G7"],
  sections: {},
} as unknown as Session;

describe("useTeacherLessons", () => {
  it("reports a failed load instead of an empty roster", async () => {
    listLessonsMock.mockRejectedValue(new Error("The server is not responding."));

    const { result } = renderHook(() => useTeacherLessons(SESSION, ""));

    await waitFor(() => expect(result.current.lessonsLoaded).toBe(true));
    expect(result.current.lessons).toEqual([]);
    // The part that was missing: the list is empty *and* we know why.
    expect(result.current.lessonsError).toBe("The server is not responding.");
  });

  it("clears the error once a load succeeds", async () => {
    listLessonsMock.mockResolvedValue([]);

    const { result } = renderHook(() => useTeacherLessons(SESSION, ""));

    await waitFor(() => expect(result.current.lessonsLoaded).toBe(true));
    expect(result.current.lessonsError).toBeNull();
  });
});

describe("the screens that were making the claim", () => {
  it("GradeGate says the load failed rather than 'you have no lessons'", () => {
    render(
      <GradeGate
        grades={[]}
        classes={[]}
        loading={false}
        loadError="Your session has expired. Please sign in again."
        onRetry={() => {}}
        onPick={() => {}}
        light
      />
    );

    expect(screen.getByText(/session has expired/i)).toBeInTheDocument();
    expect(screen.queryByText(/no assigned lessons yet/i)).not.toBeInTheDocument();
  });

  it("GradeGate still says so when the roster really is empty", () => {
    render(
      <GradeGate grades={[]} classes={[]} loading={false} onPick={() => {}} light />
    );

    expect(screen.getByText(/no assigned lessons yet/i)).toBeInTheDocument();
  });

  it("WelcomeScreen does not claim a grade is empty when the request failed", () => {
    render(
      <WelcomeScreen
        lessons={[]}
        grade={7}
        progressByLesson={{}}
        onOpenLesson={() => {}}
        onRequestAccess={() => {}}
        onPrompt={() => {}}
        requestedLessonIds={new Set()}
        loadError="The server is not responding."
        onRetry={() => {}}
        light
      />
    );

    expect(screen.getByText(/server is not responding/i)).toBeInTheDocument();
    expect(screen.queryByText(/No lessons assigned for/i)).not.toBeInTheDocument();
  });

  it("WelcomeScreen still says so when the grade really is empty", () => {
    render(
      <WelcomeScreen
        lessons={[]}
        grade={7}
        progressByLesson={{}}
        onOpenLesson={() => {}}
        onRequestAccess={() => {}}
        onPrompt={() => {}}
        requestedLessonIds={new Set()}
        light
      />
    );

    expect(screen.getByText(/No lessons assigned for/i)).toBeInTheDocument();
  });
});
