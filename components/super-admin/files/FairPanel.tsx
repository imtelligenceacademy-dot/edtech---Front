"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  Download,
  Eye,
  FileText,
  FolderPlus,
  Loader2,
  Pencil,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { GRADE_OPTIONS, gradeLabel } from "@/lib/grades";
import {
  createFairSection,
  deleteFairProject,
  deleteFairSection,
  downloadFileSelection,
  downloadLessonPdf,
  fileDownloadUrl,
  listFairSections,
  listSchools,
  listUnfiledFairProjects,
  updateFairProject,
  updateFairSection,
  uploadFairProject,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type { FairProject, FairSection, School } from "@/types";

// ICT Fair management.
//
// Schools do not share fair projects — each runs its own — so the school comes
// first and everything else hangs off it. There is deliberately no way to
// upload a project without choosing a school and a section: an upload with no
// section belongs to no school, and a project nobody's teachers can see is not
// a useful thing to be able to create by accident.

const MAX_MB = 20;

export function FairPanel() {
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [sections, setSections] = useState<FairSection[]>([]);
  const [unfiled, setUnfiled] = useState<FairProject[]>([]);

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(
    null
  );
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    listSchools()
      .then((rows) => {
        setSchools(rows);
        // One school is not a choice; land on it.
        if (rows.length === 1) setSchoolId(rows[0].id);
      })
      .catch(() => setMessage({ tone: "error", text: "Couldn't load schools." }))
      .finally(() => setLoading(false));
  }, []);

  const refresh = useCallback(async () => {
    if (!schoolId) {
      setSections([]);
      return;
    }
    try {
      const [rows, loose] = await Promise.all([
        listFairSections(schoolId),
        listUnfiledFairProjects(),
      ]);
      setSections(rows);
      setUnfiled(loose);
    } catch (err) {
      setMessage({
        tone: "error",
        text: err instanceof Error ? err.message : "Couldn't load sections.",
      });
    }
  }, [schoolId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function addSection(input: {
    title: string;
    blurb: string;
    grades: string[];
  }) {
    setCreating(true);
    try {
      await createFairSection({
        schoolId,
        title: input.title,
        blurb: input.blurb || null,
        grades: input.grades,
      });
      await refresh();
      setMessage({ tone: "ok", text: `Section "${input.title}" created.` });
      return true;
    } catch (err) {
      setMessage({
        tone: "error",
        text: err instanceof Error ? err.message : "Couldn't create the section.",
      });
      return false;
    } finally {
      setCreating(false);
    }
  }

  const school = schools.find((s) => s.id === schoolId) ?? null;
  const allFileIds = sections
    .flatMap((s) => s.projects.map((p) => p.fileId))
    .filter((id): id is string => Boolean(id));

  return (
    <Card className="mt-4">
      <CardHeader
        title="ICT Fair"
        subtitle="Project PDFs, grouped into sections. Each school runs its own fair, so pick the school first."
        action={
          allFileIds.length > 0 ? (
            <DownloadAll fileIds={allFileIds} school={school} />
          ) : undefined
        }
      />
      <CardBody>
        <label className="text-xs font-medium text-slate-700" htmlFor="fair-school">
          School
        </label>
        <select
          id="fair-school"
          value={schoolId}
          onChange={(e) => {
            setSchoolId(e.target.value);
            setMessage(null);
          }}
          disabled={loading}
          className="mt-1 h-10 w-full max-w-sm rounded-lg border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <option value="">
            {loading ? "Loading schools…" : "Choose a school…"}
          </option>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        {message && (
          <p
            role="status"
            className={cn(
              "mt-3 flex items-start gap-1.5 text-xs",
              message.tone === "error" ? "text-red-700" : "text-slate-600"
            )}
          >
            {message.tone === "error" && (
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
            )}
            {message.text}
          </p>
        )}

        {!schoolId ? (
          <p className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            {schools.length === 0 && !loading
              ? "No schools yet. Create one before adding fair projects."
              : "Pick a school to manage its ICT Fair sections."}
          </p>
        ) : (
          <>
            <div className="mt-5 space-y-3">
              {sections.map((section) => (
                <SectionRow
                  key={section.id}
                  section={section}
                  onChanged={refresh}
                  onError={(text) => setMessage({ tone: "error", text })}
                  onOk={(text) => setMessage({ tone: "ok", text })}
                />
              ))}
              {sections.length === 0 && (
                <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-xs text-slate-500">
                  No sections for {school?.name} yet. Create one below, then
                  upload its projects.
                </p>
              )}
            </div>

            <NewSectionForm busy={creating} onCreate={addSection} />

            {unfiled.length > 0 && (
              <UnfiledProjects
                projects={unfiled}
                sections={sections}
                onChanged={refresh}
                onError={(text) => setMessage({ tone: "error", text })}
              />
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

function DownloadAll({
  fileIds,
  school,
}: {
  fileIds: string[];
  school: School | null;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await downloadFileSelection(
            fileIds,
            `ict-fair-${school?.name ?? "all"}`.replace(/\s+/g, "-").toLowerCase()
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
      Download all
    </Button>
  );
}

// --- One section ------------------------------------------------------------ #

function SectionRow({
  section,
  onChanged,
  onError,
  onOk,
}: {
  section: FairSection;
  onChanged: () => Promise<void>;
  onError: (text: string) => void;
  onOk: (text: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(files?: FileList | null) {
    if (!files?.length) return;
    const pdfs = Array.from(files).filter(
      (f) => f.name.toLowerCase().endsWith(".pdf") && f.size <= MAX_MB * 1024 * 1024
    );
    if (pdfs.length === 0) {
      onError(`No valid PDF (max ${MAX_MB} MB) selected.`);
      return;
    }
    setBusy(true);
    let ok = 0;
    const failed: string[] = [];
    for (const file of pdfs) {
      try {
        await uploadFairProject(file, section.id);
        ok += 1;
      } catch {
        failed.push(file.name);
      }
    }
    await onChanged();
    setBusy(false);
    if (failed.length) {
      onError(`${failed.length} upload${failed.length === 1 ? "" : "s"} failed: ${failed.join(", ")}`);
    } else {
      onOk(`${ok} project${ok === 1 ? "" : "s"} added to "${section.title}".`);
    }
  }

  async function removeSection() {
    setBusy(true);
    try {
      await deleteFairSection(section.id);
      await onChanged();
      onOk(`Section "${section.title}" deleted.`);
    } catch (err) {
      // The server refuses while the section still holds projects, and says how
      // many. Surfacing its message beats inventing a vaguer one here.
      onError(err instanceof Error ? err.message : "Couldn't delete the section.");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <SectionForm
        initial={{
          title: section.title,
          blurb: section.blurb ?? "",
          grades: section.grades,
        }}
        submitLabel="Save"
        busy={busy}
        onCancel={() => setEditing(false)}
        onSubmit={async (values) => {
          setBusy(true);
          try {
            await updateFairSection(section.id, {
              title: values.title,
              blurb: values.blurb || null,
              grades: values.grades,
            });
            await onChanged();
            setEditing(false);
            return true;
          } catch (err) {
            onError(err instanceof Error ? err.message : "Couldn't save the section.");
            return false;
          } finally {
            setBusy(false);
          }
        }}
      />
    );
  }

  return (
    <div
      className="overflow-hidden rounded-lg border border-slate-200"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void upload(e.dataTransfer.files);
      }}
    >
      <div className="flex flex-wrap items-center gap-2 bg-slate-50 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronDown
            size={14}
            className={cn("shrink-0 text-slate-400 transition-transform", !open && "-rotate-90")}
          />
          <span className="truncate text-[13px] font-semibold text-slate-900">
            {section.title}
          </span>
          <span className="flex flex-wrap gap-1">
            {section.grades.length > 0 ? (
              section.grades.map((g) => (
                <span
                  key={g}
                  className="rounded border border-brand-100 bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700"
                >
                  {gradeLabel(g)}
                </span>
              ))
            ) : (
              <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                No grades set
              </span>
            )}
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-slate-500">
            {section.projects.length} project
            {section.projects.length === 1 ? "" : "s"}
          </span>
        </button>

        <span className="flex shrink-0 items-center gap-0.5">
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            multiple
            className="sr-only"
            onChange={(e) => {
              void upload(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            title={`Upload PDFs into "${section.title}"`}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <UploadCloud size={14} />
            )}
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Edit this section"
            className="rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={removeSection}
            disabled={busy}
            title="Delete this section"
            className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          >
            <Trash2 size={14} />
          </button>
        </span>
      </div>

      {section.blurb && open && (
        <p className="border-b border-slate-100 px-3 py-1.5 text-[11px] text-slate-500">
          {section.blurb}
        </p>
      )}

      {open && (
        <div className="divide-y divide-slate-100">
          {section.projects.length === 0 ? (
            <p className="px-3 py-5 text-center text-[11px] text-slate-400">
              No projects yet — drop PDFs here or use the upload button.
            </p>
          ) : (
            section.projects.map((p) => (
              <ProjectRow key={p.id} project={p} onChanged={onChanged} onError={onError} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ProjectRow({
  project,
  onChanged,
  onError,
}: {
  project: FairProject;
  onChanged: () => Promise<void>;
  onError: (text: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <div className="group flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50">
      <FileText size={14} className="shrink-0 text-slate-400" />
      <span className="min-w-0 flex-1 truncate text-[13px] text-slate-800">
        {project.title}
      </span>
      <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
        {project.fileId && (
          <>
            <a
              href={fileDownloadUrl(project.fileId)}
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
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await downloadLessonPdf(project.fileId!, `${project.title}.pdf`);
                } finally {
                  setBusy(false);
                }
              }}
              className="rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900 disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            </button>
          </>
        )}
        <button
          type="button"
          title="Delete this project"
          onClick={async () => {
            try {
              await deleteFairProject(project.id);
              await onChanged();
            } catch (err) {
              onError(err instanceof Error ? err.message : "Couldn't delete the project.");
            }
          }}
          className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 size={14} />
        </button>
      </span>
    </div>
  );
}

// --- Creating and editing a section ----------------------------------------- #

function NewSectionForm({
  busy,
  onCreate,
}: {
  busy: boolean;
  onCreate: (v: { title: string; blurb: string; grades: string[] }) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button
        size="sm"
        variant="secondary"
        className="mt-3"
        onClick={() => setOpen(true)}
      >
        <FolderPlus size={14} /> New section
      </Button>
    );
  }

  return (
    <div className="mt-3">
      <SectionForm
        initial={{ title: "", blurb: "", grades: [] }}
        submitLabel="Create section"
        busy={busy}
        onCancel={() => setOpen(false)}
        onSubmit={async (values) => {
          const ok = await onCreate(values);
          if (ok) setOpen(false);
          return ok;
        }}
      />
    </div>
  );
}

function SectionForm({
  initial,
  submitLabel,
  busy,
  onCancel,
  onSubmit,
}: {
  initial: { title: string; blurb: string; grades: string[] };
  submitLabel: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (v: { title: string; blurb: string; grades: string[] }) => Promise<boolean>;
}) {
  const [title, setTitle] = useState(initial.title);
  const [blurb, setBlurb] = useState(initial.blurb);
  const [grades, setGrades] = useState<string[]>(initial.grades);

  function toggleGrade(code: string) {
    setGrades((prev) =>
      prev.includes(code) ? prev.filter((g) => g !== code) : [...prev, code]
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        await onSubmit({ title: title.trim(), blurb: blurb.trim(), grades });
      }}
      className="rounded-lg border border-brand-100 bg-brand-50/40 p-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-slate-700">Section name</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={120}
            placeholder="e.g. Smart Home"
            className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-700">
            Description <span className="font-normal text-slate-400">(optional)</span>
          </span>
          <input
            value={blurb}
            onChange={(e) => setBlurb(e.target.value)}
            maxLength={300}
            placeholder="One line teachers will see under the name"
            className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </label>
      </div>

      <fieldset className="mt-3">
        <legend className="text-xs font-medium text-slate-700">
          Grades{" "}
          <span className="font-normal text-slate-500">
            — a section can cover several
          </span>
        </legend>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {GRADE_OPTIONS.map((g) => {
            const on = grades.includes(g.code);
            return (
              <button
                key={g.code}
                type="button"
                onClick={() => toggleGrade(g.code)}
                aria-pressed={on}
                className={cn(
                  "rounded-md border px-2 py-1 text-[11px] font-medium transition",
                  on
                    ? "border-brand bg-brand text-white"
                    : "border-slate-300 bg-white text-slate-600 hover:border-brand/40"
                )}
              >
                {g.short}
              </button>
            );
          })}
        </div>
        {grades.length === 0 && (
          <p className="mt-1.5 text-[11px] text-amber-700">
            No grades selected — teachers won&apos;t be able to filter this
            section to their own grades.
          </p>
        )}
      </fieldset>

      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" type="submit" disabled={busy || !title.trim()}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : null}
          {submitLabel}
        </Button>
        <Button size="sm" type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// --- Projects with no section ----------------------------------------------- #

function UnfiledProjects({
  projects,
  sections,
  onChanged,
  onError,
}: {
  projects: FairProject[];
  sections: FairSection[];
  onChanged: () => Promise<void>;
  onError: (text: string) => void;
}) {
  return (
    <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
      <p className="text-xs font-semibold text-amber-900">
        {projects.length} project{projects.length === 1 ? "" : "s"} not in any
        section
      </p>
      <p className="mt-0.5 text-[11px] text-amber-800">
        These were uploaded before sections existed. They belong to no school, so
        no teacher can see them until they are filed.
      </p>
      <div className="mt-2 space-y-1">
        {projects.map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center gap-2 rounded border border-amber-200 bg-white px-2.5 py-1.5"
          >
            <FileText size={13} className="shrink-0 text-slate-400" />
            <span className="min-w-0 flex-1 truncate text-[12px] text-slate-800">
              {p.title}
            </span>
            <select
              defaultValue=""
              disabled={sections.length === 0}
              onChange={async (e) => {
                const sectionId = e.target.value;
                if (!sectionId) return;
                try {
                  await updateFairProject(p.id, { sectionId });
                  await onChanged();
                } catch (err) {
                  onError(err instanceof Error ? err.message : "Couldn't file it.");
                }
              }}
              className="h-8 rounded border border-slate-300 bg-white px-2 text-[11px] focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="">
                {sections.length === 0 ? "Create a section first" : "File into…"}
              </option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
