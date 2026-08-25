// The teacher's URL carries the grade they're teaching, so the browser's Back
// button walks the session (grade gate -> a grade -> ICT Fair) instead of
// falling out of the app, and a grade can be bookmarked or reopened directly.
//
//   /teacher            the grade gate
//   /teacher/grade-7    the assistant, scoped to grade 7
//   /teacher/ict-fair   the ICT Fair projects (no grade)

export const TEACHER_HOME = "/teacher";
export const TEACHER_FAIR = "/teacher/ict-fair";

export function gradePath(grade: number): string {
  return `${TEACHER_HOME}/grade-${grade}`;
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
