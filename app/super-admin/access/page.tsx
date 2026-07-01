"use client";

import { useEffect, useState } from "react";
import { Check, Info, Wand2 } from "lucide-react";
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
          <CardHeader title="1. Lesson" />
          <CardBody className="space-y-2">
            {lessons.map((l) => (
              <button
                key={l.id}
                onClick={() => {
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
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="2. School" subtitle="Filters the teacher list" />
          <CardBody className="space-y-2">
            {schools.map((s) => (
              <button
                key={s.id}
                onClick={() => {
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
