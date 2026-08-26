"use client";

import type { Lesson } from "@/types";

// Relative order of courses within a grade/language track — mirrors the
// backend COURSE_ORDER so the whole track reads as one linear sequence
// (all python lessons, then all micro:bit lessons).
export const COURSE_ORDER: Record<string, number> = { python: 1, microbit: 2 };
export function courseOrder(l: Lesson): number {
  return COURSE_ORDER[l.course ?? ""] ?? 0;
}

// Order lessons by course first, then curriculum number, for sequential nav.
export function byLessonNo(a: Lesson, b: Lesson): number {
  return (
    courseOrder(a) - courseOrder(b) ||
    (a.lessonNo ?? 0) - (b.lessonNo ?? 0) ||
    a.title.localeCompare(b.title)
  );
}

// Human label for a course code (for section headers in the lesson list).
export function courseLabel(course?: string | null): string {
  if (course === "python") return "Python";
  if (course === "microbit") return "micro:bit";
  return "Lessons";
}

// Group lessons into course sections in curriculum order (python, then
// micro:bit, then anything else), each section sorted by lesson number.
export function groupLessonsByCourse(
  lessons: Lesson[]
): { course: string | null | undefined; items: Lesson[] }[] {
  const groups = new Map<string, Lesson[]>();
  for (const l of lessons) {
    const key = l.course ?? "";
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(l);
  }
  return Array.from(groups.entries())
    .sort((a, b) => (COURSE_ORDER[a[0]] ?? 0) - (COURSE_ORDER[b[0]] ?? 0))
    .map(([course, items]) => ({
      course: course || null,
      items: items.sort(byLessonNo),
    }));
}

// Strip the "Grade N Lesson NN" prefix to get the descriptive part, e.g.
// "Grade 7 Lesson 03 Buzzer" -> "buzzer".
export function descriptivePart(title: string): string {
  return title
    .replace(/^grade\s*\d+\s*(?:python|micro:?bit)?\s*lesson\s*\d+\s*/i, "")
    .trim()
    .toLowerCase();
}

export function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 768px), (pointer: coarse)").matches;
}
