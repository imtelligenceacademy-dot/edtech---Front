"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/DashboardShell";
import { LoadError } from "@/components/ui/LoadError";
import { SecurityLogTable } from "@/components/security/SecurityLogTable";
import { listSecurityLogs } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { SecurityEventType, SecurityLog } from "@/types";

// Two questions, not one list. "Did something go wrong" is answered by rare
// events and is what this screen has always been; "who took which lesson" is
// answered by rows written every time a teacher opens a PDF, and mixing them
// would mean the second drowns the first on every page load.
const VIEWS = [
  {
    key: "security" as const,
    tab: "Security events",
    subtitle: "All sign-in events across schools.",
    empty: "No security events.",
    event: undefined,
  },
  {
    key: "files" as const,
    tab: "Lesson access",
    subtitle: "Every lesson PDF served, and every request refused.",
    empty: "No lesson has been opened yet.",
    // Served only. A refusal is rare enough to be worth its own look, and
    // putting both here would hide it among the ordinary rows all over again.
    event: "lesson-file-served" as SecurityEventType,
  },
  {
    key: "refused" as const,
    tab: "Refused",
    subtitle: "Requests for a file the account was not entitled to open.",
    empty: "Nothing has been refused. This is the reading you want.",
    event: "lesson-file-refused" as SecurityEventType,
  },
];

export default function SuperAdminSecurityPage() {
  const [view, setView] = useState<(typeof VIEWS)[number]["key"]>("security");
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [loading, setLoading] = useState(true);
  // "No security events." is a claim worth getting right: somebody reading
  // this during an incident needs to know the difference between nothing
  // happened and we could not ask.
  const [loadError, setLoadError] = useState<string | null>(null);

  const current = VIEWS.find((v) => v.key === view) ?? VIEWS[0];
  const event = current.event;

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    listSecurityLogs(event)
      .then(setLogs)
      .catch((err) =>
        setLoadError(
          err instanceof Error
            ? err.message
            : "Couldn't load the security log. Check your connection and try again."
        )
      )
      .finally(() => setLoading(false));
  }, [event]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <PageHeader title="Security Logs" subtitle={current.subtitle} />

      <div className="mb-4 flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            aria-pressed={v.key === view}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition",
              v.key === view
                ? "border-brand/40 bg-brand/10 text-brand-700"
                : "border-slate-200 bg-white text-slate-600 hover:border-brand/40"
            )}
          >
            {v.tab}
          </button>
        ))}
      </div>

      {/* The table is left standing while a switch loads rather than blanking
          the page, so moving between these does not flash the whole screen. */}
      {loadError ? (
        <LoadError message={loadError} onRetry={load} />
      ) : (
        <SecurityLogTable
          logs={loading ? [] : logs}
          emptyMessage={loading ? "Loading…" : current.empty}
        />
      )}
    </>
  );
}
