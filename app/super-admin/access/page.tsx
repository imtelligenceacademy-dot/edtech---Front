"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, Check, Info, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ApplyBar } from "@/components/super-admin/access/ApplyBar";
import { LessonPicker } from "@/components/super-admin/access/LessonPicker";
import { TeacherPicker } from "@/components/super-admin/access/TeacherPicker";
import {
  bulkAssignments,
  deleteLesson,
  listLessons,
  listSchools,
  listUsers,
  previewBulkAssignments,
  type BulkAssignmentPreview,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  EMPTY_LESSON_FILTERS,
  computeEdit,
  coverageOf,
  describeEdit,
  filterLessons,
  nextIntent,
  type Intent,
  type LessonFilters,
} from "@/lib/super-admin/access";
import type { Lesson, School, User } from "@/types";

export default function AccessControlPage() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [schoolId, setSchoolId] = useState("");
  const [filters, setFilters] = useState<LessonFilters>(EMPTY_LESSON_FILTERS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  // What the admin has asked for, per teacher, on top of what the selection
  // currently says. Cleared whenever the question changes.
  const [intents, setIntents] = useState<Record<string, Intent>>({});

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // A removal throws away teachers' progress, so that one gets confirmed.
  const [preview, setPreview] = useState<BulkAssignmentPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const [deletingLesson, setDeletingLesson] = useState<Lesson | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const lastTouched = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [lessonRows, schoolRows, userRows] = await Promise.all([
        listLessons(),
        listSchools(),
        listUsers(),
      ]);
      setLessons(lessonRows);
      setSchools(schoolRows);
      setUsers(userRows);
      setSchoolId((cur) => cur || schoolRows[0]?.id || "");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load Access Control.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shownLessons = useMemo(
    () => filterLessons(lessons, filters),
    [lessons, filters]
  );
  const selection = useMemo(
    () => lessons.filter((l) => selectedIds.has(l.id)),
    [lessons, selectedIds]
  );

  const schoolTeachers = useMemo(
    () =>
      users.filter(
        (u) => u.role === "teacher" && u.schoolId === schoolId && u.status === "active"
      ),
    [users, schoolId]
  );

  const edit = useMemo(() => computeEdit(intents, selection), [intents, selection]);
  const teacherName = useCallback(
    (id: string) => users.find((u) => u.id === id)?.name ?? "a teacher",
    [users]
  );
  const summary = useMemo(() => {
    if (selection.length === 0) return "Tick some lessons to start.";
    if (edit.adds === 0 && edit.removes === 0) {
      return `${selection.length} lesson${
        selection.length === 1 ? "" : "s"
      } selected — now pick who should have them.`;
    }
    return describeEdit(edit, teacherName);
  }, [edit, selection.length, teacherName]);

  function clearPending() {
    setIntents({});
    setError(null);
    setDone(null);
  }

  function toggleMany(ids: string[], next: boolean) {
    clearPending();
    setSelectedIds((cur) => {
      const copy = new Set(cur);
      for (const id of ids) {
        if (next) copy.add(id);
        else copy.delete(id);
      }
      return copy;
    });
  }

  function toggleLesson(id: string, shiftKey: boolean, list: string[]) {
    const anchor = lastTouched.current;
    lastTouched.current = id;
    const turningOn = !selectedIds.has(id);

    if (shiftKey && anchor && anchor !== id) {
      const from = list.indexOf(anchor);
      const to = list.indexOf(id);
      if (from !== -1 && to !== -1) {
        const [start, end] = from < to ? [from, to] : [to, from];
        toggleMany(list.slice(start, end + 1), turningOn);
        return;
      }
    }
    toggleMany([id], turningOn);
  }

  function toggleTeacher(teacherId: string) {
    setDone(null);
    setError(null);
    setIntents((cur) => {
      const next = { ...cur };
      const wanted = nextIntent(cur[teacherId], coverageOf(teacherId, selection));
      if (wanted) next[teacherId] = wanted;
      else delete next[teacherId];
      return next;
    });
  }

  function applyResult(updated: Lesson[]) {
    const byId = new Map(updated.map((l) => [l.id, l]));
    setLessons((cur) => cur.map((l) => byId.get(l.id) ?? l));
  }

  async function runApply() {
    setBusy(true);
    setError(null);
    try {
      const result = await bulkAssignments({
        schoolId,
        lessonIds: Array.from(selectedIds),
        addTeacherIds: edit.addIds,
        removeTeacherIds: edit.removeIds,
      });
      applyResult(result.lessons);
      setIntents({});
      setPreview(null);
      setDone(
        `${result.assignmentsAdded} assignment${
          result.assignmentsAdded === 1 ? "" : "s"
        } added, ${result.assignmentsRemoved} removed, across ${
          result.lessonsTouched
        } lesson${result.lessonsTouched === 1 ? "" : "s"}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply the changes.");
    } finally {
      setBusy(false);
    }
  }

  // Adding is harmless and applies straight away. Removing deletes the
  // teacher's progress, so if any of it is real work, ask first.
  async function apply() {
    if (edit.removes === 0) return runApply();
    setPreviewing(true);
    setError(null);
    try {
      const result = await previewBulkAssignments({
        schoolId,
        lessonIds: Array.from(selectedIds),
        addTeacherIds: edit.addIds,
        removeTeacherIds: edit.removeIds,
      });
      if (result.progressLost === 0) {
        await runApply();
        return;
      }
      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't check what this changes.");
    } finally {
      setPreviewing(false);
    }
  }

  async function confirmDeleteLesson() {
    if (!deletingLesson) return;
    setDeleteBusy(true);
    setError(null);
    try {
      const removedId = deletingLesson.id;
      await deleteLesson(removedId);
      setLessons((cur) => cur.filter((l) => l.id !== removedId));
      setSelectedIds((cur) => {
        const copy = new Set(cur);
        copy.delete(removedId);
        return copy;
      });
      setDeletingLesson(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete lesson.");
    } finally {
      setDeleteBusy(false);
    }
  }

  function toggleCollapse(grade: number) {
    setCollapsed((cur) => {
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

      <div className="mb-4 flex items-start gap-2 rounded-lg border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <Info size={16} className="mt-0.5 shrink-0 text-sky-600" />
        <p>
          Lessons are normally assigned automatically when a PDF is uploaded — to every
          teacher of that <strong>grade</strong> and <strong>language</strong>. Use this page
          for the exceptions. Tick <strong>as many lessons as you like</strong>, pick the
          school, then add or remove teachers across all of them in one go; teachers marked{" "}
          <Badge tone="muted">Auto</Badge> are already covered by the rules.
        </p>
      </div>

      {loadError && (
        <Card className="mb-4 border-red-200 bg-red-50/60">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <AlertCircle size={16} className="shrink-0 text-red-500" />
            <p className="flex-1 text-sm text-red-700">{loadError}</p>
            <Button size="sm" variant="secondary" onClick={load}>
              Try again
            </Button>
          </div>
        </Card>
      )}

      {loading ? (
        <p className="flex items-center justify-center gap-2 py-20 text-sm text-slate-400">
          <Loader2 size={15} className="animate-spin" /> Loading lessons and teachers…
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-5 pb-24 lg:grid-cols-12">
          <Card className="lg:col-span-5">
            <LessonPicker
              lessons={shownLessons}
              total={lessons.length}
              filters={filters}
              onFilters={(next) => {
                setFilters(next);
                setDone(null);
              }}
              selected={selectedIds}
              onToggleLesson={toggleLesson}
              onToggleMany={toggleMany}
              collapsed={collapsed}
              onToggleCollapse={toggleCollapse}
              onDeleteLesson={setDeletingLesson}
            />
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader title="2. School" subtitle="Filters the teacher list" />
            <CardBody className="space-y-2">
              {schools.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    if (s.id === schoolId) return;
                    setSchoolId(s.id);
                    clearPending();
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

          <Card className="lg:col-span-4">
            <TeacherPicker
              teachers={schoolTeachers}
              selection={selection}
              intents={intents}
              onToggle={toggleTeacher}
            />
          </Card>
        </div>
      )}

      {done && (
        <div className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 shadow-sm">
            <Check size={13} /> {done}
          </span>
        </div>
      )}

      {!loading && (
        <ApplyBar
          edit={edit}
          summary={summary}
          busy={busy || previewing}
          error={error}
          onReset={clearPending}
          onApply={apply}
        />
      )}

      {/* Removing an assignment deletes that teacher's progress on the lesson,
          so a removal that costs real work gets confirmed. */}
      <Modal
        open={preview !== null}
        onClose={() => setPreview(null)}
        title="This removes work teachers have done"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPreview(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={runApply} disabled={busy}>
              {busy ? "Applying…" : `Remove ${preview?.removes ?? 0}`}
            </Button>
          </>
        }
      >
        {preview && (
          <div className="space-y-3 text-sm text-slate-600">
            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                <strong className="font-semibold">
                  {preview.progressLost} of the {preview.removes} assignments being removed
                </strong>{" "}
                have progress on them — the teacher has opened or finished that lesson.
                Removing the assignment deletes that record, and re-adding them starts it
                from zero.
              </span>
            </p>
            {preview.teachersLosingProgress.length > 0 && (
              <p className="text-xs">
                Affected: {preview.teachersLosingProgress.join(", ")}.
              </p>
            )}
            <p className="text-xs">
              {preview.adds > 0 && `${preview.adds} assignments will also be added. `}
              {preview.lessons} lesson{preview.lessons === 1 ? "" : "s"} change in total.
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={deletingLesson !== null}
        onClose={() => setDeletingLesson(null)}
        title="Delete lesson"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeletingLesson(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDeleteLesson} disabled={deleteBusy}>
              {deleteBusy ? "Deleting…" : "Delete lesson"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Delete{" "}
          <span className="font-medium text-slate-900">{deletingLesson?.title}</span>? This
          removes it from every teacher and their progress on it, and deletes its PDF. This
          cannot be undone.
        </p>
      </Modal>
    </>
  );
}
