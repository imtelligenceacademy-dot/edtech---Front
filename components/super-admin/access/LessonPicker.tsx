"use client";

import { ChevronRight, Search, Trash2, X } from "lucide-react";
import { CardBody, CardHeader } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import {
  EMPTY_LESSON_FILTERS,
  filtersActive,
  groupByTrack,
  yearOf,
  type LessonFilters,
} from "@/lib/super-admin/access";
import type { Lesson } from "@/types";

function TriBox({
  state,
  label,
  onChange,
  className,
}: {
  state: "all" | "some" | "none";
  label: string;
  onChange: (next: boolean) => void;
  className?: string;
}) {
  return (
    <input
      type="checkbox"
      checked={state === "all"}
      readOnly
      ref={(el) => {
        if (el) el.indeterminate = state === "some";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onChange(state !== "all");
      }}
      aria-label={label}
      title={label}
      className={cn(
        "h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-brand focus:ring-brand",
        className
      )}
    />
  );
}

function stateOf(ids: string[], selected: Set<string>): "all" | "some" | "none" {
  if (ids.length === 0) return "none";
  const hit = ids.filter((id) => selected.has(id)).length;
  if (hit === 0) return "none";
  return hit === ids.length ? "all" : "some";
}

/**
 * Column 1. Same browser as before, except lessons are now picked as a set:
 * a checkbox per row, one per grade, one for everything the filters left, and
 * shift-click for a run. Whatever is ticked here is what column 3 edits.
 */
