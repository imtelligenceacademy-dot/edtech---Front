// Canonical grade tokens, kept in sync with the backend (services/grades.py).
//
// A grade is written two ways. Teachers hold tokens — "KG1", "G7" — because
// that is how a school says it. Lessons and progress carry an integer, because
// that is how the curriculum is ordered. Kindergarten has no number, so it is
// given one below zero, matching the server exactly:
//
//   KG1 -> -3   KG2 -> -2   KG3 -> -1   Grade 1 -> 1 ... Grade 12 -> 12
//
// Sorting a list of grades therefore puts kindergarten ahead of Grade 1 with no
// comparator to remember. Nothing outside this file builds `G${n}` by hand or
// reads the sign of a grade.

export type GradeOption = { code: string; label: string; short: string };

// Kindergarten, in curriculum order.
export const KG_CODE_TO_NUMBER: Record<string, number> = {
  KG1: -3,
  KG2: -2,
  KG3: -1,
};

const KG_NUMBER_TO_CODE: Record<number, string> = Object.fromEntries(
  Object.entries(KG_CODE_TO_NUMBER).map(([code, n]) => [n, code])
);

export const KG_CODES = Object.keys(KG_CODE_TO_NUMBER);

export const GRADE_OPTIONS: GradeOption[] = [
  { code: "KG1", label: "Kindergarten 1", short: "KG1" },
  { code: "KG2", label: "Kindergarten 2", short: "KG2" },
  { code: "KG3", label: "Kindergarten 3", short: "KG3" },
  ...Array.from({ length: 12 }, (_, i) => ({
    code: `G${i + 1}`,
    label: `Grade ${i + 1}`,
    short: `G${i + 1}`,
  })),
];

export const ALL_GRADE_CODES = GRADE_OPTIONS.map((g) => g.code);

/** Every grade a lesson may carry, as stored — kindergarten first. */
export const ALL_GRADE_NUMBERS: number[] = ALL_GRADE_CODES.map(
  (c) => gradeNumber(c) as number
);

export function isKindergarten(grade: number | string): boolean {
  return typeof grade === "string"
    ? grade in KG_CODE_TO_NUMBER
    : grade in KG_NUMBER_TO_CODE;
}

/** The token form of a stored grade: "KG2", "G7". */
export function gradeCode(grade: number | string): string {
  if (typeof grade === "string") return grade;
  return KG_NUMBER_TO_CODE[grade] ?? `G${grade}`;
}

/** The integer a token is stored as, or null if it is not a grade. */
export function gradeNumber(code: string): number | null {
  const text = (code ?? "").trim().toUpperCase();
  if (text in KG_CODE_TO_NUMBER) return KG_CODE_TO_NUMBER[text];
  const digits = text.startsWith("G") ? text.slice(1) : text;
  const n = Number(digits);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}

export function gradeLabel(code: string): string {
  return GRADE_OPTIONS.find((g) => g.code === code)?.short ?? code;
}

/** A stored grade as a teacher reads it on screen: "KG2", "Grade 7". */
export function gradeTitle(grade: number | string): string {
  const code = gradeCode(grade);
  return isKindergarten(code) ? code : `Grade ${code.replace(/^G/, "")}`;
}

/** How a grade is spoken on a picker card: the small-caps word, then the value.
 *  "Grade 6" and "Kindergarten 1" both read naturally in that shape, so the
 *  card itself needs no special case. */
export function gradeCardParts(grade: number | string): {
  kind: string;
  value: string;
} {
  const code = gradeCode(grade);
  return isKindergarten(code)
    ? { kind: "Kindergarten", value: code.replace(/^KG/, "") }
    : { kind: "Grade", value: code.replace(/^G/, "") };
}

// Compact, human summary of a grade selection, e.g. "KG1–KG2, Grade 1–6".
export function summarizeGrades(codes: string[]): string {
  if (!codes.length) return "No grades assigned";
  const ordered = ALL_GRADE_CODES.filter((c) => codes.includes(c));
  return ordered.map(gradeLabel).join(", ");
}
