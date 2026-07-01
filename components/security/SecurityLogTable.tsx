"use client";

import { Badge } from "@/components/ui/Badge";
import { formatDate, cn } from "@/lib/utils";
import type { SecurityEventType, SecurityLog } from "@/types";

const eventLabel: Record<SecurityEventType, string> = {
  "normal-login": "Normal login",
  "foreign-device": "Foreign device",
  "new-ip": "New IP detected",
  "suspicious-location": "Suspicious location",
  "blocked-second-device": "Blocked second device",
};

const statusTone: Record<
  SecurityLog["status"],
  { tone: Parameters<typeof Badge>[0]["tone"]; label: string }
> = {
  ok: { tone: "success", label: "OK" },
  warning: { tone: "warning", label: "Warning" },
  blocked: { tone: "danger", label: "Blocked" },
};

export function SecurityLogTable({ logs }: { logs: SecurityLog[] }) {
  const dark = false;
  const muted = "text-slate-500";
  const strong = "text-slate-900";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border backdrop-blur",
        dark ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-white"
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={cn("text-left text-[11px] uppercase tracking-wider", muted)}>
              {["User", "Role", "Event", "IP / Location", "Device", "Status", "Time"].map((h) => (
                <th key={h} className="px-4 py-2.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => {
              const s = statusTone[l.status];
              return (
                <tr key={l.id} className={cn("border-t", dark ? "border-white/5" : "border-slate-100")}>
                  <td className="px-4 py-3">
                    <div className={cn("font-medium", strong)}>{l.userName}</div>
                    <div className={cn("text-xs", muted)}>{l.userId}</div>
                  </td>
                  <td className={cn("px-4 py-3 capitalize", dark ? "text-slate-300" : "text-slate-600")}>
                    {l.role.replace("-", " ")}
                  </td>
                  <td className={cn("px-4 py-3", dark ? "text-slate-300" : "text-slate-600")}>
                    {eventLabel[l.event]}
                  </td>
                  <td className="px-4 py-3">
                    <div className={cn("font-mono text-xs", dark ? "text-slate-300" : "text-slate-700")}>
                      {l.ip}
                    </div>
                    <div className={cn("text-xs", muted)}>
                      {l.location.label} ({l.location.lat.toFixed(2)}, {l.location.lng.toFixed(2)})
                    </div>
                  </td>
                  <td className={cn("px-4 py-3 text-xs", dark ? "text-slate-300" : "text-slate-600")}>
                    {l.device}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={s.tone}>{s.label}</Badge>
                  </td>
                  <td className={cn("px-4 py-3 text-xs", muted)}>{formatDate(l.timestamp)}</td>
                </tr>
              );
            })}
            {logs.length === 0 && (
              <tr>
                <td colSpan={7} className={cn("px-4 py-6 text-center", muted)}>
                  No security events.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
