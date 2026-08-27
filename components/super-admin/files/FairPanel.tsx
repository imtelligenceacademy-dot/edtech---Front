"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Eye, FileText, Loader2, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import {
  deleteFairProject,
  downloadFileSelection,
  downloadLessonPdf,
  fileDownloadUrl,
  listFairProjects,
  uploadFairProject,
} from "@/lib/api";
import type { FairProject } from "@/types";

/** ICT Fair projects — no naming convention, no assignment, its own list. */
export function FairPanel() {
  const [projects, setProjects] = useState<FairProject[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listFairProjects().then(setProjects).catch(() => setMessage("Couldn't load fair projects."));
  }, []);

  async function handleFiles(fileList?: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const pdfs = Array.from(fileList).filter(
      (f) => f.name.toLowerCase().endsWith(".pdf") && f.size <= 20 * 1024 * 1024
    );
    if (pdfs.length === 0) {
      setMessage("No valid PDF (≤20 MB) selected.");
      return;
    }
    setBusy(true);
    let ok = 0;
    const failed: string[] = [];
    for (const file of pdfs) {
      try {
        await uploadFairProject(file);
        ok += 1;
      } catch {
        failed.push(file.name);
      }
    }
    setProjects(await listFairProjects());
    setBusy(false);
    setMessage(
      `${ok} project${ok === 1 ? "" : "s"} uploaded${
        failed.length ? ` · ${failed.length} failed` : ""
      }.`
    );
  }

  async function remove(id: string) {
    await deleteFairProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }

  async function download(key: string, run: () => Promise<void>) {
    setDownloading(key);
    try {
      await run();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setDownloading(null);
    }
  }

  const fileIds = projects.map((p) => p.fileId).filter((id): id is string => Boolean(id));

  return (
    <Card className="mt-4">
      <CardHeader
        title="ICT Fair"
        subtitle="Project PDFs shown to teachers who have ICT Fair access. Any filename — no grade/lesson convention."
        action={
          fileIds.length > 0 ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={downloading === "all"}
              onClick={() =>
                download("all", () => downloadFileSelection(fileIds, "ict-fair"))
              }
            >
              {downloading === "all" ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Download size={13} />
              )}
              Download all
            </Button>
          ) : undefined
        }
      />
      <CardBody>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFiles(e.dataTransfer.files);
          }}
          className="flex flex-wrap items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center"
        >
          <UploadCloud className="text-slate-400" size={20} />
          <p className="text-sm text-slate-600">Drop fair project PDFs here —</p>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            multiple
            className="sr-only"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <UploadCloud size={14} /> {busy ? "Uploading…" : "Choose files"}
          </Button>
          {message && (
            <p className="w-full text-xs text-slate-600" role="status">
              {message}
            </p>
          )}
        </div>

        {projects.length === 0 ? (
          <p className="mt-3 px-1 text-xs text-slate-400">No fair projects yet.</p>
        ) : (
          <div className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
            {projects.map((p) => (
              <div key={p.id} className="group flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50">
                <FileText size={14} className="shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-slate-800">
                  {p.title}
                </span>
                <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
                  {p.fileId && (
                    <>
                      <a
                        href={fileDownloadUrl(p.fileId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900"
                        title="Open in a new tab"
                      >
                        <Eye size={14} />
                      </a>
                      <button
                        type="button"
                        title="Download this PDF"
                        disabled={downloading === p.fileId}
                        onClick={() =>
                          download(p.fileId!, () =>
                            downloadLessonPdf(p.fileId!, `${p.title}.pdf`)
                          )
                        }
                        className="rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900 disabled:opacity-50"
                      >
                        {downloading === p.fileId ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Download size={14} />
                        )}
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(p.id)}
                    title="Delete this project"
                    className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
