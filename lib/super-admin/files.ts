"use client";

// Turning the flat list of uploaded PDFs into the shape the Files page browses:
// year -> grade -> language, in curriculum order, with the parts of a filename
// that the folder already told you stripped back out of it.
//
// Pure functions only — the page owns the state, this owns the arithmetic.

import { COURSE_ORDER, courseLabel } from "@/lib/teacher/lesson-order";
import type { Lesson, UploadedFile } from "@/types";

export type Lang = "en" | "fr";
export type LangKey = Lang | "other";

export type FileNode = {
  file: UploadedFile;
  year: number | null;
  grade: number | null;
  lang: LangKey;
  course: string | null;
  lessonNo: number | null;
  /** The filename minus the grade/lesson prefix the folder already states. */
  label: string;
  /** Everything searchable about the row, lowercased once up front. */
  haystack: string;
};

export type GradeGroup = {
  grade: number;
  en: FileNode[];
  fr: FileNode[];
  other: FileNode[];
  nodes: FileNode[];
};

export type YearGroup = { year: number; grades: GradeGroup[]; nodes: FileNode[] };

export type FileTree = { years: YearGroup[]; unsorted: FileNode[]; total: number };

export type Filters = {
  search: string;
  year: number | "all";
  grade: number | "all";
  lang: Lang | "all";
};

export const EMPTY_FILTERS: Filters = {
  search: "",
  year: "all",
  grade: "all",
  lang: "all",
};

export const YEARS = [1, 2] as const;
export const GRADES = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * "Grade 2 microbit Lesson 08 Tilt Warning Picture.pdf" -> "Tilt Warning Picture".
 *
 * Inside a Grade 2 folder every row repeating "Grade 2 … Lesson NN" is noise;
 * the number becomes its own chip and the title carries the meaning. Anything
 * that doesn't match the convention is left alone — for those the full name is
 * the only information there is.
 */
export function fileLabel(filename: string): string {
  const withoutExt = filename.replace(/\.pdf$/i, "").trim();
  const stripped = withoutExt
    .replace(
      /^grade\s*\d+\s*[-–—]?\s*(?:python|micro:?\s?bit)?\s*[-–—]?\s*lesson\s*\d+\s*[-–—:.]?\s*/i,
      ""
    )
    .trim();
  return stripped || withoutExt;
}

export function langLabel(lang: LangKey): string {
  if (lang === "en") return "English";
  if (lang === "fr") return "French";
  return "Unspecified language";
}

export { courseLabel };

/** Join a PDF to the lesson it created, so the row knows where it belongs. */
export function buildNodes(files: UploadedFile[], lessons: Lesson[]): FileNode[] {
  const lessonById = new Map(lessons.map((l) => [l.id, l]));
  return files.map((file) => {
    const lesson = file.linkedLessonId ? lessonById.get(file.linkedLessonId) : undefined;
    const lang: LangKey =
      lesson?.language === "en" ? "en" : lesson?.language === "fr" ? "fr" : "other";
    return {
      file,
      year: lesson?.year ?? null,
      grade: lesson?.grade ?? null,
      lang,
      course: lesson?.course ?? null,
      lessonNo: lesson?.lessonNo ?? null,
      label: fileLabel(file.filename),
      haystack: `${file.filename} ${lesson?.title ?? ""} ${lesson?.course ?? ""}`.toLowerCase(),
    };
  });
}

/** Curriculum order: course first, then lesson number, then name. */
export function compareNodes(a: FileNode, b: FileNode): number {
  return (
    (COURSE_ORDER[a.course ?? ""] ?? 0) - (COURSE_ORDER[b.course ?? ""] ?? 0) ||
    (a.lessonNo ?? Number.MAX_SAFE_INTEGER) - (b.lessonNo ?? Number.MAX_SAFE_INTEGER) ||
    a.file.filename.localeCompare(b.file.filename)
  );
}

export function filterNodes(nodes: FileNode[], filters: Filters): FileNode[] {
  // Every space-separated word must match somewhere, so "7 buzzer" finds the
  // Grade 7 buzzer lesson without caring about the order they were typed in.
  const terms = filters.search.toLowerCase().split(/\s+/).filter(Boolean);
  return nodes.filter((n) => {
    if (filters.year !== "all" && n.year !== filters.year) return false;
    if (filters.grade !== "all" && n.grade !== filters.grade) return false;
    if (filters.lang !== "all" && n.lang !== filters.lang) return false;
    return terms.every((term) => n.haystack.includes(term));
  });
}

export function hasActiveFilters(filters: Filters): boolean {
  return (
    filters.search.trim() !== "" ||
    filters.year !== "all" ||
    filters.grade !== "all" ||
    filters.lang !== "all"
  );
}

export function buildTree(nodes: FileNode[]): FileTree {
  const byYear = new Map<number, Map<number, FileNode[]>>();
  const unsorted: FileNode[] = [];

  for (const node of nodes) {
    if (node.year == null || node.grade == null) {
      unsorted.push(node);
      continue;
    }
    const grades = byYear.get(node.year) ?? new Map<number, FileNode[]>();
    byYear.set(node.year, grades);
    const bucket = grades.get(node.grade) ?? [];
    grades.set(node.grade, bucket);
    bucket.push(node);
  }

  const years: YearGroup[] = Array.from(byYear.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, gradeMap]) => {
      const grades: GradeGroup[] = Array.from(gradeMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([grade, list]) => {
          const sorted = [...list].sort(compareNodes);
          return {
            grade,
            nodes: sorted,
            en: sorted.filter((n) => n.lang === "en"),
            fr: sorted.filter((n) => n.lang === "fr"),
            other: sorted.filter((n) => n.lang === "other"),
          };
        });
      return { year, grades, nodes: grades.flatMap((g) => g.nodes) };
    });

  return {
    years,
    unsorted: unsorted.sort((a, b) => a.file.filename.localeCompare(b.file.filename)),
    total: nodes.length,
  };
}

export function idsOf(nodes: FileNode[]): string[] {
  return nodes.map((n) => n.file.id);
}

/** Names the zip after what was picked: "year-2-grade-7-en". */
export function selectionLabel(
  scope: { year?: number; grade?: number; lang?: LangKey } = {}
): string {
  const parts: string[] = [];
  if (scope.year) parts.push(`year-${scope.year}`);
  if (scope.grade) parts.push(`grade-${scope.grade}`);
  if (scope.lang && scope.lang !== "other") parts.push(scope.lang);
  return parts.join("-") || "selection";
}

export type SelectionState = "none" | "some" | "all";

export function selectionStateOf(nodes: FileNode[], selected: Set<string>): SelectionState {
  if (nodes.length === 0) return "none";
  let hit = 0;
  for (const node of nodes) if (selected.has(node.file.id)) hit += 1;
  if (hit === 0) return "none";
  return hit === nodes.length ? "all" : "some";
}
