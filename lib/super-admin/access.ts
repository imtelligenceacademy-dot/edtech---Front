"use client";

// The arithmetic behind Access Control's bulk edit: which lessons are on
// screen, how much of a selection each teacher already covers, and what the
// pending edit would actually change.
//
// Pure functions only — the page owns the state.

import type { Lesson, User } from "@/types";

export type Coverage = "all" | "some" | "none";
/** What the admin has asked for, overriding what the selection currently says. */
export type Intent = "add" | "remove";

export type LessonFilters = {
  query: string;
  year: number | "all";
  grade: number | "all";
  lang: string | "all";
};

export const EMPTY_LESSON_FILTERS: LessonFilters = {
  query: "",
  year: "all",
  grade: "all",
  lang: "all",
};

/**
 * Year 1 and Year 2 are separate curricula, not two halves of one. The same
 * grade exists in both and means different lessons, so a list that mixes them
 * shows two "Grade 7 Lesson 1" rows that are not the same lesson at all.
 *
 * The backend treats a missing year as 2 (the column defaults to it and
 * kits.py reads `lesson.year or 2`), so this does too rather than inventing a
 * third bucket for legacy rows.
 */
export function yearOf(lesson: Lesson): number {
  return lesson.year ?? 2;
}

/**
 * A teacher is "auto-matched" when the upload rules would already give them
 * this lesson (their grade, and a language that matches). Anything beyond that
 * set is an explicit exception — which is the whole point of this page.
 */
export function autoMatches(lesson: Lesson, teacher: User): boolean {
  if (teacher.role !== "teacher") return false;
  const gradeOk = (teacher.grades ?? []).includes(`G${lesson.grade}`);
  const lang = lesson.language ?? null;
  const tlang = teacher.language ?? null;
  const langOk = !lang || tlang === lang || tlang === "both";
  return gradeOk && langOk;
}

/** Curriculum order: lesson number, then title. */
export function byLessonNo(a: Lesson, b: Lesson): number {
  return (a.lessonNo ?? 0) - (b.lessonNo ?? 0) || a.title.localeCompare(b.title);
}

export function filterLessons(lessons: Lesson[], filters: LessonFilters): Lesson[] {
  // Each typed word must land somewhere, so "7 buzzer" works regardless of the
  // order it was typed in.
  const terms = filters.query.toLowerCase().split(/\s+/).filter(Boolean);
  return lessons.filter((l) => {
    if (filters.year !== "all" && yearOf(l) !== filters.year) return false;
    if (filters.grade !== "all" && l.grade !== filters.grade) return false;
    if (filters.lang !== "all" && (l.language ?? "") !== filters.lang) return false;
    if (terms.length === 0) return true;
    const hay = `${l.title} ${l.subject ?? ""} ${l.course ?? ""} grade ${
      l.grade
    } year ${yearOf(l)}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

export function filtersActive(filters: LessonFilters): boolean {
  return (
    filters.query.trim() !== "" ||
    filters.year !== "all" ||
    filters.grade !== "all" ||
    filters.lang !== "all"
  );
}

export type TrackGroup = {
  /** Stable across renders, and what the collapse state is keyed on. */
  key: string;
  year: number;
  grade: number;
  lessons: Lesson[];
};

/**
 * One group per year AND grade, ordered Year 1 first.
 *
 * Grouping on grade alone put Year 1 Grade 7 and Year 2 Grade 7 in the same
 * bucket - two different courses under one heading, with duplicate lesson
 * numbers. Splitting the key rather than adding a second level of nesting
 * keeps the list one deep: the heading carries both facts and nothing new
 * has to be opened.
 */
export function groupByTrack(lessons: Lesson[]): TrackGroup[] {
  const groups = new Map<string, Lesson[]>();
  for (const l of lessons) {
    const key = `${yearOf(l)}-${l.grade}`;
    const bucket = groups.get(key) ?? [];
    groups.set(key, bucket);
    bucket.push(l);
  }
  return Array.from(groups.entries())
    .map(([key, list]) => {
      const [year, grade] = key.split("-").map(Number);
      return { key, year, grade, lessons: [...list].sort(byLessonNo) };
    })
    .sort((a, b) => a.year - b.year || a.grade - b.grade);
}

export function coverageOf(teacherId: string, selection: Lesson[]): Coverage {
  if (selection.length === 0) return "none";
  let hit = 0;
  for (const lesson of selection) {
    if (lesson.assignedTeacherIds.includes(teacherId)) hit += 1;
  }
  if (hit === 0) return "none";
  return hit === selection.length ? "all" : "some";
}

export function assignedCount(teacherId: string, selection: Lesson[]): number {
  return selection.filter((l) => l.assignedTeacherIds.includes(teacherId)).length;
}

/** What the row shows once the admin's pending intent is layered on top. */
export function shownState(intent: Intent | undefined, coverage: Coverage): Coverage {
  if (intent === "add") return "all";
  if (intent === "remove") return "none";
  return coverage;
}

/**
 * Clicking a teacher.
 *
 * All-or-nothing coverage is a plain toggle. A partly-covered selection gets a
 * third stop, so "fill it up", "clear it out" and "leave it as it was" are all
 * reachable without hunting for a reset.
 */
export function nextIntent(current: Intent | undefined, coverage: Coverage): Intent | undefined {
  if (coverage === "some") {
    if (current === undefined) return "add";
    return current === "add" ? "remove" : undefined;
  }
  if (current) return undefined;
  return coverage === "all" ? "remove" : "add";
}

export type PendingEdit = {
  addIds: string[];
  removeIds: string[];
  /** Assignments that would be created — pairs, not teachers. */
  adds: number;
  removes: number;
  lessonsTouched: number;
};

export function computeEdit(
  intents: Record<string, Intent>,
  selection: Lesson[]
): PendingEdit {
  const addIds = Object.keys(intents).filter((id) => intents[id] === "add");
  const removeIds = Object.keys(intents).filter((id) => intents[id] === "remove");

  let adds = 0;
  let removes = 0;
  let lessonsTouched = 0;
  for (const lesson of selection) {
    const assigned = new Set(lesson.assignedTeacherIds);
    const newHere = addIds.filter((id) => !assigned.has(id)).length;
    const goneHere = removeIds.filter((id) => assigned.has(id)).length;
    adds += newHere;
    removes += goneHere;
    if (newHere || goneHere) lessonsTouched += 1;
  }
  return { addIds, removeIds, adds, removes, lessonsTouched };
}

/** "Add 2 teachers to 12 lessons · 19 new" — the sentence above the button. */
export function describeEdit(edit: PendingEdit, teacherNames: (id: string) => string): string {
  const parts: string[] = [];
  if (edit.addIds.length > 0) {
    const who =
      edit.addIds.length <= 2
        ? edit.addIds.map(teacherNames).join(" and ")
        : `${edit.addIds.length} teachers`;
    parts.push(`give ${who} ${edit.adds} lesson${edit.adds === 1 ? "" : "s"}`);
  }
  if (edit.removeIds.length > 0) {
    const who =
      edit.removeIds.length <= 2
        ? edit.removeIds.map(teacherNames).join(" and ")
        : `${edit.removeIds.length} teachers`;
    parts.push(`take ${edit.removes} lesson${edit.removes === 1 ? "" : "s"} from ${who}`);
  }
  if (parts.length === 0) return "No changes yet.";
  const sentence = parts.join(", and ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
}
