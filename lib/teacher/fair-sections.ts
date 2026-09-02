import { ALL_GRADE_CODES, gradeLabel } from "@/lib/grades";
import type { FairProject, FairSection } from "@/types";

// Presentation helpers for the ICT Fair screen.
//
// The fair used to be one flat list of PDFs for every teacher who had access,
// which stopped being readable past a handful: a Grade 2 teacher scrolled past
// twelve secondary-school projects to find theirs. Sections group them by the
// grades they are for.
//
// Sections come from GET /api/fair/sections, already scoped by the server to
// the teacher's own school. Everything in this file is presentation: ordering,
// searching and narrowing what the server already decided they may see.

/** Lowest grade in a section, for ordering. Sections with no grades sort last. */
function lowestGradeIndex(section: FairSection): number {
  const indices = section.grades
    .map((g) => ALL_GRADE_CODES.indexOf(g))
    .filter((i) => i >= 0);
  return indices.length ? Math.min(...indices) : Number.MAX_SAFE_INTEGER;
}

/** Curriculum order — KG1 upward — so the page reads the way a school does. */
export function sortSections(sections: FairSection[]): FairSection[] {
  return [...sections].sort(
    (a, b) => lowestGradeIndex(a) - lowestGradeIndex(b) || a.title.localeCompare(b.title)
  );
}

/** "KG1, KG2" — the grades a section covers, in curriculum order. */
export function sectionGradeLabels(section: FairSection): string[] {
  return ALL_GRADE_CODES.filter((c) => section.grades.includes(c)).map(gradeLabel);
}

/** Whether any of the teacher's grades fall inside this section. */
export function matchesTeacherGrades(
  section: FairSection,
  teacherGrades: string[]
): boolean {
  if (teacherGrades.length === 0) return true;
  return section.grades.some((g) => teacherGrades.includes(g));
}

export function matchesQuery(section: FairSection, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    section.title,
    section.blurb ?? "",
    ...sectionGradeLabels(section),
    ...section.projects.map((p) => p.title),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

/** Projects inside a section that match the search, so a hit on a project title
 *  narrows the section to the project rather than showing all of its siblings. */
export function visibleProjects(
  section: FairSection,
  query: string
): FairProject[] {
  const q = query.trim().toLowerCase();
  if (!q) return section.projects;
  // A section matched by its own name or grade keeps all of its projects.
  const sectionItself = [section.title, section.blurb ?? "", ...sectionGradeLabels(section)]
    .join(" ")
    .toLowerCase();
  if (sectionItself.includes(q)) return section.projects;
  return section.projects.filter((p) => p.title.toLowerCase().includes(q));
}

export function countProjects(sections: FairSection[]): number {
  return sections.reduce((total, s) => total + s.projects.length, 0);
}
