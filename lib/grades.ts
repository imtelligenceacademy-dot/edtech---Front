// Canonical grade tokens, kept in sync with the backend (schemas/user.py).

export type GradeOption = { code: string; label: string; short: string };

export const GRADE_OPTIONS: GradeOption[] = [
  { code: "KG1", label: "Kindergarten 1", short: "KG1" },
  { code: "KG2", label: "Kindergarten 2", short: "KG2" },
  ...Array.from({ length: 12 }, (_, i) => ({
    code: `G${i + 1}`,
    label: `Grade ${i + 1}`,
    short: `G${i + 1}`,
  })),
];

export const ALL_GRADE_CODES = GRADE_OPTIONS.map((g) => g.code);

export function gradeLabel(code: string): string {
  return GRADE_OPTIONS.find((g) => g.code === code)?.short ?? code;
}

// Compact, human summary of a grade selection, e.g. "KG1–KG2, Grade 1–6".
export function summarizeGrades(codes: string[]): string {
  if (!codes.length) return "No grades assigned";
  const ordered = ALL_GRADE_CODES.filter((c) => codes.includes(c));
  return ordered.map(gradeLabel).join(", ");
}
