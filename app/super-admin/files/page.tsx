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
import {
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

  async function handleFiles(fileList?: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const all = Array.from(fileList);
    const pdfs = all.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    const oversize = pdfs.filter((f) => f.size > 20 * 1024 * 1024);
    const toUpload = pdfs.filter((f) => f.size <= 20 * 1024 * 1024);

    if (toUpload.length === 0) {
      setMessage({ tone: "error", text: "No valid PDF (≤20 MB) selected." });
      return;
    }

    setBusy(true);
    let created = 0;
    let totalAssigned = 0;
    let skipped = 0;
    const failed: string[] = [];

    for (let i = 0; i < toUpload.length; i++) {
      const file = toUpload[i];
      setMessage({
        tone: "info",
        text: `Uploading ${i + 1} of ${toUpload.length} — ${file.name}…`,
      });
      try {
        const result = await uploadFile(file, language, year);
        if (result.note) skipped += 1;
        else {
          created += 1;
          totalAssigned += result.assignedCount;
        }
      } catch {
        failed.push(file.name);
      }
    }

    await refresh();
    setBusy(false);

    const parts: string[] = [];
    if (created) parts.push(`${created} lesson${created === 1 ? "" : "s"} created`);
    if (totalAssigned) parts.push(`${totalAssigned} assignment${totalAssigned === 1 ? "" : "s"} made`);
    if (skipped) parts.push(`${skipped} skipped (bad name)`);
    if (oversize.length) parts.push(`${oversize.length} too large`);
    if (failed.length) parts.push(`${failed.length} failed`);
    setMessage({
      tone: failed.length ? "error" : "ok",
      text: parts.length ? parts.join(" · ") : "Nothing to upload.",
    });
  }

  async function removeFile(fileId: string) {
    await deleteUploadedFile(fileId);
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
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
    return (
      <div
        key={f.id}
        className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2"
      >
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
        <Button size="sm" variant="ghost" onClick={() => removeFile(f.id)}>
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
              handleFiles(e.dataTransfer.files);
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
                  handleFiles(e.target.files);
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
        </CardBody>
      </Card>

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
    </>
  );
}
