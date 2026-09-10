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

/**
 * A project's name as a person reads it.
 *
 * The title is the uploaded filename minus its extension, so it arrives as
 * Grade_11_Physics_Collision_Crash_Safety_Tester. Underscores are how a
 * filesystem spells a space, not how a teacher reads one — and CSS sees the
 * whole thing as a single unbreakable word, so it cannot wrap and the end of
 * the name is clipped off. That end is the part that says which project it is.
 *
 * Spelling it with spaces fixes both at once: it reads properly, and it gives
 * the browser somewhere to break.
 */
export function projectTitle(project: FairProject): string {
  return project.title.replace(/_+/g, " ").trim();
}

/** Underscores and spaces treated alike, so a search matches either spelling. */
function searchable(text: string): string {
  return text.replace(/_+/g, " ").toLowerCase();
}

/** "KG1, KG2" — the grades a section covers, in curriculum order. */
export function sectionGradeLabels(section: FairSection): string[] {
  return ALL_GRADE_CODES.filter((c) => section.grades.includes(c)).map(gradeLabel);
}

export function matchesQuery(section: FairSection, query: string): boolean {
  // Both sides normalised, so "Grade 11" and "Grade_11" find the same project.
  // A teacher types what they see on screen; what they see now has spaces.
  const q = searchable(query.trim());
  if (!q) return true;
  const haystack = searchable(
    [
      section.title,
      section.blurb ?? "",
      ...sectionGradeLabels(section),
      ...section.projects.map((p) => p.title),
    ].join(" ")
  );
  return haystack.includes(q);
}

/** Projects inside a section that match the search, so a hit on a project title
 *  narrows the section to the project rather than showing all of its siblings. */
export function visibleProjects(
  section: FairSection,
  query: string
): FairProject[] {
  const q = searchable(query.trim());
  if (!q) return section.projects;
  // A section matched by its own name or grade keeps all of its projects.
  const sectionItself = searchable(
    [section.title, section.blurb ?? "", ...sectionGradeLabels(section)].join(" ")
  );
  if (sectionItself.includes(q)) return section.projects;
  return section.projects.filter((p) => searchable(p.title).includes(q));
}

export function countProjects(sections: FairSection[]): number {
  return sections.reduce((total, s) => total + s.projects.length, 0);
}
