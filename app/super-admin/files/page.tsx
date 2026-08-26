"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Eye,
  FileText,
  Folder,
  FolderOpen,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { PageHeader } from "@/components/layout/DashboardShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import {
  previewUploads,
  type UploadPreviewRow,
  deleteFairProject,
  deleteUploadedFile,
  fileDownloadUrl,
  listFairProjects,
  listLessons,
  listUploadedFiles,
  uploadFairProject,
  uploadFile,
} from "@/lib/api";
import { cn, formatDateOnly } from "@/lib/utils";
import type { FairProject, Lesson, UploadedFile } from "@/types";

type Lang = "en" | "fr";
type FileBucket = { en: UploadedFile[]; fr: UploadedFile[]; other: UploadedFile[] };
const GRADES = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const YEARS = [1, 2] as const;

function emptyBucket(): FileBucket {
  return { en: [], fr: [], other: [] };
}

function bucketCount(bucket: FileBucket) {
  return bucket.en.length + bucket.fr.length + bucket.other.length;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function FilesPage() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [language, setLanguage] = useState<Lang>("en");
  const [year, setYear] = useState<1 | 2>(2);
  const [dragOver, setDragOver] = useState(false);
  // Files chosen but not uploaded yet, with what the server says will happen to
  // them. Nothing is sent until the admin has seen this.
  const [staged, setStaged] = useState<File[]>([]);
  const [preview, setPreview] = useState<UploadPreviewRow[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  // Per-file outcome of the last upload, so a skipped file is named rather than
  // counted.
  const [results, setResults] = useState<{ filename: string; text: string; ok: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "info" | "error"; text: string } | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  // ICT Fair state (separate from the lesson pipeline).
  const [fairProjects, setFairProjects] = useState<FairProject[]>([]);
  const [fairBusy, setFairBusy] = useState(false);
  const [fairMessage, setFairMessage] = useState<string | null>(null);
  const fairInputRef = useRef<HTMLInputElement>(null);

  // File pending single-deletion confirmation.
  const [deletingFile, setDeletingFile] = useState<UploadedFile | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Bulk selection for multi-delete.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  function toggleSelect(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function refresh() {
    const [fileRows, lessonRows, fairRows] = await Promise.all([
      listUploadedFiles(),
      listLessons(),
      listFairProjects(),
    ]);
    setFiles(fileRows);
    setLessons(lessonRows);
    setFairProjects(fairRows);
  }

  async function handleFairFiles(fileList?: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const pdfs = Array.from(fileList).filter(
      (f) => f.name.toLowerCase().endsWith(".pdf") && f.size <= 20 * 1024 * 1024
    );
    if (pdfs.length === 0) {
      setFairMessage("No valid PDF (≤20 MB) selected.");
      return;
    }
    setFairBusy(true);
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
    const refreshed = await listFairProjects();
    setFairProjects(refreshed);
    setFairBusy(false);
    setFairMessage(
      `${ok} project${ok === 1 ? "" : "s"} uploaded${failed.length ? ` · ${failed.length} failed` : ""}.`
    );
  }

  async function removeFairProject(id: string) {
    await deleteFairProject(id);
    setFairProjects((prev) => prev.filter((p) => p.id !== id));
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  // Group files into year -> grade -> {en, fr, other}; unsorted = no parsed grade/year.
  const { byYear, unsorted } = useMemo(() => {
    const lessonById = new Map(lessons.map((l) => [l.id, l]));
    const byYear: Record<number, Record<number, FileBucket>> = {};
    const unsorted: UploadedFile[] = [];
    for (const f of files) {
      const lesson = f.linkedLessonId ? lessonById.get(f.linkedLessonId) : undefined;
      const grade = lesson?.grade ?? null;
      const lessonYear = lesson?.year ?? null;
      if (grade == null || lessonYear == null) {
        unsorted.push(f);
        continue;
      }
      const gradeBuckets = (byYear[lessonYear] ??= {});
      const bucket = (gradeBuckets[grade] ??= emptyBucket());
      if (lesson?.language === "en") bucket.en.push(f);
      else if (lesson?.language === "fr") bucket.fr.push(f);
      else bucket.other.push(f);
    }
    return { byYear, unsorted };
  }, [files, lessons]);

  // Bulk selection covers every lesson PDF (fair projects have their own list).
  const allFileIds = files.map((f) => f.id);
  const allSelected = allFileIds.length > 0 && allFileIds.every((id) => selected.has(id));
  const selectedCount = allFileIds.filter((id) => selected.has(id)).length;

  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(allFileIds));
  }

  async function confirmBulkDelete() {
    setBulkBusy(true);
    try {
      // Sequential; siblings of an already-deleted lesson 404, which we ignore.
      for (const id of Array.from(selected)) {
        await deleteUploadedFile(id).catch(() => undefined);
      }
      await refresh();
      setSelected(new Set());
      setBulkConfirm(false);
    } finally {
      setBulkBusy(false);
    }
  }

  // Choosing files no longer uploads them: it asks the server what each name
  // would do, so the answer arrives before the act rather than after it.
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
      setMessage({ tone: "info", text: "Couldn't preview these files — you can still upload them." });
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
              ? { filename: file.name, ok: false, text: "stored, but not assigned — name doesn't match the format" }
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

    await refresh();
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

  // Deleting a lesson PDF removes the whole lesson (and every teacher's progress
  // on it), so confirm first, then reload files + lessons.
  async function confirmDeleteFile() {
    if (!deletingFile) return;
    setDeleteBusy(true);
    try {
      await deleteUploadedFile(deletingFile.id);
      await refresh();
      setDeletingFile(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  function isOpen(key: string, hasFiles: boolean) {
    return openMap[key] ?? hasFiles; // open by default when the folder has files
  }
  function toggle(key: string, hasFiles: boolean) {
    setOpenMap((m) => ({ ...m, [key]: !(m[key] ?? hasFiles) }));
  }

  if (loading) return null;

  const messageTone =
    message?.tone === "ok"
      ? "text-emerald-700"
      : message?.tone === "error"
      ? "text-red-600"
      : "text-slate-600";

  function fileRow(f: UploadedFile) {
    const checked = selected.has(f.id);
    return (
      <div
        key={f.id}
        className={cn(
          "flex items-center gap-2 rounded-lg border px-3 py-2",
          checked ? "border-brand/40 bg-brand-50/50" : "border-slate-100"
        )}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={() => toggleSelect(f.id)}
          aria-label={`Select ${f.filename}`}
          className="h-4 w-4 shrink-0 rounded border-slate-300 text-brand focus:ring-brand"
        />
        <FileText size={14} className="shrink-0 text-slate-400" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
          {f.filename}
        </span>
        <span className="hidden text-xs text-slate-500 sm:inline">{formatBytes(f.sizeBytes)}</span>
        <span className="hidden text-xs text-slate-400 md:inline">
          {formatDateOnly(f.createdAt)}
        </span>
        <a
          href={fileDownloadUrl(f.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          title="View PDF"
        >
          <Eye size={13} /> View
        </a>
        <Button size="sm" variant="ghost" onClick={() => setDeletingFile(f)}>
          <Trash2 size={12} />
        </Button>
      </div>
    );
  }

  function langSection(
    label: string,
    tone: Parameters<typeof Badge>[0]["tone"],
    list: UploadedFile[]
  ) {
    return (
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <Badge tone={tone}>{label}</Badge>
          <span className="text-[11px] text-slate-400">{list.length} file{list.length === 1 ? "" : "s"}</span>
        </div>
        {list.length === 0 ? (
          <p className="px-1 text-xs text-slate-400">No {label} files yet.</p>
        ) : (
          <div className="space-y-1.5">{list.map(fileRow)}</div>
        )}
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Files" subtitle="Upload PDF lessons — they auto-create and assign." />

      <Card className="mb-6">
        <CardHeader
          title="Upload"
          subtitle="Named “Grade N Lesson NN …”. Pick the year and language, then drop the PDFs — each lands in its year and grade folder automatically."
        />
        <CardBody>
          <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-slate-700">Language of these files:</span>
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
                {(
                  [
                    ["en", "English"],
                    ["fr", "French"],
                  ] as [Lang, string][]
                ).map(([code, label]) => (
                  <button
                    key={code}
                    onClick={() => setLanguage(code)}
                    className={cn(
                      "rounded-md px-3 py-1.5 font-medium",
                      language === code
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-slate-700">Curriculum year:</span>
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
                {(
                  [
                    [1, "Year 1"],
                    [2, "Year 2"],
                  ] as [1 | 2, string][]
                ).map(([code, label]) => (
                  <button
                    key={code}
                    onClick={() => setYear(code)}
                    className={cn(
                      "rounded-md px-3 py-1.5 font-medium",
                      year === code
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
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
              "rounded-xl border-2 border-dashed p-10 text-center transition-colors",
              dragOver ? "border-brand bg-brand-50" : "border-slate-300 bg-slate-50"
            )}
          >
            <UploadCloud className="mx-auto text-slate-400" size={32} />
            <p className="mt-2 text-sm font-medium text-slate-700">Drop PDF files here</p>
            <p className="text-xs text-slate-500">
              one or many — or click below to select from your computer
            </p>
            <div className="mt-4">
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
              <Button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
                <UploadCloud size={14} /> {busy ? "Uploading…" : "Choose files"}
              </Button>
            </div>
            {message && (
              <p
                className={cn("mt-3 inline-flex items-center gap-1.5 text-xs", messageTone)}
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
                    {busy ? "Uploading…" : `Upload ${staged.length} file${staged.length === 1 ? "" : "s"}`}
                  </Button>
                </div>
              </div>

              <ul className="divide-y divide-slate-100">
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
                Names must read “Grade 7 micro:bit lesson 04 Step Counter.pdf” —
                grade, optional course (python / micro:bit), lesson number, then
                the title. Anything else is stored but assigned to nobody.
              </p>
            </div>
          )}

          {/* Every file's outcome, so a skipped one is named, not counted. */}
          {results.length > 0 && (
            <ul className="mt-4 space-y-1.5">
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
        </CardBody>
      </Card>

      {/* Bulk selection toolbar */}
      {allFileIds.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = selectedCount > 0 && !allSelected;
              }}
              onChange={toggleSelectAll}
              className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
            />
            Select all
          </label>
          <span className="text-xs text-slate-500">
            {selectedCount} of {allFileIds.length} selected
          </span>
          {selectedCount > 0 && (
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              Clear
            </button>
          )}
          <div className="ml-auto">
            <Button
              size="sm"
              variant="danger"
              disabled={selectedCount === 0}
              onClick={() => setBulkConfirm(true)}
            >
              <Trash2 size={13} /> Delete selected
              {selectedCount > 0 ? ` (${selectedCount})` : ""}
            </Button>
          </div>
        </div>
      )}

      {/* Year and grade folders */}
      <div className="space-y-3">
        {YEARS.map((yearNo) => {
          const gradeBuckets = byYear[yearNo] ?? {};
          const gradesWithFiles = GRADES.filter((grade) =>
            bucketCount(gradeBuckets[grade] ?? emptyBucket()) > 0
          );
          const count = gradesWithFiles.reduce(
            (total, grade) => total + bucketCount(gradeBuckets[grade] ?? emptyBucket()),
            0
          );
          const bucket = gradesWithFiles.reduce(
            (totals, grade) => {
              const gradeBucket = gradeBuckets[grade] ?? emptyBucket();
              totals.en.push(...gradeBucket.en);
              totals.fr.push(...gradeBucket.fr);
              totals.other.push(...gradeBucket.other);
              return totals;
            },
            emptyBucket()
          );
          const key = `y${yearNo}`;
          const open = isOpen(key, count > 0);
          return (
            <div key={key} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <button
                onClick={() => toggle(key, count > 0)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                {open ? (
                  <FolderOpen size={18} className="text-brand-600" />
                ) : (
                  <Folder size={18} className="text-slate-400" />
                )}
                <span className="font-medium text-slate-900">Year {yearNo}</span>
                <span className="text-xs text-slate-500">
                  {count} file{count === 1 ? "" : "s"}
                  {count > 0 && ` · ${bucket.en.length} EN · ${bucket.fr.length} FR`}
                </span>
                <ChevronDown
                  size={16}
                  className={cn(
                    "ml-auto text-slate-400 transition-transform",
                    open && "rotate-180"
                  )}
                />
              </button>
              {open && (
                <div className="space-y-3 border-t border-slate-100 p-4">
                  {gradesWithFiles.length === 0 ? (
                    <p className="text-xs text-slate-400">No files in Year {yearNo} yet.</p>
                  ) : (
                    gradesWithFiles.map((grade) => {
                      const gradeBucket = gradeBuckets[grade] ?? emptyBucket();
                      const gradeCount = bucketCount(gradeBucket);
                      const gradeKey = `${key}-g${grade}`;
                      const gradeOpen = isOpen(gradeKey, gradeCount > 0);
                      return (
                        <div
                          key={gradeKey}
                          className="overflow-hidden rounded-lg border border-slate-100 bg-slate-50/50"
                        >
                          <button
                            onClick={() => toggle(gradeKey, gradeCount > 0)}
                            className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white"
                          >
                            {gradeOpen ? (
                              <FolderOpen size={16} className="text-brand-600" />
                            ) : (
                              <Folder size={16} className="text-slate-400" />
                            )}
                            <span className="text-sm font-medium text-slate-900">Grade {grade}</span>
                            <span className="text-xs text-slate-500">
                              {gradeCount} file{gradeCount === 1 ? "" : "s"}
                              {gradeCount > 0 &&
                                ` · ${gradeBucket.en.length} EN · ${gradeBucket.fr.length} FR`}
                            </span>
                            <ChevronDown
                              size={15}
                              className={cn(
                                "ml-auto text-slate-400 transition-transform",
                                gradeOpen && "rotate-180"
                              )}
                            />
                          </button>
                          {gradeOpen && (
                            <div className="grid grid-cols-1 gap-5 border-t border-slate-100 bg-white p-4 lg:grid-cols-2">
                              {langSection("English", "info", gradeBucket.en)}
                              {langSection("French", "brand", gradeBucket.fr)}
                              {gradeBucket.other.length > 0 && (
                                <div className="lg:col-span-2">
                                  {langSection("Unspecified language", "muted", gradeBucket.other)}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}

        {unsorted.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50/40">
            <div className="flex items-center gap-3 px-4 py-3">
              <Folder size={18} className="text-amber-500" />
              <span className="font-medium text-slate-900">Unsorted</span>
              <span className="text-xs text-slate-500">
                {unsorted.length} file{unsorted.length === 1 ? "" : "s"} — filename not in “Grade N
                Lesson NN …” format
              </span>
            </div>
            <div className="space-y-1.5 border-t border-amber-100 p-4">
              {unsorted.map(fileRow)}
            </div>
          </div>
        )}
      </div>

      {/* ICT Fair — separate from lessons: no naming convention, no assignment. */}
      <Card className="mt-6">
        <CardHeader
          title="ICT Fair"
          subtitle="Project PDFs shown to teachers who have ICT Fair access. Any filename — no grade/lesson convention."
        />
        <CardBody>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFairFiles(e.dataTransfer.files);
            }}
            className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center"
          >
            <UploadCloud className="mx-auto text-slate-400" size={28} />
            <p className="mt-2 text-sm font-medium text-slate-700">Drop fair project PDFs here</p>
            <div className="mt-3">
              <input
                ref={fairInputRef}
                type="file"
                accept=".pdf,application/pdf"
                multiple
                className="sr-only"
                onChange={(e) => {
                  handleFairFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                disabled={fairBusy}
                onClick={() => fairInputRef.current?.click()}
              >
                <UploadCloud size={14} /> {fairBusy ? "Uploading…" : "Choose files"}
              </Button>
            </div>
            {fairMessage && (
              <p className="mt-3 text-xs text-slate-600" role="status">
                {fairMessage}
              </p>
            )}
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex items-center gap-2">
              <Badge tone="brand">Projects</Badge>
              <span className="text-[11px] text-slate-400">
                {fairProjects.length} project{fairProjects.length === 1 ? "" : "s"}
              </span>
            </div>
            {fairProjects.length === 0 ? (
              <p className="px-1 text-xs text-slate-400">No fair projects yet.</p>
            ) : (
              <div className="space-y-1.5">
                {fairProjects.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2"
                  >
                    <FileText size={14} className="shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                      {p.title}
                    </span>
                    {p.fileId && (
                      <a
                        href={fileDownloadUrl(p.fileId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        title="View PDF"
                      >
                        <Eye size={13} /> View
                      </a>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => removeFairProject(p.id)}>
                      <Trash2 size={12} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Delete confirmation — deleting a lesson PDF removes the whole lesson. */}
      <Modal
        open={deletingFile !== null}
        onClose={() => setDeletingFile(null)}
        title="Delete lesson"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeletingFile(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDeleteFile} disabled={deleteBusy}>
              {deleteBusy ? "Deleting…" : "Delete lesson"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Delete{" "}
          <span className="font-medium text-slate-900">{deletingFile?.filename}</span>? This removes
          the lesson from every teacher and Access Control, along with their progress on it. This
          cannot be undone.
        </p>
      </Modal>

      {/* Bulk delete confirmation */}
      <Modal
        open={bulkConfirm}
        onClose={() => setBulkConfirm(false)}
        title="Delete selected lessons"
        footer={
          <>
            <Button variant="secondary" onClick={() => setBulkConfirm(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmBulkDelete} disabled={bulkBusy}>
              {bulkBusy ? "Deleting…" : `Delete ${selectedCount}`}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Delete <span className="font-medium text-slate-900">{selectedCount}</span> selected
          lesson{selectedCount === 1 ? "" : "s"}? Each is removed from every teacher and Access
          Control, along with their progress. This cannot be undone.
        </p>
      </Modal>
    </>
  );
}
