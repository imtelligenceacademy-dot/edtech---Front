"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronRight, FileText, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { previewUploads, uploadFile, type UploadPreviewRow } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/super-admin/files";

// Collapsed or not is a per-browser habit: an admin uploading a term's worth of
// PDFs wants it open, one doing housekeeping wants the file list at the top.
const OPEN_KEY = "imt_files_upload_open";

function readOpenPref(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) !== "0";
  } catch {
    return true;
  }
}

function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
        {options.map(([code, text]) => (
          <button
            key={String(code)}
            type="button"
            onClick={() => onChange(code)}
            className={cn(
              "rounded-md px-3 py-1.5 font-medium transition-colors",
              value === code ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
            )}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Upload, unchanged in behaviour: choosing files asks the server what each name
 * would do, and nothing is sent until the admin has read that. It only collapses
 * now, so the 400-file browser below it isn't permanently pushed off-screen.
 */
export function UploadPanel({ onUploaded }: { onUploaded: () => Promise<void> | void }) {
  const [open, setOpen] = useState(true);
  const [language, setLanguage] = useState<Lang>("en");
  const [year, setYear] = useState<1 | 2>(2);
  const [dragOver, setDragOver] = useState(false);
  const [staged, setStaged] = useState<File[]>([]);
  const [preview, setPreview] = useState<UploadPreviewRow[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [results, setResults] = useState<{ filename: string; text: string; ok: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "info" | "error"; text: string } | null>(
    null
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setOpen(readOpenPref()), []);

  function toggleOpen() {
    setOpen((wasOpen) => {
      try {
        window.localStorage.setItem(OPEN_KEY, wasOpen ? "0" : "1");
      } catch {
        /* storage disabled — the panel just won't remember */
      }
      return !wasOpen;
    });
  }

  // Choosing files doesn't upload them: it asks the server what each name would
  // do, so the answer arrives before the act rather than after it.
  async function stageFiles(fileList?: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const pdfs = Array.from(fileList).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    const oversize = pdfs.filter((f) => f.size > 20 * 1024 * 1024);
    const usable = pdfs.filter((f) => f.size <= 20 * 1024 * 1024);

    setResults([]);
    if (usable.length === 0) {
      setMessage({ tone: "error", text: "No valid PDF (≤20 MB) selected." });
      return;
    }
    setMessage(
      oversize.length
        ? { tone: "info", text: `${oversize.length} file(s) over 20 MB were left out.` }
        : null
    );

    setStaged(usable);
    setPreviewing(true);
    try {
      setPreview(await previewUploads(usable.map((f) => f.name), language, year));
    } catch {
      // Without a preview the admin can still upload; they just don't get the
      // heads-up.
      setPreview(null);
      setMessage({
        tone: "info",
        text: "Couldn't preview these files — you can still upload them.",
      });
    } finally {
      setPreviewing(false);
    }
  }

  function cancelStaged() {
    setStaged([]);
    setPreview(null);
    setMessage(null);
  }

  // Upload the staged files, three at a time, and keep every file's outcome.
  async function uploadStaged() {
    if (staged.length === 0) return;
    setBusy(true);
    setResults([]);
    const outcomes: { filename: string; text: string; ok: boolean }[] = [];
    let done = 0;

    async function worker(queue: File[]) {
      for (;;) {
        const file = queue.shift();
        if (!file) return;
        try {
          const result = await uploadFile(file, language, year);
          outcomes.push(
            result.note
              ? {
                  filename: file.name,
                  ok: false,
                  text: "stored, but not assigned — name doesn't match the format",
                }
              : {
                  filename: file.name,
                  ok: true,
                  text: `${result.lessonTitle ?? "lesson"} · ${result.assignedCount} teacher${
                    result.assignedCount === 1 ? "" : "s"
                  }`,
                }
          );
        } catch (err) {
          outcomes.push({
            filename: file.name,
            ok: false,
            text: err instanceof Error ? err.message : "upload failed",
          });
        }
        done += 1;
        setMessage({ tone: "info", text: `Uploading ${done} of ${staged.length}…` });
      }
    }

    const queue = [...staged];
    await Promise.all([worker(queue), worker(queue), worker(queue)]);

    await onUploaded();
    setBusy(false);
    setStaged([]);
    setPreview(null);
    setResults(outcomes.sort((a, b) => Number(a.ok) - Number(b.ok)));
    const failed = outcomes.filter((o) => !o.ok).length;
    setMessage({
      tone: failed ? "error" : "ok",
      text: failed
        ? `${outcomes.length - failed} uploaded · ${failed} need attention`
        : `${outcomes.length} uploaded`,
    });
  }

  const messageTone =
    message?.tone === "ok"
      ? "text-emerald-700"
      : message?.tone === "error"
      ? "text-red-600"
      : "text-slate-600";

  return (
    <Card className="mb-4 overflow-hidden">
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-5 py-3 text-left transition-colors hover:bg-slate-50"
      >
        <ChevronRight
          size={15}
          className={cn("shrink-0 text-slate-400 transition-transform", open && "rotate-90")}
        />
        <UploadCloud size={16} className="shrink-0 text-brand-600" />
        <span className="text-sm font-semibold text-slate-900">Upload lessons</span>
        <span className="truncate text-xs text-slate-500">
          Named “Grade N Lesson NN …” — each PDF creates its lesson and assigns the
          teachers who teach it.
        </span>
        {!open && staged.length > 0 && (
          <span className="ml-auto shrink-0 text-xs font-medium text-brand-700">
            {staged.length} waiting
          </span>
        )}
      </button>

      {open && (
        <div className="border-t border-slate-100 p-5 pt-4">
          <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Choice
              label="Language of these files:"
              value={language}
              options={[
                ["en", "English"],
                ["fr", "French"],
              ]}
              onChange={setLanguage}
            />
            <Choice
              label="Curriculum year:"
              value={year}
              options={[
                [1, "Year 1"],
                [2, "Year 2"],
              ]}
              onChange={setYear}
            />
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              stageFiles(e.dataTransfer.files);
            }}
            className={cn(
              "flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
              dragOver ? "border-brand bg-brand-50" : "border-slate-300 bg-slate-50"
            )}
          >
            <UploadCloud className="text-slate-400" size={22} />
            <p className="text-sm text-slate-600">
              Drop PDFs here — one or many —{" "}
              <span className="hidden sm:inline">or</span>
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              className="sr-only"
              onChange={(e) => {
                stageFiles(e.target.files);
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
              <p
                className={cn(
                  "w-full text-xs",
                  "inline-flex items-center justify-center gap-1.5",
                  messageTone
                )}
                role="status"
              >
                {message.tone === "ok" && <CheckCircle2 size={13} />}
                {message.text}
              </p>
            )}
          </div>

          {/* What these files would do, before any of them is uploaded. */}
          {staged.length > 0 && (
            <div className="mt-4 rounded-xl border border-slate-200">
              <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
                <p className="text-sm font-medium text-slate-900">
                  {staged.length} file{staged.length === 1 ? "" : "s"} ready
                </p>
                <p className="text-xs text-slate-500">
                  {previewing ? "Checking names…" : "Nothing has been uploaded yet."}
                </p>
                <div className="ml-auto flex items-center gap-2">
                  <Button variant="secondary" onClick={cancelStaged} disabled={busy}>
                    Cancel
                  </Button>
                  <Button onClick={uploadStaged} disabled={busy || previewing}>
                    <UploadCloud size={14} />{" "}
                    {busy
                      ? "Uploading…"
                      : `Upload ${staged.length} file${staged.length === 1 ? "" : "s"}`}
                  </Button>
                </div>
              </div>

              <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
                {staged.map((file) => {
                  const row = preview?.find((p) => p.filename === file.name);
                  const bad = row ? !row.ok : false;
                  return (
                    <li key={file.name} className="flex items-start gap-3 px-4 py-2.5">
                      <FileText
                        size={14}
                        className={cn("mt-0.5 shrink-0", bad ? "text-amber-500" : "text-slate-400")}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-800">{file.name}</p>
                        <p className={cn("text-[11px]", bad ? "text-amber-700" : "text-slate-500")}>
                          {!row
                            ? previewing
                              ? "…"
                              : "Will be uploaded."
                            : !row.ok
                            ? row.note
                            : `${row.existingLesson ? "Adds to" : "Creates"} “${row.lessonTitle}” · ${
                                row.teacherNames.length
                              } teacher${row.teacherNames.length === 1 ? "" : "s"}${
                                row.teacherNames.length ? `: ${row.teacherNames.join(", ")}` : ""
                              }`}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500">
                Names must read “Grade 7 micro:bit lesson 04 Step Counter.pdf” — grade, optional
                course (python / micro:bit), lesson number, then the title. Anything else is stored
                but assigned to nobody.
              </p>
            </div>
          )}

          {/* Every file's outcome, so a skipped one is named, not counted. */}
          {results.length > 0 && (
            <ul className="mt-4 max-h-72 space-y-1.5 overflow-y-auto">
              {results.map((r) => (
                <li
                  key={r.filename}
                  className={cn(
                    "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
                    r.ok ? "border-slate-200" : "border-amber-200 bg-amber-50/60"
                  )}
                >
                  {r.ok ? (
                    <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-500" />
                  ) : (
                    <FileText size={13} className="mt-0.5 shrink-0 text-amber-600" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-800">{r.filename}</span>
                    <span className={r.ok ? "text-slate-500" : "text-amber-700"}>{r.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
