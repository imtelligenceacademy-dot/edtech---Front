"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Info,
  Lock,
  Unlock,
} from "lucide-react";
import { PageHeader } from "@/components/layout/DashboardShell";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { getTeacherAccess, setLessonOverride } from "@/lib/api";
import { summarizeGrades } from "@/lib/grades";
import type { LessonAccessStatus, TeacherAccess } from "@/types";

const STATUS_META: Record<
  LessonAccessStatus,
  { label: string; tone: "success" | "muted" | "warning"; Icon: typeof Lock }
> = {
  available: { label: "Available", tone: "success", Icon: Unlock },
  completed: { label: "Completed", tone: "muted", Icon: CheckCircle2 },
  waiting: { label: "Waiting", tone: "warning", Icon: Clock },
  locked: { label: "Locked", tone: "muted", Icon: Lock },
};

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function TeacherLessonAccessPage() {
  const params = useParams<{ teacherId: string }>();
  const teacherId = params.teacherId;
  const [data, setData] = useState<TeacherAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // lessonId being toggled

  function load() {
    setLoading(true);
    getTeacherAccess(teacherId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load access."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId]);

  async function toggle(lessonId: string, next: boolean) {
    setBusy(lessonId);
    setError(null);
    try {
      await setLessonOverride(teacherId, lessonId, next);
      // Re-fetch: unlocking one lesson can cascade to later lessons in the track.
      const fresh = await getTeacherAccess(teacherId);
      setData(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update access.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return null;
  if (!data) {
    return (
      <>
        <PageHeader title="Lesson Unlock" subtitle="Teacher not found." />
        <Link href="/super-admin/lesson-access" className="text-sm text-brand-600 hover:underline">
          ← Back to teachers
        </Link>
      </>
    );
  }

  const totalLessons = data.tracks.reduce((n, t) => n + t.lessons.length, 0);

  return (
    <>
      <Link
        href="/super-admin/lesson-access"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft size={15} /> All teachers
      </Link>

      <PageHeader
        title={data.teacherName}
        subtitle={`${data.email} · ${summarizeGrades(data.grades)}${
          data.language ? ` · ${data.language.toUpperCase()}` : ""
        }`}
      />

      <div className="mb-6 flex items-start gap-2 rounded-lg border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <Info size={16} className="mt-0.5 shrink-0 text-sky-600" />
        <p>
          Granting <strong>access</strong> unlocks a lesson immediately — bypassing
          the waiting period, or reopening one the teacher has completed. Revoke it
          to return the lesson to the normal one-at-a-time schedule.
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {totalLessons === 0 && (
        <Card>
          <CardBody>
            <p className="text-sm text-slate-500">
              This teacher has no assigned lessons yet.
            </p>
          </CardBody>
        </Card>
      )}

      <div className="space-y-6">
        {data.tracks.map((track) => (
          <Card key={`${track.grade}-${track.language ?? ""}`}>
            <CardHeader
              title={`Grade ${track.grade}${track.language ? ` · ${track.language.toUpperCase()}` : ""}`}
              subtitle={`${track.lessons.length} lesson${track.lessons.length === 1 ? "" : "s"} in this track`}
            />
            <CardBody className="divide-y divide-slate-100 p-0">
              {track.lessons.map((l) => {
                const meta = STATUS_META[l.status];
                const Icon = meta.Icon;
                return (
                  <div key={l.lessonId} className="flex items-center gap-4 px-4 py-3">
                    <span className="w-10 shrink-0 text-center text-xs font-medium text-slate-400">
                      {l.lessonNo != null ? `#${l.lessonNo}` : "—"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium text-slate-900">{l.title}</span>
                        <Badge tone={meta.tone}>
                          <Icon size={10} /> {meta.label}
                        </Badge>
                        {l.unlockedOverride && (
                          <Badge tone="warning">
                            <Unlock size={10} /> Override
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {l.percentComplete}% complete
                        {l.status === "completed" && ` · finished ${formatDate(l.completedAt)}`}
                        {l.status === "waiting" && ` · unlocks ${formatDate(l.availableAt)}`}
                      </div>
                    </div>
                    {l.unlockedOverride ? (
                      <Button
                        variant="secondary"
                        onClick={() => toggle(l.lessonId, false)}
                        disabled={busy === l.lessonId}
                      >
                        {busy === l.lessonId ? "…" : "Revoke access"}
                      </Button>
                    ) : (
                      <Button
                        onClick={() => toggle(l.lessonId, true)}
                        disabled={busy === l.lessonId || l.status === "available"}
                      >
                        {busy === l.lessonId
                          ? "…"
                          : l.status === "available"
                          ? "Open"
                          : "Grant access"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
