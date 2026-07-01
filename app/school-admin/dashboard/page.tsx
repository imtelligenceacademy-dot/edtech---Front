"use client";

import { useEffect, useState } from "react";
import { Users, AlertTriangle, BookOpen, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/DashboardShell";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { WatchdogBadge } from "@/components/watchdog/WatchdogBadge";
import {
  getAIUsage,
  listLessons,
  listProgress,
  listSchools,
  listSecurityLogs,
  listUsers,
  type AIUsageStats,
} from "@/lib/api";
import type { Lesson, ProgressEntry, School, SecurityLog, User } from "@/types";

export default function SchoolAdminDashboard() {
  const [schools, setSchools] = useState<School[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [securityLogs, setSecurityLogs] = useState<SecurityLog[]>([]);
  const [aiUsage, setAiUsage] = useState<AIUsageStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      listSchools(),
      listUsers(),
      listProgress(),
      listLessons(),
      listSecurityLogs(),
      getAIUsage().catch(() => null),
    ])
      .then(([schoolRows, userRows, progressRows, lessonRows, logRows, usage]) => {
        setSchools(schoolRows);
        setTeachers(userRows.filter((u) => u.role === "teacher"));
        setProgress(progressRows);
        setLessons(lessonRows);
        setSecurityLogs(logRows);
        setAiUsage(usage);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  const school = schools[0];
  const lateCount = progress.filter((p) => p.watchdog === "late").length;
  const completion =
    progress.length === 0
      ? 0
      : Math.round(progress.reduce((acc, p) => acc + p.percentComplete, 0) / progress.length);
  const securityForSchool = securityLogs.filter((l) => l.status !== "ok");

  const aiDelta =
    aiUsage && aiUsage.deltaPct !== null
      ? `${aiUsage.deltaPct >= 0 ? "+" : ""}${aiUsage.deltaPct}% vs prev. week`
      : undefined;

  const stats = [
    { label: "Teachers", value: String(teachers.length), icon: Users, delta: undefined },
    { label: "Late lessons", value: String(lateCount), icon: AlertTriangle, delta: undefined },
    { label: "Avg completion", value: `${completion}%`, icon: BookOpen, delta: undefined },
    {
      label: "AI usage (7d)",
      value: String(aiUsage?.last7 ?? 0),
      icon: Sparkles,
      delta: aiDelta,
    },
  ];

  // Group teacher progress into one folder per grade, mirroring the super-admin view.
  const byGrade = new Map<number, ProgressEntry[]>();
  for (const p of progress) {
    const lesson = lessons.find((l) => l.id === p.lessonId);
    const grade = lesson?.grade ?? 0;
    if (!byGrade.has(grade)) byGrade.set(grade, []);
    byGrade.get(grade)!.push(p);
  }
  const gradeGroups = Array.from(byGrade.entries())
    .sort(([a], [b]) => a - b)
    .map(([grade, entries]) => ({
      grade,
      entries: entries.slice().sort((a, b) => {
        const la = lessons.find((l) => l.id === a.lessonId)?.lessonNo ?? 0;
        const lb = lessons.find((l) => l.id === b.lessonId)?.lessonNo ?? 0;
        return la - lb;
      }),
    }));

  return (
    <>
      <PageHeader
        title={school?.name ?? "School"}
        subtitle="Monitoring view. Read-only access to teacher progress and alerts."
      />

      {/* Stat cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  {s.label}
                </p>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Icon size={16} />
                </span>
              </div>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{s.value}</p>
              {s.delta && (
                <p
                  className={
                    "mt-1 text-[11px] " +
                    (s.delta.startsWith("-") ? "text-red-500" : "text-emerald-500")
                  }
                >
                  {s.delta}
                </p>
              )}
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Teacher progress — grouped by grade */}
        <div className="space-y-6 xl:col-span-2">
          <div>
            <p className="text-sm font-semibold text-slate-900">Teacher progress</p>
            <p className="text-xs text-slate-500">Grouped by grade · across all assigned lessons</p>
          </div>

          {gradeGroups.length === 0 && (
            <Card>
              <CardBody>
                <p className="text-sm text-slate-500">No progress to show yet.</p>
              </CardBody>
            </Card>
          )}

          {gradeGroups.map(({ grade, entries }) => (
            <Card key={grade}>
              <CardHeader
                title={grade ? `Grade ${grade}` : "Unassigned grade"}
                subtitle={`${entries.length} lesson${entries.length === 1 ? "" : "s"} in progress`}
              />
              <CardBody className="divide-y divide-slate-100 p-0">
                {entries.map((p) => {
                  const teacher = teachers.find((u) => u.id === p.teacherId);
                  const lesson = lessons.find((l) => l.id === p.lessonId);
                  return (
                    <div key={p.id} className="flex items-center gap-4 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {lesson?.title ?? p.lessonId}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {teacher?.name ?? p.teacherId}
                        </p>
                      </div>
                      <div className="flex w-40 shrink-0 items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full bg-gradient-to-r from-brand to-brand-700"
                            style={{ width: `${p.percentComplete}%` }}
                          />
                        </div>
                        <span className="tabular-nums text-xs text-slate-500">
                          {p.percentComplete}%
                        </span>
                      </div>
                      <div className="shrink-0">
                        <WatchdogBadge status={p.watchdog} />
                      </div>
                    </div>
                  );
                })}
              </CardBody>
            </Card>
          ))}
        </div>

        {/* Security alerts */}
        <Card className="self-start overflow-hidden p-0">
          <CardHeader title="Security alerts" subtitle="For this school" />
          <CardBody className="space-y-3">
            {securityForSchool.length === 0 && (
              <p className="text-sm text-slate-500">No alerts in the last 7 days.</p>
            )}
            {securityForSchool.map((l) => (
              <div key={l.id} className="rounded-lg border border-slate-100 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-900">{l.userName}</span>
                  <Badge tone={l.status === "blocked" ? "danger" : "warning"}>{l.status}</Badge>
                </div>
                <p className="mt-1 text-xs capitalize text-slate-500">
                  {l.event.replace(/-/g, " ")} - {l.location.label}
                </p>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
