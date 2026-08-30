"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, MapPin, Monitor } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { getSecurityLogDetail } from "@/lib/api";
import { formatDate, cn } from "@/lib/utils";
import { eventLabel } from "./SecurityLogTable";
import type { SecurityLogDetail } from "@/types";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <span className="w-28 shrink-0 text-xs text-slate-500">{label}</span>
      <span className="min-w-0 flex-1 text-slate-800">{children}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </p>
      {children}
    </div>
  );
}

/**
 * One event, opened.
 *
 * A row on its own can't say whether the address is familiar, what happened
 * around it, or how many sessions the account has open — which is exactly what
 * an admin opens a log line to find out.
 */
export function SecurityLogDetailModal({
  logId,
  onClose,
}: {
  logId: string | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<SecurityLogDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!logId) {
      setData(null);
      setError(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    getSecurityLogDetail(logId)
      .then((result) => alive && setData(result))
      .catch((e) =>
        alive && setError(e instanceof Error ? e.message : "Couldn't load this event.")
      )
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [logId]);

  const log = data?.log;
  const history = data?.ipHistory;
  // "First time ever" is the whole point of the panel.
  const firstTimeHere = history != null && history.signIns <= 1;
  const sharedAddress = (history?.users.length ?? 0) > 1;

  return (
    <Modal open={logId !== null} onClose={onClose} title="Security event">
      {loading && (
        <p className="flex items-center gap-2 py-6 text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </p>
      )}
      {error && <p className="py-4 text-sm text-red-600">{error}</p>}

      {log && history && (
        <div className="space-y-4">
          <div>
            <Row label="What">
              <Badge tone={log.status === "ok" ? "success" : log.status === "warning" ? "warning" : "danger"}>
                {eventLabel[log.event]}
              </Badge>
              {log.detail && <span className="ml-2 text-xs text-slate-600">{log.detail}</span>}
            </Row>
            <Row label="Who">
              {log.userName}
              <span className="ml-2 text-xs capitalize text-slate-500">
                {log.role?.replace("-", " ")}
              </span>
            </Row>
            <Row label="When">{formatDate(log.timestamp)}</Row>
            <Row label="Address">
              <span className="font-mono text-xs">{log.ip || "—"}</span>
              {log.locationLabel && (
                <span className="ml-2 inline-flex items-center gap-1 text-xs text-slate-600">
                  <MapPin size={11} /> {log.locationLabel}
                </span>
              )}
            </Row>
            <Row label="Device">
              <span className="inline-flex items-center gap-1">
                <Monitor size={12} className="text-slate-400" />
                {log.deviceLabel || "Unknown device"}
              </span>
              {log.device && (
                <span className="mt-0.5 block break-all font-mono text-[10px] text-slate-400">
                  {log.device}
                </span>
              )}
            </Row>
          </div>

          <Section title="This address">
            {(firstTimeHere || sharedAddress) && (
              <p className="mb-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                <span>
                  {firstTimeHere && "First successful sign-in ever seen from this address. "}
                  {sharedAddress &&
                    `Used by ${history.users.length} accounts: ${history.users.join(", ")}.`}
                </span>
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              {[
                ["Sign-ins", String(history.signIns)],
                ["Failed", String(history.failedAttempts)],
                ["First seen", history.firstSeen ? formatDate(history.firstSeen) : "—"],
                ["Last seen", history.lastSeen ? formatDate(history.lastSeen) : "—"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-200 px-2.5 py-1.5">
                  <p className="text-[10px] text-slate-500">{label}</p>
                  <p className="text-slate-900">{value}</p>
                </div>
              ))}
            </div>
          </Section>

          {data.recentEvents.length > 0 && (
            <Section title={`Around this — ${log.userName}'s recent events`}>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {data.recentEvents.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        e.status === "ok"
                          ? "bg-emerald-400"
                          : e.status === "warning"
                          ? "bg-amber-400"
                          : "bg-red-500"
                      )}
                    />
                    <span className="w-32 shrink-0 text-slate-700">{eventLabel[e.event]}</span>
                    <span className="min-w-0 flex-1 truncate text-slate-500">
                      {e.detail || e.ip}
                    </span>
                    <span className="shrink-0 text-slate-400">{formatDate(e.timestamp)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title={`Open sessions (${data.activeSessions.length})`}>
            {data.activeSessions.length === 0 ? (
              <p className="text-xs text-slate-500">No live sessions for this account.</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {data.activeSessions.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                    <Monitor size={12} className="shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1 truncate text-slate-700">
                      {s.deviceLabel}
                      <span className="ml-2 font-mono text-[10px] text-slate-400">{s.ip}</span>
                    </span>
                    {s.matchesEvent && <Badge tone="info">same device</Badge>}
                    <span className="shrink-0 text-slate-400">{formatDate(s.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      )}
    </Modal>
  );
}
