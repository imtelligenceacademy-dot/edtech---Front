"use client";

import { FileText, FolderOpen, Presentation, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  matchesQuery,
  matchesTeacherGrades,
  sectionGradeLabels,
  sortSections,
  visibleProjects,
} from "@/lib/teacher/fair-sections";
import type { FairProject, FairSection } from "@/types";

// The ICT Fair, grouped into sections.
//
// One band per section, in curriculum order, each headed by the grades it is
// for. A teacher scanning for their own grade reads down the left edge and
// stops — which is the whole point, and the thing a flat grid cannot do.
//
// Grades are shown as chips on the section header rather than on every project
// card. Repeating "G7" on each of four cards is noise; the section already said
// it once.

export function FairSectionList({
  sections,
  query,
  onQuery,
  scope,
  onScope,
  teacherGrades,
  onOpen,
}: {
  sections: FairSection[];
  query: string;
  onQuery: (value: string) => void;
  scope: "mine" | "all";
  onScope: (value: "mine" | "all") => void;
  teacherGrades: string[];
  onOpen: (project: FairProject) => void;
}) {
  const ordered = sortSections(sections);
  const inScope =
    scope === "mine"
      ? ordered.filter((s) => matchesTeacherGrades(s, teacherGrades))
      : ordered;
  const shown = inScope.filter((s) => matchesQuery(s, query));
  const hiddenByScope = ordered.length - inScope.length;

  return (
    <div className="mx-auto w-full max-w-5xl pb-10">
      <Header
        sections={ordered}
        shown={shown}
        query={query}
        onQuery={onQuery}
        scope={scope}
        onScope={onScope}
        teacherGrades={teacherGrades}
        hiddenByScope={hiddenByScope}
      />

      {shown.length === 0 ? (
        <EmptyState
          query={query}
          scope={scope}
          hasAny={ordered.length > 0}
          onClear={() => {
            onQuery("");
            onScope("all");
          }}
        />
      ) : (
        <div className="mt-6 space-y-5">
          {shown.map((section) => (
            <SectionBand
              key={section.id}
              section={section}
              query={query}
              teacherGrades={teacherGrades}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Header({
  sections,
  shown,
  query,
  onQuery,
  scope,
  onScope,
  teacherGrades,
  hiddenByScope,
}: {
  sections: FairSection[];
  shown: FairSection[];
  query: string;
  onQuery: (v: string) => void;
  scope: "mine" | "all";
  onScope: (v: "mine" | "all") => void;
  teacherGrades: string[];
  hiddenByScope: number;
}) {
  const total = sections.reduce((n, s) => n + s.projects.length, 0);
  // Counted through the same function the bands render with. Summing
  // `s.projects.length` here instead would report every project of a section
  // that matched on one project title, and the header would disagree with what
  // is on the screen underneath it.
  const showing = shown.reduce((n, s) => n + visibleProjects(s, query).length, 0);
  const filtered = showing !== total;

  return (
    <div className="border-b border-slate-200 pb-5">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 via-brand to-brand-800 text-white shadow-lg shadow-brand/30">
          <Presentation size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
            ICT Fair projects
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {/* Counts, not adjectives — the same rule as the usage screen. */}
            {filtered ? (
              <>
                Showing{" "}
                <span className="font-medium text-slate-900">{showing}</span> of{" "}
                {total} project{total === 1 ? "" : "s"}
              </>
            ) : (
              <>
                <span className="font-medium text-slate-900">{total}</span> project
                {total === 1 ? "" : "s"} across {sections.length} section
                {sections.length === 1 ? "" : "s"}
              </>
            )}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search a section, grade or project…"
            aria-label="Search ICT Fair projects"
            // text-base below sm: iOS zooms the page in on a focused field
            // under 16px and does not zoom back out. Same as the composer.
            className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand sm:text-sm"
          />
        </div>

        {/* Only worth offering when the teacher has grades to narrow to. */}
        {teacherGrades.length > 0 && (
          <div
            role="group"
            aria-label="Which sections to show"
            className="flex shrink-0 rounded-lg border border-slate-300 bg-white p-0.5"
          >
            <ScopeTab active={scope === "mine"} onClick={() => onScope("mine")}>
              My grades
            </ScopeTab>
            <ScopeTab active={scope === "all"} onClick={() => onScope("all")}>
              All grades
            </ScopeTab>
          </div>
        )}
      </div>

      {scope === "mine" && hiddenByScope > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          {hiddenByScope} section{hiddenByScope === 1 ? "" : "s"} for other grades{" "}
          {hiddenByScope === 1 ? "is" : "are"} hidden.{" "}
          <button
            onClick={() => onScope("all")}
            className="relative font-medium text-brand-700 underline underline-offset-2 after:absolute after:-inset-x-1 after:-inset-y-3 after:content-[''] hover:text-brand-800"
          >
            Show all grades
          </button>
        </p>
      )}
    </div>
  );
}

function ScopeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      // Touch area only: the tab keeps its size, the pseudo-element takes it to
      // 44px so the two sit apart under a thumb.
      className={cn(
        "relative rounded-md px-3 py-1.5 text-xs font-medium transition after:absolute after:-inset-y-2 after:inset-x-0 after:content-['']",
        active
          ? "bg-brand text-white shadow-sm"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      )}
    >
      {children}
    </button>
  );
}

function SectionBand({
  section,
  query,
  teacherGrades,
  onOpen,
}: {
  section: FairSection;
  query: string;
  teacherGrades: string[];
  onOpen: (project: FairProject) => void;
}) {
  const projects = visibleProjects(section, query);
  const grades = sectionGradeLabels(section);
  // In "all grades" view, a section outside the teacher's own grades is still
  // readable but visibly not theirs — dimming the chrome, never the titles.
  const isMine = matchesTeacherGrades(section, teacherGrades);

  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border bg-white shadow-sm",
        isMine ? "border-slate-200" : "border-slate-200/70 bg-slate-50/40"
      )}
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">{section.title}</h2>
            {grades.length > 0 ? (
              <span className="flex flex-wrap gap-1">
                {grades.map((g) => (
                  <span
                    key={g}
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
                      isMine
                        ? "border-brand-100 bg-brand-50 text-brand-700"
                        : "border-slate-200 bg-white text-slate-500"
                    )}
                  >
                    {g}
                  </span>
                ))}
              </span>
            ) : (
              <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
                No grade set
              </span>
            )}
          </div>
          {section.blurb && (
            <p className="mt-1 text-xs text-slate-500">{section.blurb}</p>
          )}
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-slate-500">
          {projects.length} project{projects.length === 1 ? "" : "s"}
        </span>
      </div>

      {projects.length === 0 ? (
        <p className="px-5 py-8 text-center text-xs text-slate-500">
          No project in this section matches your search.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} onOpen={onOpen} />
          ))}
        </div>
      )}
    </section>
  );
}

