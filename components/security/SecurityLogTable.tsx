"use client";

import { useState } from "react";
import { ChevronRight, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { SecurityLogDetailModal } from "./SecurityLogDetailModal";
import { formatDate, cn } from "@/lib/utils";
import type { SecurityEventType, SecurityLog } from "@/types";

// The first five names predate the rest, and two of them were being written for
// things that had not happened — a wrong password logged as "New IP detected",
// a lockout as "Blocked second device". Rows from before that fix still carry
// the old values, so those two are labelled for what they actually were.
export const eventLabel: Record<SecurityEventType, string> = {
  "normal-login": "Signed in",
  "failed-login": "Wrong password",
  "account-locked": "Account locked",
  "foreign-device": "New device",
  "new-ip": "New address",
  "suspicious-location": "Possible account sharing",
  "blocked-second-device": "Blocked second device",
  "password-reset": "Password reset",
  "signed-out-all": "Signed out everywhere",
};

const eventTone: Record<SecurityEventType, Parameters<typeof Badge>[0]["tone"]> = {
  "normal-login": "success",
  "failed-login": "warning",
  "account-locked": "danger",
  "foreign-device": "warning",
  "new-ip": "warning",
  "suspicious-location": "danger",
  "blocked-second-device": "danger",
  "password-reset": "warning",
  "signed-out-all": "info",
};

export function SecurityLogTable({ logs }: { logs: SecurityLog[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const muted = "text-slate-500";

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={cn("text-left text-[11px] uppercase tracking-wider", muted)}>
                {["User", "Event", "Where from", "Device", "Time", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr
                  key={l.id}
                  onClick={() => setOpenId(l.id)}
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{l.userName}</div>
                    <div className={cn("text-xs capitalize", muted)}>
                      {l.role?.replace("-", " ") ?? "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={eventTone[l.event]}>{eventLabel[l.event]}</Badge>
                    {l.detail && (
                      <div className={cn("mt-1 text-xs", muted)}>{l.detail}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-slate-700">{l.ip || "—"}</div>
                    {/* No location unless one was actually resolved. */}
                    {l.locationLabel ? (
                      <div className={cn("flex items-center gap-1 text-xs", muted)}>
                        <MapPin size={11} /> {l.locationLabel}
                      </div>
                    ) : (
                      <div className={cn("text-xs", muted)}>—</div>
                    )}
                  </td>
                  <td className={cn("px-4 py-3 text-xs", "text-slate-600")}>
                    {l.deviceLabel || "—"}
                  </td>
                  <td className={cn("px-4 py-3 text-xs", muted)}>{formatDate(l.timestamp)}</td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5 text-xs font-medium",
                        "text-slate-400"
                      )}
                    >
                      Details <ChevronRight size={13} />
                    </span>
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={6} className={cn("px-4 py-6 text-center", muted)}>
                    No security events.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SecurityLogDetailModal logId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}
