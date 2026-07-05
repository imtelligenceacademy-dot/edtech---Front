"use client";

import { useEffect, useState } from "react";
import { Check, Info, Wand2, Search, ChevronRight, X } from "lucide-react";
import { PageHeader } from "@/components/layout/DashboardShell";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  assignTeacher,
  listLessons,
  listSchools,
  listUsers,
  unassignTeacher,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Lesson, School, User } from "@/types";

// A teacher is "auto-matched" if the upload rules would already assign this
// lesson to them (grade in their grades AND language matches). Anything you do
// beyond that set is an explicit exception.
function autoMatches(lesson: Lesson, teacher: User): boolean {
  if (teacher.role !== "teacher") return false;
  const gradeOk = (teacher.grades ?? []).includes(`G${lesson.grade}`);
  const lang = lesson.language ?? null;
  const tlang = teacher.language ?? null;
  const langOk = !lang || tlang === lang || tlang === "both";
  return gradeOk && langOk;
}

// Sort lessons by their curriculum number, then title, for a stable order.
function byLessonNo(a: Lesson, b: Lesson): number {
  return (a.lessonNo ?? 0) - (b.lessonNo ?? 0) || a.title.localeCompare(b.title);
}

export default function AccessControlPage() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [lessonId, setLessonId] = useState("");
  const [schoolId, setSchoolId] = useState("");
  // Working set of selected teacher ids per lesson (mutated by toggles).
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Lesson-browser facets (column 1).
  const [lessonQuery, setLessonQuery] = useState("");
  const [gradeFilter, setGradeFilter] = useState<number | "all">("all");
  const [langFilter, setLangFilter] = useState<string | "all">("all");
  const [collapsedGrades, setCollapsedGrades] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    Promise.all([listLessons(), listSchools(), listUsers()])
      .then(([lessonRows, schoolRows, userRows]) => {
        setLessons(lessonRows);
        setSchools(schoolRows);
        setUsers(userRows);
        setLessonId(lessonRows[0]?.id ?? "");
        setSchoolId(schoolRows[0]?.id ?? "");
        setAssignments(
          Object.fromEntries(lessonRows.map((l) => [l.id, l.assignedTeacherIds]))
        );
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  const lesson = lessons.find((l) => l.id === lessonId);
  const schoolTeachers = users.filter(
    (u) => u.role === "teacher" && u.schoolId === schoolId && u.status === "active"
  );
  const schoolTeacherIds = new Set(schoolTeachers.map((t) => t.id));
  const working = assignments[lessonId] ?? [];
  const selected = working.filter((id) => schoolTeacherIds.has(id));

  // Dirty if the working set differs from the persisted set for this school.
  const persistedInSchool = (lesson?.assignedTeacherIds ?? []).filter((id) =>
    schoolTeacherIds.has(id)
  );
  const dirty =
    selected.length !== persistedInSchool.length ||
    selected.some((id) => !persistedInSchool.includes(id));

  function confirmDiscardUnsaved(): boolean {
    return (
      !dirty ||
      window.confirm("You have unsaved teacher assignment changes. Discard them?")
    );
  }

  function toggle(id: string) {
    setSaved(false);
    setError(null);
    setAssignments((current) => {
      const list = current[lessonId] ?? [];
      return {
        ...current,
        [lessonId]: list.includes(id)
          ? list.filter((t) => t !== id)
          : [...list, id],
      };
    });
  }

  async function save() {
    if (!lesson) return;
    setSaving(true);
    setError(null);
    const savedSet = new Set(lesson.assignedTeacherIds);
    const toAdd = selected.filter((id) => !savedSet.has(id));
    const toRemove = persistedInSchool.filter((id) => !selected.includes(id));

    try {
      let updated = lesson;
      for (const id of toAdd) updated = await assignTeacher(lessonId, id);
      for (const id of toRemove) updated = await unassignTeacher(lessonId, id);
      setLessons((cur) => cur.map((l) => (l.id === updated.id ? updated : l)));
      setAssignments((cur) => ({ ...cur, [updated.id]: updated.assignedTeacherIds }));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save assignment.");
    } finally {
      setSaving(false);
    }
  }

  // --- Lesson browser: facets + grouping (column 1) ----------------------- //
  const allGrades = Array.from(new Set(lessons.map((l) => l.grade))).sort((a, b) => a - b);
  const gradeCounts = new Map<number, number>();
  for (const l of lessons) gradeCounts.set(l.grade, (gradeCounts.get(l.grade) ?? 0) + 1);
  const languages = Array.from(
    new Set(
      lessons.map((l) => l.language).filter((v): v is NonNullable<typeof v> => Boolean(v))
    )
  ).sort();

  const q = lessonQuery.trim().toLowerCase();
  const filteredLessons = lessons.filter((l) => {
    if (gradeFilter !== "all" && l.grade !== gradeFilter) return false;
    if (langFilter !== "all" && (l.language ?? "") !== langFilter) return false;
    if (q) {
      const hay = `${l.title} ${l.subject ?? ""} grade ${l.grade}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Group the filtered lessons under their grade for a scannable, scalable list.
  const grouped = new Map<number, Lesson[]>();
  for (const l of filteredLessons) {
    const arr = grouped.get(l.grade) ?? [];
    arr.push(l);
    grouped.set(l.grade, arr);
  }
  grouped.forEach((arr) => arr.sort(byLessonNo));
  const groupedGrades = Array.from(grouped.keys()).sort((a, b) => a - b);
  const filtersActive = q !== "" || gradeFilter !== "all" || langFilter !== "all";

  function clearFilters() {
    setLessonQuery("");
    setGradeFilter("all");
    setLangFilter("all");
  }

  function toggleGradeCollapse(grade: number) {
    setCollapsedGrades((cur) => {
      const next = new Set(cur);
      if (next.has(grade)) next.delete(grade);
      else next.add(grade);
      return next;
    });
  }

  return (
    <>
      <PageHeader
        title="Access Control"
        subtitle="Manual overrides — exceptions to the automatic grade & language rules."
      />

      <div className="mb-6 flex items-start gap-2 rounded-lg border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <Info size={16} className="mt-0.5 shrink-0 text-sky-600" />
        <p>
          Lessons are normally assigned automatically when a PDF is uploaded —
          to every teacher of that <strong>grade</strong> and{" "}
          <strong>language</strong>. Use this page only for exceptions: give a
          lesson to a teacher who wouldn&apos;t auto-match, or remove one who did.
          Teachers marked <Badge tone="muted">Auto</Badge> are covered by the
          rules; re-uploading the lesson&apos;s PDF can re-add an auto-matched
          teacher you removed here.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader
            title="1. Lesson"
            subtitle={`${filteredLessons.length} of ${lessons.length} shown`}
          />
          <CardBody className="space-y-3">
            {/* Search */}
            <div className="relative">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={lessonQuery}
                onChange={(e) => setLessonQuery(e.target.value)}
                placeholder="Search lessons…"
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-8 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
              {lessonQuery && (
                <button
                  onClick={() => setLessonQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Grade rail */}
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              <button
                onClick={() => setGradeFilter("all")}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  gradeFilter === "all"
                    ? "border-brand bg-brand-50 text-brand-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                )}
              >
                All
              </button>
              {allGrades.map((g) => (
                <button
                  key={g}
                  onClick={() => setGradeFilter(g)}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    gradeFilter === g
                      ? "border-brand bg-brand-50 text-brand-700"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  G{g}
                  <span className="ml-1 text-[10px] text-slate-400">{gradeCounts.get(g)}</span>
                </button>
              ))}
            </div>

            {/* Language segmented control (hidden when only one language exists) */}
            {languages.length > 1 && (
              <div className="flex gap-1 rounded-lg border border-slate-200 p-0.5">
                {["all", ...languages].map((l) => (
                  <button
                    key={l}
                    onClick={() => setLangFilter(l)}
                    className={cn(
                      "flex-1 rounded-md px-2 py-1 text-xs font-medium capitalize transition-colors",
                      langFilter === l
                        ? "bg-brand-50 text-brand-700"
                        : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    {l === "all" ? "All" : l.toUpperCase()}
                  </button>
                ))}
              </div>
            )}

            {filtersActive && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-brand-700"
              >
                <X size={12} /> Clear filters
              </button>
            )}

            {/* Grouped, scrollable lesson list */}
            <div className="max-h-[58vh] space-y-3 overflow-y-auto pr-0.5">
              {groupedGrades.length === 0 && (
                <p className="py-6 text-center text-xs text-slate-500">
                  No lessons match your filters.
                </p>
              )}
              {groupedGrades.map((g) => {
                const groupLessons = grouped.get(g) ?? [];
                const collapsed = collapsedGrades.has(g);
                return (
                  <div key={g}>
                    <button
                      onClick={() => toggleGradeCollapse(g)}
                      className="sticky top-0 z-10 flex w-full items-center gap-1.5 bg-white/95 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 backdrop-blur"
                    >
                      <ChevronRight
                        size={13}
                        className={cn("transition-transform", !collapsed && "rotate-90")}
                      />
                      Grade {g}
                      <span className="text-slate-400">({groupLessons.length})</span>
                    </button>
                    {!collapsed && (
                      <div className="mt-1 space-y-2">
                        {groupLessons.map((l) => (
                          <button
                            key={l.id}
                            onClick={() => {
                              if (l.id === lessonId || !confirmDiscardUnsaved()) return;
                              setLessonId(l.id);
                              setSaved(false);
                              setError(null);
                            }}
                            className={cn(
                              "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                              lessonId === l.id
                                ? "border-brand bg-brand-50"
                                : "border-slate-200 hover:bg-slate-50"
                            )}
                          >
                            <div className="font-medium text-slate-900">{l.title}</div>
                            <div className="text-xs text-slate-500">
                              Grade {l.grade}
                              {l.language ? ` · ${l.language.toUpperCase()}` : ""} · {l.subject}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="2. School" subtitle="Filters the teacher list" />
          <CardBody className="space-y-2">
            {schools.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  if (s.id === schoolId || !confirmDiscardUnsaved()) return;
                  setSchoolId(s.id);
                  setSaved(false);
                  setError(null);
                }}
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  schoolId === s.id
                    ? "border-brand bg-brand-50"
                    : "border-slate-200 hover:bg-slate-50"
                )}
              >
                <div className="font-medium text-slate-900">{s.name}</div>
                <div className="text-xs text-slate-500">{s.teacherCount} teachers</div>
              </button>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="3. Teachers" subtitle={`${selected.length} assigned here`} />
          <CardBody className="space-y-2">
            {schoolTeachers.length === 0 && (
              <p className="text-xs text-slate-500">No active teachers in this school.</p>
            )}
            {schoolTeachers.map((t) => {
              const on = selected.includes(t.id);
              const auto = lesson ? autoMatches(lesson, t) : false;
              const isException = on !== auto; // assigned-but-not-auto, or auto-but-removed
              return (
                <button
                  key={t.id}
                  onClick={() => toggle(t.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                    on ? "border-brand bg-brand-50" : "border-slate-200 hover:bg-slate-50"
                  )}
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-slate-900">{t.name}</span>
                    <span className="block truncate text-xs text-slate-500">{t.email}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1">
                      {auto && <Badge tone="muted">Auto</Badge>}
                      {isException && (
                        <Badge tone="warning">
                          <Wand2 size={10} /> {on ? "Added" : "Removed"} override
                        </Badge>
                      )}
                    </span>
                  </span>
                  {on && <Check size={14} className="shrink-0 text-brand" />}
                </button>
              );
            })}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 flex items-center justify-end gap-3">
        {error && <span className="text-xs text-red-600">{error}</span>}
        {saved && !dirty && (
          <Badge tone="success">
            <Check size={12} /> Assignment saved
          </Badge>
        )}
        <Button onClick={save} disabled={saving || !dirty}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </>
  );
}
