"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BellRing, Check, ChevronRight, Info, Search, Unlock, X } from "lucide-react";
import { PageHeader } from "@/components/layout/DashboardShell";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  denyAccessRequest,
  grantAccessRequest,
  listAccessRequests,
  listSchools,
  listUsers,
} from "@/lib/api";
import { summarizeGrades } from "@/lib/grades";
import type { AccessRequest, School, User } from "@/types";

// Index for the per-teacher lesson-unlock pages. Picking a teacher opens their
// own page so this list stays uncluttered.
export default function LessonAccessIndexPage() {
  const [teachers, setTeachers] = useState<User[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([listUsers(), listSchools(), listAccessRequests()])
      .then(([users, schoolRows, requestRows]) => {
        setTeachers(users.filter((u) => u.role === "teacher"));
        setSchools(schoolRows);
        setRequests(requestRows);
      })
      .finally(() => setLoading(false));
  }, []);

  async function resolve(req: AccessRequest, grant: boolean) {
    setBusy(req.id);
    try {
      if (grant) await grantAccessRequest(req.id);
      else await denyAccessRequest(req.id);
      setRequests((cur) => cur.filter((r) => r.id !== req.id));
    } catch {
      // leave the request in place if it failed
    } finally {
      setBusy(null);
    }
  }

  const schoolName = useMemo(
    () => new Map(schools.map((s) => [s.id, s.name])),
    [schools]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return teachers;
    return teachers.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.email.toLowerCase().includes(q) ||
        (t.schoolId && schoolName.get(t.schoolId)?.toLowerCase().includes(q))
    );
  }, [teachers, query, schoolName]);

  if (loading) return null;

  return (
    <>
      <PageHeader
        title="Lesson Unlock"
        subtitle="Pick a teacher to manage their sequential lesson access and override the waiting period."
      />

      {requests.length > 0 && (
        <Card className="mb-6 border-amber-200">
          <CardHeader
            title="Access requests"
            subtitle="Teachers waiting for you to unlock a lesson"
            action={
              <Badge tone="warning">
                <BellRing size={11} /> {requests.length} pending
              </Badge>
            }
          />
          <CardBody className="divide-y divide-slate-100 p-0">
            {requests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                  <BellRing size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">
                    <span className="font-medium text-slate-900">{r.teacherName}</span>
                    <span className="text-slate-500"> requested </span>
                    <span className="font-medium text-slate-900">{r.lessonTitle}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    Grade {r.grade}
                    {r.language ? ` · ${r.language.toUpperCase()}` : ""}
                    {r.lessonNo != null ? ` · Lesson ${r.lessonNo}` : ""}
                    {` · ${new Date(r.createdAt).toLocaleDateString()}`}
                  </div>
                  {r.note && <p className="mt-1 text-xs italic text-slate-600">“{r.note}”</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => resolve(r, false)}
                    disabled={busy === r.id}
                  >
                    <X size={13} /> Deny
                  </Button>
                  <Button size="sm" onClick={() => resolve(r, true)} disabled={busy === r.id}>
                    <Check size={13} /> Grant access
                  </Button>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <div className="mb-6 flex items-start gap-2 rounded-lg border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <Info size={16} className="mt-0.5 shrink-0 text-sky-600" />
        <p>
          Teachers unlock their lessons one at a time per grade &amp; language.
          After completing a lesson, the next one unlocks a week later. Open a
          teacher to unlock a lesson early, or reopen one they&apos;ve finished.
        </p>
      </div>

      <div className="mb-4 relative max-w-sm">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search teachers…"
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-brand focus:outline-none"
        />
      </div>

      <Card>
        <CardBody className="divide-y divide-slate-100 p-0">
          {filtered.length === 0 && (
            <p className="px-4 py-6 text-sm text-slate-500">No teachers found.</p>
          )}
          {filtered.map((t) => (
            <Link
              key={t.id}
              href={`/super-admin/lesson-access/${t.id}`}
              className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-slate-50"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <Unlock size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-slate-900">{t.name}</span>
                  {t.status !== "active" && <Badge tone="muted">{t.status}</Badge>}
                </div>
                <div className="truncate text-xs text-slate-500">
                  {t.email}
                  {t.schoolId ? ` · ${schoolName.get(t.schoolId) ?? "—"}` : ""}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400">
                  {summarizeGrades(t.grades ?? [])}
                  {t.language ? ` · ${t.language.toUpperCase()}` : ""}
                </div>
              </div>
              <ChevronRight size={16} className="shrink-0 text-slate-400" />
            </Link>
          ))}
        </CardBody>
      </Card>
    </>
  );
}
