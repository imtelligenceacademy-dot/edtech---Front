// Where every teacher has actually got to.
//
// Three states and no fourth. A lesson is finished, in progress, or not
// started - there is deliberately no "late" and no "overdue" anywhere in this
// file. Due dates and the watchdog exist in the data and are ignored here: the
// question this page answers is where someone is, not whether they should have
// been somewhere else by now. A `late` watchdog is simply a lesson in
// progress, and reads that way.
//
// Two things worth getting right:
//
// A Progress row only exists once a teacher opens a lesson, so the list of
// lessons has to come from the assignment, not from the progress table.
// Otherwise a teacher who has not started shows as having nothing assigned,
// which looks identical to a teacher who was never given anything.
//
// "Finished" is the teacher marking it complete, not a slide position. Slide
// progress is a bookmark - it stops at 99% by design - so completion is read
// from the status, and the slide number is shown separately as where they are.

import type { Lesson, ProgressEntry, School, User } from "@/types";

export type LessonState = "finished" | "in-progress" | "not-started";

export type TeacherLesson = {
  lessonId: string;
  title: string;
  grade: number;
  lessonNo: number | null;
  course: string | null;
  state: LessonState;
  percent: number;
  /** Where they stopped, when the viewer recorded it. */
  slide: number | null;
  slideTotal: number | null;
  lastOpenedAt?: string;
};

export type TeacherProgress = {
  id: string;
  name: string;
  email: string;
  schoolId?: string;
  schoolName: string;
  grades: string[];
  language?: string | null;
  lessons: TeacherLesson[];
  assigned: number;
  finished: number;
  inProgress: number;
  notStarted: number;
  /** Finished over assigned, 0-100. */
  percent: number;
  /** The lessons they are in the middle of right now, most recent first. */
  current: TeacherLesson[];
  lastOpenedAt?: string;
};

export type ProgressFilter = "all" | "finished" | "unfinished";

export const STATE_LABEL: Record<LessonState, string> = {
  finished: "Finished",
  "in-progress": "In progress",
  "not-started": "Not started",
};

function stateOf(entry: ProgressEntry | undefined): LessonState {
  if (!entry) return "not-started";
  // `completed` is the explicit "mark complete" action. Slide-based percent is
  // capped below 100 on purpose, so it can never be mistaken for finishing.
  if (entry.status === "completed" || entry.percentComplete >= 100) return "finished";
  if (entry.percentComplete > 0 || entry.lastOpenedAt) return "in-progress";
  return "not-started";
}

function newest(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) > new Date(b) ? a : b;
}

