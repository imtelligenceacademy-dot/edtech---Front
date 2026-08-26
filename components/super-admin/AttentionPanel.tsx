"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, BellRing, Check, FileWarning, UserX, X } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { denyAccessRequest, grantAccessRequest } from "@/lib/api";
import type { SuperAdminOverview } from "@/lib/api";
import { formatDate } from "@/lib/utils";

/**
 * What is waiting on the platform owner, on the page they open first.
 *
 * A teacher blocked on an access request used to be visible only to someone who
 * happened to open the Lesson Unlock page; a PDF whose name didn't parse only to
 * someone who scrolled to the bottom of the Files page. Requests are granted or
 * denied here, because leaving the page to do it is what made them pile up.
 */
export function AttentionPanel({
  overview,
  onResolved,
}: {
  overview: SuperAdminOverview;
  onResolved: (requestId: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    accessRequests,
    accessRequestCount,
    stalledTeachers,
    stalledTeacherCount,
    unsortedUploads,
    unsortedUploadCount,
    stalledAfterDays,
  } = overview;

  const nothingWaiting =
    accessRequestCount === 0 && stalledTeacherCount === 0 && unsortedUploadCount === 0;

  async function resolve(requestId: string, grant: boolean) {
    setBusy(requestId);
    setError(null);
    try {
      if (grant) await grantAccessRequest(requestId);
      else await denyAccessRequest(requestId);
      onResolved(requestId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update that request.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="mb-8 border-brand/30">
      <CardHeader
        title="Needs your attention"
        subtitle={
          nothingWaiting
            ? "Nothing is waiting on you."
            : "Requests, quiet teachers, and uploads that didn't land."
        }
      />
      <CardBody className="space-y-5">
        {error && <p className="text-xs text-red-600">{error}</p>}

        {nothingWaiting && (
          <p className="text-sm text-slate-500">
            No access requests, every teacher has taught recently, and every
            upload was filed.
          </p>
        )}

        {/* Teachers blocked right now — the most time-sensitive thing here. */}
        {accessRequestCount > 0 && (
          <Section
            icon={<BellRing size={14} className="text-amber-600" />}
            title="Lesson access requests"
            count={accessRequestCount}
            shown={accessRequests.length}
            allHref="/super-admin/lesson-access"
          >
            {accessRequests.map((req) => (
              <li
                key={req.id}
                className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">
                    {req.teacherName}
                  </span>
                  <span className="block truncate text-[11px] text-slate-600">
                    {req.lessonTitle} · asked {formatDate(req.createdAt)}
                  </span>
                </span>
                <button
                  onClick={() => resolve(req.id, true)}
                  disabled={busy === req.id}
                  className="flex shrink-0 items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-brand-600 disabled:opacity-50"
                >
                  <Check size={12} /> Grant
                </button>
                <button
                  onClick={() => resolve(req.id, false)}
                  disabled={busy === req.id}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  <X size={12} /> Deny
                </button>
              </li>
            ))}
          </Section>
        )}

        {stalledTeacherCount > 0 && (
          <Section
            icon={<UserX size={14} className="text-slate-500" />}
            title={`Quiet for ${stalledAfterDays}+ days`}
            count={stalledTeacherCount}
            shown={stalledTeachers.length}
          >
            {stalledTeachers.map((teacher) => (
              <li
                key={teacher.teacherId}
                className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">
                    {teacher.name}
                  </span>
                  <span className="block truncate text-[11px] text-slate-500">
                    {teacher.lastActivityAt
                      ? `Last opened a lesson ${formatDate(teacher.lastActivityAt)}`
                      : "Has never opened a lesson"}
                    {teacher.completedCount > 0
                      ? ` · ${teacher.completedCount} completed`
                      : ""}
                  </span>
                </span>
                <Link
                  href={`/super-admin/lesson-access/${teacher.teacherId}`}
                  className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  View access
                </Link>
              </li>
            ))}
          </Section>
        )}

        {unsortedUploadCount > 0 && (
          <Section
            icon={<FileWarning size={14} className="text-slate-500" />}
            title="Uploads not assigned to a lesson"
            count={unsortedUploadCount}
            shown={unsortedUploads.length}
            allHref="/super-admin/files"
          >
            {unsortedUploads.map((file) => (
              <li
                key={file.id}
                className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2"
              >
                <AlertTriangle size={13} className="shrink-0 text-amber-500" />
                <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                  {file.filename}
                </span>
                <span className="shrink-0 text-[11px] text-slate-500">
                  name didn&apos;t match the format
                </span>
              </li>
            ))}
          </Section>
        )}
      </CardBody>
    </Card>
  );
}

function Section({
  icon,
  title,
  count,
  shown,
  allHref,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  shown: number;
  allHref?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
          {title}
        </h4>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
          {count}
        </span>
        {allHref && count > shown && (
          <Link
            href={allHref}
            className="ml-auto text-[11px] font-medium text-brand-700 hover:underline"
          >
            See all {count}
          </Link>
        )}
      </div>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  );
}
