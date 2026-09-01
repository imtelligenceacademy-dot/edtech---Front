"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, RefreshCw, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/DashboardShell";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatCard } from "@/components/ui/StatCard";
import { UsageTable } from "@/components/super-admin/ai-usage/UsageTable";
import { StripLegend } from "@/components/super-admin/ai-usage/UsageStrip";
import { WindowLegend } from "@/components/super-admin/ai-usage/WindowLegend";
import {
  FILTER_LABELS,
  SORT_LABELS,
  matchesFilter,
  matchesQuery,
  peakDay,
  sortRows,
  summarise,
  weekOverWeek,
  type UsageFilter,
  type UsageSort,
} from "@/lib/super-admin/ai-usage";
import { getTeacherAiUsage, listSchools } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { AITeacherUsageReport, School } from "@/types";

// How much each teacher is using the lesson assistant.
//
// The brief for this page was that the tracking be clear rather than vague, and
// that is a design constraint, not a tone: no scores, no bands, no bare
// percentages. Every figure is a count, every count names its window, and every
// relative time ("3 days ago") sits above the exact timestamp it came from. The
// legend at the top spells out where each window starts, because "today" and
// "last 24 hours" are different questions and the screen answers both.
//
// Teachers who have never asked anything are listed, not filtered out. On a
// usage screen the silence is usually the finding.

function Skeleton() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-xl bg-slate-100" />
        ))}
      </div>
      <div className="h-[420px] rounded-xl bg-slate-100" />
    </div>
  );
}

export default function SuperAdminAiUsagePage() {
  const [report, setReport] = useState<AITeacherUsageReport | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [filter, setFilter] = useState<UsageFilter>("all");
  const [sort, setSort] = useState<UsageSort>("last7");

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [usage, schoolRows] = await Promise.all([
        getTeacherAiUsage(),
        listSchools(),
      ]);
      setReport(usage);
      setSchools(schoolRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load AI usage.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pinned to the moment the report was read, so "2 hours ago" stays true to
  // the data on screen instead of drifting while the tab sits open.
  const readAt = useMemo(
    () => (report ? new Date(report.generatedAt) : new Date()),
    [report]
  );

  const shown = useMemo(() => {
    if (!report) return [];
    const filtered = report.teachers
      .filter((t) => (schoolId ? t.schoolId === schoolId : true))
      .filter((t) => matchesFilter(t, filter))
      .filter((t) => matchesQuery(t, query));
    return sortRows(filtered, sort);
  }, [report, schoolId, filter, query, sort]);

  // Scaled across everyone in view, so the bars stay comparable between rows
  // and rescale sensibly when a filter narrows the table.
  const peak = useMemo(() => peakDay(shown), [shown]);
  const sum = useMemo(() => summarise(shown), [shown]);
  const filtersApplied = Boolean(query || schoolId || filter !== "all");

  return (
    <>
      <PageHeader
        title="AI Usage"
        subtitle="How many questions each teacher has asked the lesson assistant, and when."
        actions={
          <Button
            variant="secondary"
            onClick={() => void load(true)}
            disabled={loading || refreshing}
          >
            <RefreshCw
              size={14}
              className={`mr-1.5 ${refreshing ? "animate-spin" : ""}`}
            />
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      {error && (
        <Card className="mb-4 border-red-200 bg-red-50/60">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <AlertCircle size={16} className="shrink-0 text-red-500" />
            <p className="flex-1 text-sm text-red-700">{error}</p>
            <Button size="sm" variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        </Card>
      )}

      {loading || !report ? (
        <Skeleton />
      ) : report.teachers.length === 0 ? (
        <Card>
          <p className="px-5 py-16 text-center text-sm text-slate-500">
            No teacher accounts yet. Once teachers exist, every question they ask
            the assistant is counted here.
          </p>
        </Card>
      ) : (
        <>
          {/* Totals for whatever the filters currently show, so the header can
              never disagree with the table under it. */}
          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Questions today"
              value={sum.today}
              delta={`${sum.last24h} in the last 24 hours`}
            />
            <StatCard
              label="Questions, last 7 days"
              value={sum.last7}
              delta={weekOverWeek(sum.last7, sum.prev7)}
            />
            <StatCard
              label="Teachers who asked this week"
              value={`${sum.askedThisWeek} of ${sum.teachers}`}
              delta={
                sum.neverUsed > 0
                  ? `${sum.neverUsed} ${
                      sum.neverUsed === 1 ? "teacher has" : "teachers have"
                    } never used it`
                  : "Every teacher has used it at least once"
              }
            />
            <StatCard
              label="Questions all time"
              value={sum.total}
              delta={
                sum.firstUsedAt
                  ? `since the first on ${formatDate(sum.firstUsedAt)}`
                  : "no questions asked yet"
              }
            />
          </div>

          <WindowLegend report={report} />

          <Card>
            <CardBody className="border-b border-slate-100 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[200px] flex-1">
                  <Search
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search a teacher, email, school or grade…"
                    aria-label="Search teachers"
                    className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>

                <select
                  value={schoolId}
                  onChange={(e) => setSchoolId(e.target.value)}
                  aria-label="Filter by school"
                  className="h-10 rounded-lg border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                >
                  <option value="">All schools</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>

                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as UsageFilter)}
                  aria-label="Filter by activity"
                  className="h-10 rounded-lg border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                >
                  {Object.entries(FILTER_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>

                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as UsageSort)}
                  aria-label="Sort teachers"
                  className="h-10 rounded-lg border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                >
                  {Object.entries(SORT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                  Showing{" "}
                  <span className="font-medium text-slate-900">
                    {shown.length}
                  </span>{" "}
                  of {report.teachers.length} teacher
                  {report.teachers.length === 1 ? "" : "s"}
                  {filtersApplied && " (filtered)"}
                </p>
                <StripLegend days={report.dailyDays} peak={peak} />
              </div>
            </CardBody>

            {shown.length === 0 ? (
              <p className="px-5 py-16 text-center text-sm text-slate-500">
                No teacher matches these filters.
              </p>
            ) : (
              <UsageTable
                rows={shown}
                report={report}
                peak={peak}
                now={readAt}
              />
            )}
          </Card>
        </>
      )}
    </>
  );
}