export function buildProgress(
  users: User[],
  lessons: Lesson[],
  progress: ProgressEntry[],
  schools: School[]
): TeacherProgress[] {
  const byKey = new Map<string, ProgressEntry>();
  for (const p of progress) byKey.set(`${p.teacherId}:${p.lessonId}`, p);
  const schoolName = new Map(schools.map((s) => [s.id, s.name]));

  return users
    .filter((u) => u.role === "teacher")
    .map((teacher) => {
      const mine = lessons
        .filter((l) => l.assignedTeacherIds?.includes(teacher.id))
        .sort(
          (a, b) =>
            (a.grade ?? 0) - (b.grade ?? 0) ||
            (a.course ?? "").localeCompare(b.course ?? "") ||
            (a.lessonNo ?? 0) - (b.lessonNo ?? 0)
        );

      let finished = 0;
      let inProgress = 0;
      let notStarted = 0;
      let lastOpenedAt: string | undefined;

      const rows: TeacherLesson[] = mine.map((lesson) => {
        const entry = byKey.get(`${teacher.id}:${lesson.id}`);
        const state = stateOf(entry);
        if (state === "finished") finished += 1;
        else if (state === "in-progress") inProgress += 1;
        else notStarted += 1;
        lastOpenedAt = newest(lastOpenedAt, entry?.lastOpenedAt);

        return {
          lessonId: lesson.id,
          title: lesson.title,
          grade: lesson.grade,
          lessonNo: lesson.lessonNo ?? null,
          course: lesson.course ?? null,
          state,
          percent: entry?.percentComplete ?? 0,
          slide: entry?.lastSlide ?? null,
          // The lesson itself does not carry a page count over the API, so the
          // teacher's own last save is the only source. Absent on rows written
          // before slide positions were recorded, which is why the detail view
          // shows the percentage when this is missing.
          slideTotal: entry?.slideTotal ?? (lesson.slides?.length || null),
          lastOpenedAt: entry?.lastOpenedAt,
        };
      });

      const assigned = rows.length;
      return {
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        schoolId: teacher.schoolId,
        schoolName: teacher.schoolId
          ? schoolName.get(teacher.schoolId) ?? "Unknown school"
          : "No school",
        grades: teacher.grades ?? [],
        language: teacher.language,
        lessons: rows,
        assigned,
        finished,
        inProgress,
        notStarted,
        percent: assigned === 0 ? 0 : Math.round((finished / assigned) * 100),
        // Most recently touched first, so the top one is the lesson they are
        // actually sitting in.
        current: rows
          .filter((r) => r.state === "in-progress")
          .sort((a, b) =>
            (b.lastOpenedAt ?? "").localeCompare(a.lastOpenedAt ?? "")
          ),
        lastOpenedAt,
      } satisfies TeacherProgress;
    })
    .sort(
      (a, b) => a.schoolName.localeCompare(b.schoolName) || a.name.localeCompare(b.name)
    );
}

/** Every typed word must appear somewhere, in any order. */
export function matchesTeacher(t: TeacherProgress, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = `${t.name} ${t.email} ${t.schoolName} ${t.grades.join(" ")} ${
    t.language ?? ""
  }`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function filterLessons(
  lessons: TeacherLesson[],
  filter: ProgressFilter
): TeacherLesson[] {
  if (filter === "finished") return lessons.filter((l) => l.state === "finished");
  if (filter === "unfinished") return lessons.filter((l) => l.state !== "finished");
  return lessons;
}

/** How a course is written for a teacher rather than for the database. */
export function courseLabel(course: string | null): string {
  if (course === "python") return "Python";
  if (course === "microbit") return "micro:bit";
  return "";
}

export type Track = { grade: number; course: string | null; lessons: TeacherLesson[] };

/**
 * Consecutive lessons of the same grade AND course. Headings, not folders -
 * nothing collapses, they only break a long list into places you can find
 * yourself in.
 *
 * Course matters because lesson numbers restart per course: a grade running
 * both Python and micro:bit has two "Lesson 1", and listed together they read
 * as a numbering bug rather than as two tracks.
 */
export function byTrack(lessons: TeacherLesson[]): Track[] {
  const out: Track[] = [];
  for (const lesson of lessons) {
    const last = out[out.length - 1];
    if (last && last.grade === lesson.grade && last.course === lesson.course) {
      last.lessons.push(lesson);
    } else {
      out.push({ grade: lesson.grade, course: lesson.course, lessons: [lesson] });
    }
  }
  return out;
}

export function totals(teachers: TeacherProgress[]) {
  return teachers.reduce(
    (acc, t) => ({
      teachers: acc.teachers + 1,
      assigned: acc.assigned + t.assigned,
      finished: acc.finished + t.finished,
      inProgress: acc.inProgress + t.inProgress,
      notStarted: acc.notStarted + t.notStarted,
    }),
    { teachers: 0, assigned: 0, finished: 0, inProgress: 0, notStarted: 0 }
  );
}

export function whenLabel(iso?: string): string {
  if (!iso) return "Not opened yet";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (Number.isNaN(days)) return "Not opened yet";
  if (days <= 0) return "Opened today";
  if (days === 1) return "Opened yesterday";
  if (days < 7) return `Opened ${days} days ago`;
  if (days < 14) return "Opened last week";
  if (days < 60) return `Opened ${Math.floor(days / 7)} weeks ago`;
  return `Opened ${Math.floor(days / 30)} months ago`;
}
