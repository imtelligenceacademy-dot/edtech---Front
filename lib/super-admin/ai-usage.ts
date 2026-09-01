import type { AITeacherUsage, AITeacherUsageReport } from "@/types";

// Sorting, filtering and phrasing for the AI usage screen.
//
// The rule this file exists to keep is that a number is never shown without the
// window it was counted over. "23" means nothing; "23 in the last 7 days, vs 14
// in the 7 days before" is checkable. Every formatter below therefore returns
// the count and its window together, and none of them turn a count into a
// rating — there is no "heavy user" here, only how many questions were asked.

export type UsageSort =
  | "last7"
  | "today"
  | "last24h"
  | "total"
  | "lastUsed"
  | "name";

export type UsageFilter = "all" | "active7" | "silent7" | "never";

export const SORT_LABELS: Record<UsageSort, string> = {
  last7: "Most in the last 7 days",
  today: "Most today",
  last24h: "Most in the last 24 hours",
  total: "Most all time",
  lastUsed: "Asked most recently",
  name: "Name (A–Z)",
};

export const FILTER_LABELS: Record<UsageFilter, string> = {
  all: "All teachers",
  active7: "Asked in the last 7 days",
  silent7: "Nothing in the last 7 days",
  never: "Never used the assistant",
};

export function matchesFilter(row: AITeacherUsage, filter: UsageFilter): boolean {
  switch (filter) {
    case "active7":
      return row.last7 > 0;
    case "silent7":
      return row.last7 === 0;
    case "never":
      return row.total === 0;
    default:
      return true;
  }
}

export function matchesQuery(row: AITeacherUsage, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [row.name, row.email, row.schoolName ?? "", ...row.grades]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

function lastUsedMs(row: AITeacherUsage): number {
  return row.lastUsedAt ? new Date(row.lastUsedAt).getTime() : 0;
}

export function sortRows(
  rows: AITeacherUsage[],
  sort: UsageSort
): AITeacherUsage[] {
  const byName = (a: AITeacherUsage, b: AITeacherUsage) =>
    a.name.localeCompare(b.name);
  const copy = [...rows];
  switch (sort) {
    case "name":
      return copy.sort(byName);
    case "lastUsed":
      // Never-used teachers sort last rather than first, where a 0 timestamp
      // would otherwise put them.
      return copy.sort((a, b) => lastUsedMs(b) - lastUsedMs(a) || byName(a, b));
    default:
      return copy.sort((a, b) => b[sort] - a[sort] || byName(a, b));
  }
}

/** Platform-wide figures, summed from the same rows the table shows so the
 *  header and the table can never disagree. */
export function summarise(rows: AITeacherUsage[]) {
  const sum = (pick: (r: AITeacherUsage) => number) =>
    rows.reduce((acc, r) => acc + pick(r), 0);

  const firstUse = rows
    .map((r) => r.firstUsedAt)
    .filter((d): d is string => Boolean(d))
    .sort()[0];

  return {
    teachers: rows.length,
    today: sum((r) => r.today),
    last24h: sum((r) => r.last24h),
    last7: sum((r) => r.last7),
    prev7: sum((r) => r.prev7),
    total: sum((r) => r.total),
    askedThisWeek: rows.filter((r) => r.last7 > 0).length,
    neverUsed: rows.filter((r) => r.total === 0).length,
    firstUsedAt: firstUse ?? null,
  };
}

/** "9 more than the 7 days before" — the change as a count, with the baseline
 *  named. A bare percentage hides that +100% can mean one question became two. */
export function weekOverWeek(last7: number, prev7: number): string {
  const diff = last7 - prev7;
  if (prev7 === 0 && last7 === 0) return "None either week";
  if (prev7 === 0) return "First activity — nothing the week before";
  if (diff === 0) return `Same as the 7 days before (${prev7})`;
  const direction = diff > 0 ? "more than" : "fewer than";
  return `${Math.abs(diff)} ${direction} the 7 days before (${prev7})`;
}

/** How much of a quota is spent, as the two counts rather than a percentage.
 *  A limit of 0 means the server enforces none, which is said outright. */
export function quotaLabel(used: number, limit: number): string {
  if (limit <= 0) return `${used} used · no limit set`;
  return `${used} of ${limit} used`;
}

export function quotaRatio(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(1, used / limit);
}

/** Coarse but honest: minutes up to an hour, then hours, then days. Always
 *  shown next to the exact timestamp, never instead of it. */
export function relativeTime(iso: string | null | undefined, now: Date): string {
  if (!iso) return "Never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Never";

  const seconds = Math.max(0, Math.round((now.getTime() - then) / 1000));
  if (seconds < 60) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;

  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

/** The busiest single day in the strip, used to scale the bars. Never 0, so a
 *  row of zeroes divides safely and simply draws nothing. */
export function peakDay(rows: AITeacherUsage[]): number {
  return Math.max(
    1,
    ...rows.flatMap((r) => r.daily.map((d) => d.count))
  );
}

/** The date a strip column covers, written out for its tooltip. */
export function dayLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Window boundaries, phrased for the legend. Every column header on the table
 *  points back at one of these. */
export function windowNotes(report: AITeacherUsageReport) {
  const at = (iso: string) =>
    new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: report.timezone,
    });

  return [
    {
      term: "Today",
      note: `Since midnight, ${at(report.todayStart)} — a calendar day in ${report.timezone}.`,
    },
    {
      term: "Last hour",
      note: `A rolling 60 minutes, so since ${at(report.hourStart)}. This is the window the hourly limit of ${report.hourlyLimit} is measured over.`,
    },
    {
      term: "Last 24 hours",
      note: `A rolling day, so since ${at(report.dayStart)} — not the same as “today”. This is the window the daily limit of ${report.dailyLimit} is measured over.`,
    },
    {
      term: "Last 7 days",
      note: `Since ${at(report.weekStart)}, compared against the 7 days before it (from ${at(report.prevWeekStart)}).`,
    },
    {
      term: "Daily strip",
      note: `One bar per day for the last ${report.dailyDays} days, oldest on the left. Hover a bar for its date and count.`,
    },
    {
      term: "Active days",
      note: `Days with at least one question, out of the last 30. Four questions in one day is one active day.`,
    },
    {
      term: "One question",
      note: `Each row counts one message sent to the lesson assistant. Reading the reply, re-opening a lesson and scrolling back through a thread are not counted.`,
    },
  ];
}