export function LessonPicker({
  lessons,
  filters,
  onFilters,
  selected,
  onToggleLesson,
  onToggleMany,
  collapsed,
  onToggleCollapse,
  onDeleteLesson,
  total,
  allLessons,
}: {
  lessons: Lesson[];
  /** Everything, before filtering — the year tabs count against this so they
      keep their numbers when a search narrows the list. */
  allLessons: Lesson[];
  filters: LessonFilters;
  onFilters: (next: LessonFilters) => void;
  selected: Set<string>;
  onToggleLesson: (id: string, shiftKey: boolean, list: string[]) => void;
  onToggleMany: (ids: string[], next: boolean) => void;
  collapsed: Set<string>;
  onToggleCollapse: (key: string) => void;
  onDeleteLesson: (lesson: Lesson) => void;
  total: number;
}) {
  const groups = groupByTrack(lessons);
  const shownIds = lessons.map((l) => l.id);
  const allGrades = Array.from(new Set(groups.map((g) => g.grade))).sort((a, b) => a - b);
  const active = filtersActive(filters);

  const gradeCounts = new Map<number, number>();
  for (const g of groups) gradeCounts.set(g.grade, (gradeCounts.get(g.grade) ?? 0) + g.lessons.length);

  // Year 1 and Year 2 are different curricula, so this is the first cut, above
  // grade. Counts come from the unfiltered list: a tab that reads "0" while
  // you have a search running would look like the year is empty rather than
  // like the search is.
  const yearCounts = new Map<number, number>();
  for (const l of allLessons) yearCounts.set(yearOf(l), (yearCounts.get(yearOf(l)) ?? 0) + 1);
  const years = Array.from(yearCounts.keys()).sort((a, b) => a - b);

  return (
    <>
      <CardHeader
        title="1. Lessons"
        subtitle={
          selected.size > 0
            ? `${selected.size} selected · ${lessons.length} of ${total} shown`
            : `${lessons.length} of ${total} shown — tick the ones to edit`
        }
      />
      <CardBody className="space-y-3">
        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={filters.query}
            onChange={(e) => onFilters({ ...filters, query: e.target.value })}
            placeholder="Search lessons — “7 buzzer”, “python”…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-8 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          {filters.query && (
            <button
              onClick={() => onFilters({ ...filters, query: "" })}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Year first. The two curricula share grade numbers and share
            nothing else, so mixing them puts two different "Grade 7 Lesson 1"
            rows next to each other. */}
        {years.length > 1 && (
          <div className="flex gap-1 rounded-lg border border-slate-200 p-0.5">
            <button
              onClick={() => onFilters({ ...filters, year: "all", grade: "all" })}
              className={cn(
                "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                filters.year === "all"
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              Both years
            </button>
            {years.map((y) => (
              <button
                key={y}
                // Grade resets with the year: a grade chip from the other
                // curriculum would leave the list empty for no visible reason.
                onClick={() => onFilters({ ...filters, year: y, grade: "all" })}
                className={cn(
                  "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                  filters.year === y
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                Year {y}
                <span className="ml-1 text-[10px] text-slate-400">{yearCounts.get(y)}</span>
              </button>
            ))}
          </div>
        )}

        {/* Grade rail — wraps instead of hiding grades behind a scrollbar. */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => onFilters({ ...filters, grade: "all" })}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filters.grade === "all"
                ? "border-brand bg-brand-50 text-brand-700"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            )}
          >
            All
          </button>
          {allGrades.map((g) => (
            <button
              key={g}
              onClick={() => onFilters({ ...filters, grade: g })}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filters.grade === g
                  ? "border-brand bg-brand-50 text-brand-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              )}
            >
              G{g}
              <span className="ml-1 text-[10px] text-slate-400">{gradeCounts.get(g)}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex flex-1 gap-1 rounded-lg border border-slate-200 p-0.5">
            {["all", "en", "fr"].map((l) => (
              <button
                key={l}
                onClick={() => onFilters({ ...filters, lang: l })}
                className={cn(
                  "flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  filters.lang === l
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                {l === "all" ? "All" : l.toUpperCase()}
              </button>
            ))}
          </div>
          {active && (
            <button
              onClick={() => onFilters(EMPTY_LESSON_FILTERS)}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-brand-700"
            >
              <X size={12} /> Clear
            </button>
          )}
        </div>

        {/* Select-all for exactly what the filters left on screen. */}
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
          <TriBox
            state={stateOf(shownIds, selected)}
            label={`Select all ${shownIds.length} shown lessons`}
            onChange={(next) => onToggleMany(shownIds, next)}
          />
          <span className="text-xs font-medium text-slate-700">
            {active ? `Select all ${shownIds.length} shown` : "Select all"}
          </span>
          {selected.size > 0 && (
            <button
              onClick={() => onToggleMany(Array.from(selected), false)}
              className="ml-auto text-xs text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
            >
              Clear selection
            </button>
          )}
        </div>

        <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-0.5">
          {groups.length === 0 && (
            <p className="py-6 text-center text-xs text-slate-500">
              No lessons match your filters.
            </p>
          )}
          {groups.map(({ key, year, grade, lessons: groupLessons }) => {
            const isCollapsed = collapsed.has(key);
            const ids = groupLessons.map((l) => l.id);
            return (
              <div key={key}>
                <div className="sticky top-0 z-10 flex items-center gap-2 bg-white/95 py-1 backdrop-blur">
                  <TriBox
                    state={stateOf(ids, selected)}
                    label={`Select every Year ${year} Grade ${grade} lesson`}
                    onChange={(next) => onToggleMany(ids, next)}
                  />
                  <button
                    onClick={() => onToggleCollapse(key)}
                    className="flex flex-1 items-center gap-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                  >
                    <ChevronRight
                      size={13}
                      className={cn("transition-transform", !isCollapsed && "rotate-90")}
                    />
                    <span className="text-brand-700">Year {year}</span>
                    <span className="text-slate-300">·</span>
                    Grade {grade}
                    <span className="text-slate-400">({groupLessons.length})</span>
                  </button>
                </div>
                {!isCollapsed && (
                  <div className="mt-1 space-y-1.5">
                    {groupLessons.map((l) => {
                      const on = selected.has(l.id);
                      return (
                        <div
                          key={l.id}
                          className={cn(
                            "group flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors",
                            on
                              ? "border-brand bg-brand-50"
                              : "border-slate-200 hover:bg-slate-50"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            readOnly
                            // onClick carries shiftKey, which is how a run of
                            // lessons gets picked in two clicks.
                            onClick={(e) => onToggleLesson(l.id, e.shiftKey, ids)}
                            aria-label={`Select ${l.title}`}
                            className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-brand focus:ring-brand"
                          />
                          <button
                            onClick={(e) => onToggleLesson(l.id, e.shiftKey, ids)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <span className="block truncate text-sm font-medium text-slate-900">
                              {l.title}
                            </span>
                            <span className="block text-xs text-slate-500">
                              Year {yearOf(l)} · Grade {l.grade}
                              {l.language ? ` · ${l.language.toUpperCase()}` : ""} ·{" "}
                              {l.assignedTeacherIds.length} teacher
                              {l.assignedTeacherIds.length === 1 ? "" : "s"}
                            </span>
                          </button>
                          <button
                            onClick={() => onDeleteLesson(l)}
                            title="Delete lesson"
                            aria-label={`Delete ${l.title}`}
                            className="shrink-0 rounded-md p-1.5 text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100 max-md:opacity-100"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardBody>
    </>
  );
}
