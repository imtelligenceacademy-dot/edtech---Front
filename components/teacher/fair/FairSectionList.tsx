"use client";

import { FileText, FolderOpen, Presentation, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  matchesQuery,
  projectTitle,
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
//
// There is no "my grades / all grades" choice here any more. The server sends a
// teacher the sections for the grades she teaches and nothing else, so there is
// nothing for such a control to reveal — and offering it implied the rest were
// hers to look at, which was the bug.

export function FairSectionList({
  sections,
  query,
  onQuery,
  onOpen,
}: {
  sections: FairSection[];
  query: string;
  onQuery: (value: string) => void;
  onOpen: (project: FairProject) => void;
}) {
  const ordered = sortSections(sections);
  const shown = ordered.filter((s) => matchesQuery(s, query));

  return (
    <div className="mx-auto w-full max-w-5xl pb-10">
      <Header
        sections={ordered}
        shown={shown}
        query={query}
        onQuery={onQuery}
      />

      {shown.length === 0 ? (
        <EmptyState
          query={query}
          hasAny={ordered.length > 0}
          onClear={() => onQuery("")}
        />
      ) : (
        <div className="mt-6 space-y-5">
          {shown.map((section) => (
            <SectionBand
              key={section.id}
              section={section}
              query={query}
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
}: {
  sections: FairSection[];
  shown: FairSection[];
  query: string;
  onQuery: (v: string) => void;
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
      </div>
    </div>
  );
}

function SectionBand({
  section,
  query,
  onOpen,
}: {
  section: FairSection;
  query: string;
  onOpen: (project: FairProject) => void;
}) {
  const projects = visibleProjects(section, query);
  const grades = sectionGradeLabels(section);
  // Every section on this screen is one of the teacher's own now, so there is
  // no "not yours" state left to dim.

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">{section.title}</h2>
            {grades.length > 0 ? (
              <span className="flex flex-wrap gap-1">
                {grades.map((g) => (
                  <span
                    key={g}
                    className="rounded-md border border-brand-100 bg-brand-50 px-1.5 py-0.5 text-[11px] font-medium text-brand-700"
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
        {/* break-words as well as the spaces: a project genuinely named as one
            long word still has to wrap rather than run out of its card and lose
            its own ending. */}
        <span
          className={cn(
            "block break-words text-sm font-medium leading-snug",
            ready ? "text-slate-900" : "text-slate-400"
          )}
        >
          {projectTitle(project)}
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
  hasAny,
  onClear,
}: {
  query: string;
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
            {query ? "Nothing matches that search." : "Nothing to show."}
          </p>
          <button
            onClick={onClear}
            className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Clear search
          </button>
        </>
      )}
    </div>
  );
}
