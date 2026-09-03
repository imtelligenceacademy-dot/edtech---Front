"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CloudUpload, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { getStorageStatus, runStorageBackup } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { StorageStatus, StoredBackup } from "@/types";

// Backups kept somewhere other than this server.
//
// The emailed backup is the database alone. The lesson and ICT Fair PDFs live
// on the server's disk, so losing that disk would leave a restored database
// full of rows pointing at files that no longer exist. This copies both off the
// box on a schedule.
//
// The list is the point of the screen. "Enabled" is a claim about
// configuration; a list of files with real sizes and dates is the only thing
// that shows the schedule has actually been running — and the only way to
// notice a month of silent failures before you need one of them.

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** How overdue a backup is, in whole hours, or null while it is on schedule. */
function hoursLate(newest: StoredBackup | undefined, everyHours: number): number | null {
  if (!newest) return null;
  const age = (Date.now() - new Date(newest.storedAt).getTime()) / 3_600_000;
  // A little slack: the scheduler sleeps for the interval and then works, so it
  // is always slightly behind. Flagging that would be crying wolf.
  const late = age - everyHours * 1.5;
  return late > 0 ? Math.round(age) : null;
}

export function OffBoxBackups() {
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(
    null
  );

  const load = useCallback(async () => {
    try {
      setStatus(await getStorageStatus());
    } catch (err) {
      setMessage({
        tone: "error",
        text: err instanceof Error ? err.message : "Couldn't read backup storage.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function backUpNow() {
    setRunning(true);
    setMessage(null);
    try {
      const res = await runStorageBackup(true);
      setMessage({ tone: "ok", text: res.message });
      await load();
    } catch (err) {
      setMessage({
        tone: "error",
        text: err instanceof Error ? err.message : "The backup failed.",
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader
        title="Off-site backups"
        subtitle="The database and every lesson PDF, copied to object storage on a schedule."
        action={
          status?.enabled ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void load()}
                disabled={loading || running}
                aria-label="Refresh the list"
              >
                <RefreshCw size={13} className={cn(loading && "animate-spin")} />
              </Button>
              <Button size="sm" onClick={backUpNow} disabled={running}>
                {running ? (
                  <Loader2 size={13} className="mr-1.5 animate-spin" />
                ) : (
                  <CloudUpload size={13} className="mr-1.5" />
                )}
                {running ? "Backing up…" : "Back up now"}
              </Button>
            </div>
          ) : undefined
        }
      />
      <CardBody>
        {loading ? (
          <div className="h-24 animate-pulse rounded-lg bg-slate-100" />
        ) : !status?.enabled ? (
          <NotConfigured />
        ) : (
          <>
            <p className="text-xs text-slate-500">
              Bucket <span className="font-medium text-slate-700">{status.bucket}</span>
              {status.prefix && (
                <>
                  {" "}
                  under <span className="font-medium text-slate-700">{status.prefix}/</span>
                </>
              )}
              . Database every {status.databaseIntervalHours}h, PDFs every{" "}
              {status.filesIntervalHours}h, keeping{" "}
              {status.keep > 0 ? `the newest ${status.keep} of each` : "everything"}.
            </p>

            {status.error && (
              <p className="mt-3 flex items-start gap-1.5 text-xs text-red-700">
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                Couldn&apos;t list the bucket: {status.error}
              </p>
            )}

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <BackupList
                title="Database"
                everyHours={status.databaseIntervalHours}
                items={status.databaseBackups}
              />
              <BackupList
                title="Lesson PDFs"
                everyHours={status.filesIntervalHours}
                items={status.fileBackups}
              />
            </div>
          </>
        )}

        {message && (
          <p
            role="status"
            className={cn(
              "mt-4 flex items-start gap-1.5 text-xs",
              message.tone === "error" ? "text-red-700" : "text-slate-600"
            )}
          >
            {message.tone === "error" && (
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
            )}
            {message.text}
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function NotConfigured() {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
      <p className="font-medium text-slate-900">Not set up yet.</p>
      <p className="mt-1 text-xs">
        Without it, the lesson PDFs exist in exactly one place — this server. A
        restored database would list every lesson while none of them opened.
      </p>
      <p className="mt-2 text-xs">
        Set <code className="rounded bg-white px-1">BACKUP_STORAGE_ENABLED</code>,{" "}
        <code className="rounded bg-white px-1">BACKUP_STORAGE_BUCKET</code>,{" "}
        <code className="rounded bg-white px-1">BACKUP_STORAGE_ENDPOINT_URL</code> and
        the two key variables, then reload this page.
      </p>
    </div>
  );
}

function BackupList({
  title,
  everyHours,
  items,
}: {
  title: string;
  everyHours: number;
  items: StoredBackup[];
}) {
  const newest = items[0];
  const late = hoursLate(newest, everyHours);

  return (
    <div className="rounded-lg border border-slate-200">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <span className="text-[13px] font-semibold text-slate-900">{title}</span>
        <span className="text-[11px] tabular-nums text-slate-500">
          {items.length} stored
        </span>
      </div>

      {items.length === 0 ? (
        <p className="px-3 py-6 text-center text-[11px] text-slate-500">
          Nothing stored yet. Use “Back up now” to make the first one.
        </p>
      ) : (
        <>
          {late !== null && (
            <p className="border-b border-amber-100 bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-800">
              Newest is {late}h old, and one is expected every {everyHours}h — the
              schedule may have stopped.
            </p>
          )}
          <ul className="divide-y divide-slate-100">
            {items.slice(0, 6).map((item) => (
              <li key={item.key} className="flex items-baseline gap-2 px-3 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[12px] text-slate-800">
                  {item.key.split("/").pop()}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-slate-500">
                  {sizeLabel(item.sizeBytes)}
                </span>
                <span className="shrink-0 text-[11px] text-slate-400">
                  {formatDate(item.storedAt)}
                </span>
              </li>
            ))}
          </ul>
          {items.length > 6 && (
            <p className="px-3 py-1.5 text-[11px] text-slate-400">
              and {items.length - 6} older
            </p>
          )}
        </>
      )}
    </div>
  );
}