function ProjectCard({
  project,
  onOpen,
}: {
  project: FairProject;
  onOpen: (project: FairProject) => void;
}) {
  const ready = Boolean(project.fileId);
  return (
    <button
      onClick={() => ready && onOpen(project)}
      disabled={!ready}
      className={cn(
        "group flex h-full items-start gap-3 rounded-lg border p-3 text-left transition",
        ready
          ? "border-slate-200 bg-white hover:border-brand/40 hover:bg-brand-50/40 hover:shadow-sm"
          : "cursor-not-allowed border-dashed border-slate-200 bg-slate-50"
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition",
          ready
            ? "bg-slate-100 text-brand-600 group-hover:bg-brand group-hover:text-white"
            : "bg-slate-100 text-slate-400"
        )}
      >
        <FileText size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-sm font-medium leading-snug",
            ready ? "text-slate-900" : "text-slate-400"
          )}
        >
          {project.title}
        </span>
        <span
          className={cn(
            "mt-0.5 block text-[11px]",
            ready ? "text-slate-500" : "text-amber-700"
          )}
        >
          {ready ? "PDF · opens in the protected viewer" : "File missing"}
        </span>
      </span>
    </button>
  );
}

function EmptyState({
  query,
  scope,
  hasAny,
  onClear,
}: {
  query: string;
  scope: "mine" | "all";
  hasAny: boolean;
  onClear: () => void;
}) {
  return (
    <div className="mt-10 flex flex-col items-center rounded-xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center">
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
        <FolderOpen size={20} />
      </span>
      {!hasAny ? (
        <p className="text-sm text-slate-500">
          No ICT Fair projects have been shared yet.
        </p>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            {query
              ? "Nothing matches that search."
              : scope === "mine"
              ? "No sections for the grades you teach."
              : "Nothing to show."}
          </p>
          <button
            onClick={onClear}
            className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Clear search and show all grades
          </button>
        </>
      )}
    </div>
  );
}
