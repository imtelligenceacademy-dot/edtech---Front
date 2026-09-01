"use client";

import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { UsageStrip } from "./UsageStrip";
import {
  quotaLabel,
  quotaRatio,
  relativeTime,
  weekOverWeek,
} from "@/lib/super-admin/ai-usage";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { AITeacherUsage, AITeacherUsageReport } from "@/types";

// One row per teacher, one column per window.
//
// Every count in here is paired with something that makes it readable: the
// quota it is spent against, the previous week it is compared to, or the exact
// timestamp behind a relative one. A number on its own is the thing this screen
// is trying not to be.

export function UsageTable({
  rows,
  report,
  peak,
  now,
}: {
  rows: AITeacherUsage[];
  report: AITeacherUsageReport;
  peak: number;
  now: Date;
}) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Teacher</TH>
          <TH className="text-right">Last hour</TH>
          <TH className="text-right">Today</TH>
          <TH className="text-right">Last 24 hours</TH>
          <TH className="text-right">Last 7 days</TH>
          <TH>Last {report.dailyDays} days</TH>
          <TH className="text-right">Active days</TH>
          <TH>Last asked</TH>
          <TH className="text-right">All time</TH>
        </TR>
      </THead>
      <tbody>
        {rows.map((row) => (
          <TR key={row.teacherId} className="align-top">
            <TD>
              <p className="font-medium text-slate-900">{row.name}</p>
              <p className="text-xs text-slate-500">{row.email}</p>
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                <span>{row.schoolName ?? "No school"}</span>
                {row.grades.length > 0 && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{row.grades.join(", ")}</span>
                  </>
                )}
                {row.status !== "active" && (
                  <Badge
                    tone={row.status === "suspended" ? "danger" : "warning"}
                    className="ml-0.5"
                  >
                    {row.status}
                  </Badge>
                )}
              </p>
            </TD>

            {/* The two quota windows. The count is what happened; the limit is
                what would have stopped it, so they belong together. */}
            <TD className="text-right">
              <Count value={row.lastHour} />
              <Quota used={row.hourlyUsed} limit={report.hourlyLimit} />
            </TD>

            <TD className="text-right">
              <Count value={row.today} />
              <p className="text-[11px] text-slate-400">since midnight</p>
            </TD>

            <TD className="text-right">
              <Count value={row.last24h} />
              <Quota used={row.dailyUsed} limit={report.dailyLimit} />
            </TD>

            <TD className="text-right">
              <Count value={row.last7} />
              <p className="text-[11px] leading-tight text-slate-500">
                {weekOverWeek(row.last7, row.prev7)}
              </p>
            </TD>

            <TD>
              <UsageStrip days={row.daily} peak={peak} />
              <p className="mt-1 text-[11px] text-slate-400">
                {row.last30} in the last 30 days
              </p>
            </TD>

            <TD className="text-right">
              <span className="font-medium tabular-nums text-slate-900">
                {row.activeDays30}
              </span>
              <p className="text-[11px] text-slate-400">of the last 30</p>
            </TD>

            <TD>
              {row.lastUsedAt ? (
                <>
                  <p className="text-slate-900">
                    {relativeTime(row.lastUsedAt, now)}
                  </p>
                  {/* The exact moment sits under every relative one — "3 days
                      ago" is not something you can check against anything. */}
                  <p className="text-[11px] text-slate-500">
                    {formatDate(row.lastUsedAt)}
                  </p>
                </>
              ) : (
                <p className="text-slate-500">Never asked</p>
              )}
            </TD>

            <TD className="text-right">
              <Count value={row.total} />
              {row.firstUsedAt ? (
                <p className="text-[11px] text-slate-400">
                  since {formatDate(row.firstUsedAt)}
                </p>
              ) : (
                <p className="text-[11px] text-slate-400">no questions yet</p>
              )}
            </TD>
          </TR>
        ))}
      </tbody>
    </Table>
  );
}

function Count({ value }: { value: number }) {
  return (
    <span
      className={cn(
        "font-semibold tabular-nums",
        value > 0 ? "text-slate-900" : "text-slate-300"
      )}
    >
      {value}
    </span>
  );
}

// Quota headroom as a bar plus both counts. The bar is there to be glanced at;
// the "12 of 40 used" underneath it is what someone acts on.
function Quota({ used, limit }: { used: number; limit: number }) {
  const ratio = quotaRatio(used, limit);
  const spent = limit > 0 && used >= limit;
  return (
    <>
      {limit > 0 && (
        <span className="mt-1 flex h-1 w-full justify-end overflow-hidden rounded-full bg-slate-100">
          <span
            className={cn(
              "h-full rounded-full",
              spent ? "bg-amber-500" : "bg-brand-400"
            )}
            style={{ width: `${ratio * 100}%` }}
          />
        </span>
      )}
      <p
        className={cn(
          "text-[11px] leading-tight",
          spent ? "font-medium text-amber-700" : "text-slate-400"
        )}
      >
        {spent ? "limit reached · " : ""}
        {quotaLabel(used, limit)}
      </p>
    </>
  );
}
