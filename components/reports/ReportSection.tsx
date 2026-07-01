"use client";

import { useEffect, useState } from "react";
import { Download, Eye, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { formatDate, cn } from "@/lib/utils";
import { downloadReport as downloadWordReport, listReports } from "@/lib/api";
import type { Report, ReportStatus } from "@/types";

const statusTone: Record<
  ReportStatus,
  { tone: Parameters<typeof Badge>[0]["tone"]; label: string }
> = {
  pending: { tone: "neutral", label: "Pending" },
  processing: { tone: "info", label: "Processing" },
  ready: { tone: "success", label: "Ready" },
  failed: { tone: "danger", label: "Failed" },
};

export function ReportSection({
  scope,
  schoolId,
}: {
  scope: "global" | "school";
  schoolId?: string;
}) {
  const dark = false;
  const muted = "text-slate-500";
  const strong = "text-slate-900";

  const [reports, setReports] = useState<Report[]>([]);
  const [viewing, setViewing] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDownloadWord() {
    setDownloadError(null);
    setDownloading(true);
    try {
      await downloadWordReport(scope === "school" ? "school" : "super", schoolId);
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : "Download failed.");
    } finally {
      setDownloading(false);
    }
  }

  useEffect(() => {
    listReports()
      .then((rows) =>
        setReports(rows.filter((r) => (scope === "global" ? true : r.schoolId === schoolId)))
      )
      .finally(() => setLoading(false));
  }, [schoolId, scope]);

  function downloadFile(name: string, contents: string, type = "text/csv") {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function exportAll() {
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const rows = reports.map((report) =>
      [report.title, report.scope, report.status, report.requestedAt, report.readyAt ?? ""]
        .map(escape)
        .join(",")
    );
    downloadFile(
      `im-telligence-reports-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Title,Scope,Status,Requested,Ready", ...rows].join("\n")
    );
  }

  // Downloads the real server-generated Word report scoped to this row:
  // school-admins get their own school; super-admins get the report's school
  // (or the whole platform when the report isn't tied to one school).
  async function downloadRow(report: Report) {
    setDownloadError(null);
    setDownloadingId(report.id);
    try {
      if (scope === "school") {
        await downloadWordReport("school");
      } else {
        await downloadWordReport("super", report.schoolId ?? undefined);
      }
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : "Download failed.");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className={cn("text-sm", dark ? "text-slate-300" : "text-slate-600")}>
          {loading
            ? "Loading reports..."
            : `${reports.length} report${reports.length === 1 ? "" : "s"} on file`}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={exportAll} disabled={reports.length === 0}>
            <Download size={14} /> Export CSV
          </Button>
          <Button onClick={handleDownloadWord} disabled={downloading}>
            <FileText size={14} />
            {downloading ? "Preparing…" : "Download Word report"}
          </Button>
        </div>
      </div>
      {downloadError && <p className="text-xs text-red-600">{downloadError}</p>}

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
                <th className="px-4 py-2.5 font-medium">Report</th>
                <th className="px-4 py-2.5 font-medium">Requested</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => {
                const s = statusTone[r.status];
                return (
                  <tr key={r.id} className={cn("border-t", dark ? "border-white/5" : "border-slate-100")}>
                    <td className="px-4 py-3">
                      <div className={cn("font-medium", strong)}>{r.title}</div>
                      <div className={cn("text-xs", muted)}>Scope: {r.scope}</div>
                    </td>
                    <td className={cn("px-4 py-3", dark ? "text-slate-300" : "text-slate-600")}>
                      {formatDate(r.requestedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={s.tone}>
                        {r.status === "processing" && (
                          <Loader2 size={10} className="animate-spin" />
                        )}
                        {s.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setViewing(r)}>
                          <Eye size={12} /> View
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => downloadRow(r)}
                          disabled={downloadingId === r.id}
                        >
                          <Download size={12} />
                          {downloadingId === r.id ? "Preparing…" : "Download"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {reports.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className={cn("px-4 py-6 text-center", muted)}>
                    No reports yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing?.title ?? "Report"}
        footer={
          viewing ? (
            <Button onClick={() => downloadRow(viewing)} disabled={downloadingId === viewing.id}>
              <Download size={14} />
              {downloadingId === viewing.id ? "Preparing…" : "Download"}
            </Button>
          ) : undefined
        }
      >
        {viewing && (
          <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-slate-500">Scope</dt>
            <dd className="capitalize text-slate-900">{viewing.scope}</dd>
            <dt className="text-slate-500">Requested</dt>
            <dd className="text-slate-900">{formatDate(viewing.requestedAt)}</dd>
            <dt className="text-slate-500">Ready</dt>
            <dd className="text-slate-900">
              {viewing.readyAt ? formatDate(viewing.readyAt) : "Not ready"}
            </dd>
          </dl>
        )}
      </Modal>
    </div>
  );
}
