// The teacher's URL carries the grade they're teaching, so the browser's Back
// button walks the session (grade gate -> a grade -> ICT Fair) instead of
// falling out of the app, and a grade can be bookmarked or reopened directly.
//
//   /teacher              the grade gate
//   /teacher/grade-7      the assistant, scoped to grade 7
//   /teacher/grade-6/6b   the assistant, scoped to one class of grade 6
//   /teacher/kg-1         kindergarten, which names itself rather than counting
//   /teacher/ict-fair     the ICT Fair projects (no grade)
//
// The class segment appears only for a teacher who takes the same grade more
// than once. Everyone else goes straight from the grade to their lessons and
// never sees a class named anywhere.

import { gradeCode, gradeNumber, isKindergarten } from "@/lib/grades";

export const TEACHER_HOME = "/teacher";
export const TEACHER_FAIR = "/teacher/ict-fair";

// A kindergarten grade is stored below zero, so the URL is built from its token
// rather than its number: /teacher/kg-1, not /teacher/grade--3.
export function gradePath(grade: number): string {
  const code = gradeCode(grade);
  if (isKindergarten(code)) {
    return `${TEACHER_HOME}/kg-${code.replace(/^KG/, "")}`;
  }
  return `${TEACHER_HOME}/grade-${grade}`;
}

// One class of a grade. The label is the admin's own text ("A", "2", "Red"),
// so it is encoded rather than assumed to be URL-safe.
export function sectionPath(grade: number, section: string): string {
  if (!section) return gradePath(grade);
  return `${gradePath(grade)}/${encodeURIComponent(section)}`;
}

// The class label out of a URL segment, matched against the classes the
// teacher actually takes. Anything else — a stale bookmark, a hand-typed URL,
// a class an admin has since removed — is null, and the caller sends them back
// to pick again rather than guessing which class they meant.
export function parseSectionSegment(
  segment: string | string[] | undefined,
  available: string[]
): string | null {
  const raw = Array.isArray(segment) ? segment[0] : segment;
  if (!raw) return null;
  const decoded = decodeURIComponent(raw);
  return (
    available.find((s) => s.toLowerCase() === decoded.toLowerCase()) ?? null
  );
}

// The classes a teacher takes for one grade, from the session. An empty list
// means the single unnamed class every teacher has by default.
export function sectionsForGrade(
  sections: Record<string, string[]> | undefined,
  grade: number
): string[] {
  return sections?.[gradeCode(grade)] ?? [];
}

// Reads the grade out of a URL segment. Tolerant of what someone might type
// ("grade-7", "grade7", "Grade 7", "7", "kg-1", "KG1"); null means "not a grade
// segment", which is what keeps /teacher/progress and /teacher/ict-fair from
// being mistaken for grades.
export function parseGradeSegment(segment?: string | string[]): number | null {
  const raw = Array.isArray(segment) ? segment[0] : segment;
  if (!raw) return null;
  const text = decodeURIComponent(raw).trim();
  const kg = text.match(/^kg[-\s_]?([123])$/i);
  if (kg) return gradeNumber(`KG${kg[1]}`);
  const match = text.match(/^grade[-\s_]?(\d{1,2})$|^(\d{1,2})$/i);
  if (!match) return null;
  return gradeNumber(match[1] ?? match[2]);
}
