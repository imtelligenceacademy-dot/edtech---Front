"use client";

import {
  ChevronsDownUp,
  ChevronsUpDown,
  Download,
  Loader2,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  EMPTY_FILTERS,
  GRADES,
  YEARS,
  hasActiveFilters,
  type Filters,
  type Lang,
  type SelectionState,
} from "@/lib/super-admin/files";

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T | "all";
  options: [T, string][];
  onChange: (next: T | "all") => void;
}) {
  return (
    <div className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
      {([["all", "All"], ...options] as [T | "all", string][]).map(([code, label]) => (
        <button
          key={String(code)}
          type="button"
          onClick={() => onChange(code)}
          className={cn(
            "rounded-md px-2.5 py-1 font-medium transition-colors",
            value === code
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:text-slate-900"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * The one place that acts on many files at once: narrow the list down, then do
 * something to what's left. Search and the filters drive what the tree shows;
 * "Select all" then covers exactly that, so "delete every French Grade 4 file"
 * is three clicks rather than twelve checkboxes.
 */
export function FilesToolbar({
  filters,
  onFilters,
  shown,
  total,
  selectedCount,
  shownState,
  onToggleShown,
  onClearSelection,
  onDownloadSelected,
  onDeleteSelected,
  onExpandAll,
  onCollapseAll,
  downloadingSelection,
}: {
  filters: Filters;
  onFilters: (next: Filters) => void;
  shown: number;
  total: number;
  selectedCount: number;
  shownState: SelectionState;
  onToggleShown: (next: boolean) => void;
  onClearSelection: () => void;
  onDownloadSelected: () => void;
  onDeleteSelected: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  downloadingSelection: boolean;
}) {
  const filtered = hasActiveFilters(filters);

  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <div className="relative min-w-[200px] flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={filters.search}
            onChange={(e) => onFilters({ ...filters, search: e.target.value })}
            placeholder="Search lessons — “7 buzzer”, “python”, “feu”…"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => onFilters({ ...filters, search: "" })}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <Segmented
          value={filters.year}
          options={YEARS.map((y) => [y, `Year ${y}`] as [number, string])}
          onChange={(year) => onFilters({ ...filters, year })}
        />
        <select
          value={filters.grade}
          onChange={(e) =>
            onFilters({
              ...filters,
              grade: e.target.value === "all" ? "all" : Number(e.target.value),
            })
          }
          className="h-8 shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 focus:border-brand focus:outline-none"
        >
          <option value="all">All grades</option>
          {GRADES.map((g) => (
            <option key={g} value={g}>
              Grade {g}
            </option>
          ))}
        </select>
        <Segmented
          value={filters.lang}
          options={[
            ["en", "EN"],
            ["fr", "FR"],
          ] as [Lang, string][]}
          onChange={(lang) => onFilters({ ...filters, lang })}
        />

        {filtered && (
          <button
            type="button"
            onClick={() => onFilters(EMPTY_FILTERS)}
            className="shrink-0 text-xs text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
          >
            Reset
          </button>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onExpandAll}
            title="Open every folder"
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <ChevronsUpDown size={15} />
          </button>
          <button
            type="button"
            onClick={onCollapseAll}
            title="Close every folder"
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <ChevronsDownUp size={15} />
          </button>
        </div>
      </div>

      {/* Selection strip — what you picked, and the two things you can do to it. */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-3 border-t px-3 py-2 transition-colors",
          selectedCount > 0 ? "border-brand-100 bg-brand-50" : "border-slate-100 bg-slate-50/70"
        )}
      >
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
          <input
            type="checkbox"
            checked={shownState === "all"}
            readOnly
            ref={(el) => {
              if (el) el.indeterminate = shownState === "some";
            }}
            onClick={() => onToggleShown(shownState !== "all")}
            className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
          />
          {filtered ? `Select all ${shown} shown` : "Select all"}
        </label>

        <span className="text-xs text-slate-500">
          {selectedCount > 0 ? (
            <span className="font-medium text-brand-700">{selectedCount} selected</span>
          ) : filtered ? (
            `${shown} of ${total} files`
          ) : (
            `${total} files`
          )}
        </span>

        {selectedCount > 0 && (
          <button
            type="button"
            onClick={onClearSelection}
            className="text-xs text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
          >
            Clear
          </button>
        )}

        <span className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={selectedCount === 0 || downloadingSelection}
            onClick={onDownloadSelected}
          >
            {downloadingSelection ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Download size={13} />
            )}
            Download{selectedCount > 0 ? ` (${selectedCount})` : ""}
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={selectedCount === 0}
            onClick={onDeleteSelected}
          >
            <Trash2 size={13} /> Delete{selectedCount > 0 ? ` (${selectedCount})` : ""}
          </Button>
        </span>
      </div>
    </div>
  );
}
