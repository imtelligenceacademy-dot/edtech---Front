"use client";

import { useRef, useState } from "react";
import {
  Database,
  DownloadCloud,
  Mail,
  Plus,
  X,
  Loader2,
  ShieldAlert,
  Trash2,
  Upload,
} from "lucide-react";
import { PageHeader } from "@/components/layout/DashboardShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import {
  downloadDatabase,
  emailDatabase,
  restoreDatabase,
  wipeDatabase,
} from "@/lib/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function BackupClient() {
  const [downloading, setDownloading] = useState(false);

  const [recipients, setRecipients] = useState<string[]>([]);
  const [entry, setEntry] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  // Danger zone
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeConfirm, setWipeConfirm] = useState("");
  const [wiping, setWiping] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoring, setRestoring] = useState(false);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  async function handleWipe() {
    setWiping(true);
    setResult(null);
    try {
      const res = await wipeDatabase();
      setResult({ tone: "ok", text: res.message });
      setWipeOpen(false);
      setWipeConfirm("");
    } catch (e) {
      setResult({ tone: "error", text: e instanceof Error ? e.message : "Wipe failed." });
    } finally {
      setWiping(false);
    }
  }

  async function handleRestore() {
    if (!restoreFile) return;
    setRestoring(true);
    setResult(null);
    try {
      const res = await restoreDatabase(restoreFile);
      setResult({ tone: "ok", text: res.message });
      setRestoreFile(null);
    } catch (e) {
      setResult({ tone: "error", text: e instanceof Error ? e.message : "Restore failed." });
    } finally {
      setRestoring(false);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    setResult(null);
    try {
      await downloadDatabase();
    } catch (e) {
      setResult({ tone: "error", text: e instanceof Error ? e.message : "Download failed." });
    } finally {
      setDownloading(false);
    }
  }

  function addRecipient() {
    const email = entry.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      setResult({ tone: "error", text: "Enter a valid email address." });
      return;
    }
    if (recipients.includes(email)) {
      setEntry("");
      return;
    }
    setRecipients((r) => [...r, email]);
    setEntry("");
    setResult(null);
  }

  async function handleSend() {
    if (recipients.length === 0) {
      setResult({ tone: "error", text: "Add at least one recipient." });
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const res = await emailDatabase(recipients, note.trim() || undefined);
      setResult({ tone: "ok", text: res.message });
    } catch (e) {
      setResult({ tone: "error", text: e instanceof Error ? e.message : "Failed to send." });
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Database backup"
        subtitle="Download the full database, or email a backup to trusted recipients."
      />

      {/* Security caution */}
      <div className="mb-6 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-600" />
        <p>
          A backup is the <strong>entire database</strong> — every school, user, and
          record (passwords are stored only as hashes, never plaintext). Treat the
          file as highly sensitive: only email it to people you trust, over a mail
          account you control.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Download */}
        <Card>
          <CardHeader title="Download backup" subtitle="A single .db SQLite file." />
          <CardBody>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Database size={20} />
              </span>
              <p className="text-sm text-slate-600">
                Generates a consistent snapshot of the live database and downloads it
                to your computer.
              </p>
            </div>
            <div className="mt-4">
              <Button onClick={handleDownload} disabled={downloading}>
                {downloading ? <Loader2 size={14} className="animate-spin" /> : <DownloadCloud size={14} />}
                {downloading ? "Preparing…" : "Download .db backup"}
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* Email */}
        <Card>
          <CardHeader title="Email backup" subtitle="Send the .db to one or more people." />
          <CardBody>
            <label className="block text-xs font-medium text-slate-700">
              Recipients
              <div className="mt-1 flex gap-2">
                <input
                  type="email"
                  value={entry}
                  onChange={(e) => setEntry(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addRecipient();
                    }
                  }}
                  placeholder="name@example.com"
                  className="h-10 flex-1 rounded-lg border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                />
                <Button variant="secondary" type="button" onClick={addRecipient}>
                  <Plus size={14} /> Add
                </Button>
              </div>
            </label>

            {recipients.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {recipients.map((r) => (
                  <span
                    key={r}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700"
                  >
                    {r}
                    <button
                      onClick={() => setRecipients((list) => list.filter((x) => x !== r))}
                      className="text-slate-400 hover:text-red-600"
                      aria-label={`Remove ${r}`}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <label className="mt-3 block text-xs font-medium text-slate-700">
              Note (optional)
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Add a short message to include in the email…"
                className="mt-1 w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </label>

            <div className="mt-4">
              <Button onClick={handleSend} disabled={sending || recipients.length === 0}>
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                {sending ? "Sending…" : `Send backup${recipients.length ? ` to ${recipients.length}` : ""}`}
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>

      {result && (
        <div className="mt-4">
          <Badge tone={result.tone === "ok" ? "success" : "danger"}>{result.text}</Badge>
        </div>
      )}

      {/* Danger zone */}
      <Card className="mt-6 border-red-200">
        <CardHeader title="Danger zone" subtitle="Irreversible operations — be careful." />
        <CardBody>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-red-100 bg-red-50/50 p-4">
              <p className="text-sm font-medium text-slate-900">Insert (restore) database</p>
              <p className="mt-1 text-xs text-slate-600">
                Replace ALL current data with the contents of a backup .db file.
              </p>
              <input
                ref={restoreInputRef}
                type="file"
                accept=".db"
                className="sr-only"
                onChange={(e) => {
                  setRestoreFile(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
              <div className="mt-3 flex items-center gap-2">
                <Button variant="secondary" onClick={() => restoreInputRef.current?.click()}>
                  <Upload size={14} /> Choose .db
                </Button>
                {restoreFile && (
                  <span className="truncate text-xs text-slate-600">{restoreFile.name}</span>
                )}
              </div>
              {restoreFile && (
                <div className="mt-3">
                  <Button variant="danger" onClick={handleRestore} disabled={restoring}>
                    {restoring ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    {restoring ? "Restoring…" : "Replace database with this file"}
                  </Button>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-red-100 bg-red-50/50 p-4">
              <p className="text-sm font-medium text-slate-900">Wipe database</p>
              <p className="mt-1 text-xs text-slate-600">
                Delete all data. Your super-admin account is kept so you stay
                signed in.
              </p>
              <div className="mt-3">
                <Button variant="danger" onClick={() => setWipeOpen(true)}>
                  <Trash2 size={14} /> Wipe all data
                </Button>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Wipe confirmation */}
      <Modal
        open={wipeOpen}
        onClose={() => {
          setWipeOpen(false);
          setWipeConfirm("");
        }}
        title="Wipe the entire database?"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setWipeOpen(false);
                setWipeConfirm("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleWipe}
              disabled={wiping || wipeConfirm.trim().toUpperCase() !== "WIPE"}
            >
              {wiping ? "Wiping…" : "Wipe database"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          This permanently deletes <strong>all schools, users, lessons, files,
          progress, reports and logs</strong>. Only your super-admin account is
          kept. This cannot be undone — make sure you have a backup first.
        </p>
        <label className="mt-3 block text-xs font-medium text-slate-700">
          Type <span className="font-mono text-red-600">WIPE</span> to confirm
          <input
            value={wipeConfirm}
            onChange={(e) => setWipeConfirm(e.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
          />
        </label>
      </Modal>
    </>
  );
}
