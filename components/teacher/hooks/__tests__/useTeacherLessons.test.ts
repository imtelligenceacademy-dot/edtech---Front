/**
 * Answers about a class the teacher has already left must not land.
 *
 * Everything this hook holds is scoped to one class — a teacher who takes 6A,
 * 6B and 6C walks three independent sequences — and four requests go out
 * together whenever the class changes. None of them is required to answer in
 * the order it was asked.
 *
 * It races on an ordinary page load rather than only under bad luck: `session`
 * is null on the first render, so `section` starts as "" and becomes the real
 * class the moment the session lands. Both rounds are then in flight at once,
 * and the unscoped answer landing second rewrote the lesson list, every
 * lesson's access status and the progress map with another class's — lessons
 * this class had finished showing as available, the one they were actually on
 * showing as locked.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const listLessons = vi.fn();
const listProgress = vi.fn();
const listMyAccessRequests = vi.fn();
const listMyClasses = vi.fn();

vi.mock("@/lib/api", () => ({
  listLessons: (...a: unknown[]) => listLessons(...a),
  listProgress: (...a: unknown[]) => listProgress(...a),
  listMyAccessRequests: (...a: unknown[]) => listMyAccessRequests(...a),
  listMyClasses: (...a: unknown[]) => listMyClasses(...a),
  listFairSections: vi.fn(async () => []),
  requestLessonAccess: vi.fn(async () => {}),
}));

import { useTeacherLessons } from "@/components/teacher/hooks/useTeacherLessons";
import type { Lesson } from "@/types";

afterEach(() => vi.clearAllMocks());

const lesson = (id: string, title: string) =>
  ({ id, title, grade: 6, slides: [], accessStatus: "available" }) as unknown as Lesson;

/** The wrong class's answer: a lesson 6A finished, offered as available. */
const SIX_A = [lesson("les_a", "6A lesson")];
/** The class actually on screen. */
const SIX_B = [lesson("les_b", "6B lesson")];

describe("switching class while the first answer is still coming", () => {
  it("keeps the class on screen, not the one that answered last", async () => {
    let releaseA: (rows: Lesson[]) => void = () => {};
    listLessons
      .mockImplementationOnce(
        () =>
          new Promise((res) => {
            releaseA = res;
          })
      )
      .mockImplementationOnce(async () => SIX_B);
    listProgress.mockResolvedValue([]);
    listMyAccessRequests.mockResolvedValue([]);
    listMyClasses.mockResolvedValue([]);

    const { result, rerender } = renderHook(
      ({ section }: { section: string }) => useTeacherLessons(null, section),
      { initialProps: { section: "A" } }
    );

    // The teacher moves to 6B before 6A has answered.
    rerender({ section: "B" });
    await waitFor(() => expect(result.current.lessons).toEqual(SIX_B));

    // Only now does 6A's request come back.
    releaseA(SIX_A);
    await new Promise((r) => setTimeout(r, 20));

    expect(result.current.lessons).toEqual(SIX_B);
  });

  it("does not take the old class's progress either", async () => {
    let releaseProgress: (rows: unknown[]) => void = () => {};
    listLessons.mockResolvedValue([]);
    listProgress
      .mockImplementationOnce(
        () =>
          new Promise((res) => {
            releaseProgress = res;
          })
      )
      .mockImplementation(async () => []);
    listMyAccessRequests.mockResolvedValue([]);
    listMyClasses.mockResolvedValue([]);

    const { result, rerender } = renderHook(
      ({ section }: { section: string }) => useTeacherLessons(null, section),
      { initialProps: { section: "A" } }
    );
    rerender({ section: "B" });
    await new Promise((r) => setTimeout(r, 20));

    releaseProgress([
      { lessonId: "les_a", section: "A", percentComplete: 100, lastSlide: 9 },
    ]);
    await new Promise((r) => setTimeout(r, 20));

    expect(result.current.progressByLesson).toEqual({});
  });
});

describe("the ordinary case", () => {
  it("shows what the class it asked about came back with", async () => {
    listLessons.mockResolvedValue(SIX_B);
    listProgress.mockResolvedValue([
      { lessonId: "les_b", section: "B", percentComplete: 40, lastSlide: 4 },
    ]);
    listMyAccessRequests.mockResolvedValue([]);
    listMyClasses.mockResolvedValue([]);

    const { result } = renderHook(() => useTeacherLessons(null, "B"));

    await waitFor(() => expect(result.current.lessons).toEqual(SIX_B));
    await waitFor(() =>
      expect(result.current.progressByLesson["les_b"]).toBeDefined()
    );
    expect(result.current.lessonsLoaded).toBe(true);
  });
});
