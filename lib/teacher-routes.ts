// The teacher's URL carries the grade they're teaching, so the browser's Back
// button walks the session (grade gate -> a grade -> ICT Fair) instead of
// falling out of the app, and a grade can be bookmarked or reopened directly.
//
//   /teacher              the grade gate
//   /teacher/grade-7      the assistant, scoped to grade 7
//   /teacher/grade-6/6b   the assistant, scoped to one class of grade 6
//   /teacher/ict-fair     the ICT Fair projects (no grade)
//
// The class segment appears only for a teacher who takes the same grade more
// than once. Everyone else goes straight from the grade to their lessons and
// never sees a class named anywhere.

export const TEACHER_HOME = "/teacher";
export const TEACHER_FAIR = "/teacher/ict-fair";

export function gradePath(grade: number): string {
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
  return sections?.[`G${grade}`] ?? [];
}

// Reads the grade out of a URL segment. Tolerant of what someone might type
// ("grade-7", "grade7", "Grade 7", "7"); null means "not a grade segment".
export function parseGradeSegment(segment?: string | string[]): number | null {
  const raw = Array.isArray(segment) ? segment[0] : segment;
  if (!raw) return null;
  const match = decodeURIComponent(raw).match(/^grade[-\s_]?(\d{1,2})$|^(\d{1,2})$/i);
  const grade = Number(match?.[1] ?? match?.[2]);
  return Number.isInteger(grade) && grade >= 1 && grade <= 12 ? grade : null;
}
