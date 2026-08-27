"use client";

import { ChevronRight, Download, Folder, FolderOpen, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import {
  idsOf,
  langLabel,
  selectionStateOf,
  type FileNode,
  type FileTree as Tree,
  type LangKey,
  type SelectionState,
} from "@/lib/super-admin/files";
import { FileRow } from "./FileRow";

export type TreeHandlers = {
  selected: Set<string>;
  /** Toggle one row; `shiftKey` extends from the last row touched in `list`. */
  onToggleFile: (id: string, shiftKey: boolean, list: string[]) => void;
  /** Select or clear a whole folder in one click. */
  onToggleGroup: (ids: string[], next: boolean) => void;
  onDownloadGroup: (ids: string[], label: string) => void;
  onDownloadFile: (node: FileNode) => void;
  onDeleteFile: (node: FileNode) => void;
  /** Key of whatever download is in flight, so only that button spins. */
  downloading: string | null;
  isOpen: (key: string) => boolean;
  onToggleOpen: (key: string) => void;
};

/** Tri-state checkbox: on when the whole folder is picked, dashed when part is. */
function GroupCheckbox({
  state,
  label,
  onChange,
}: {
  state: SelectionState;
  label: string;
  onChange: (next: boolean) => void;
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
      className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-brand focus:ring-brand"
    />
  );
}

function DownloadGroupButton({
  count,
  busy,
  onClick,
  what,
}: {
  count: number;
  busy: boolean;
  onClick: () => void;
  what: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={busy || count === 0}
      title={`Download ${what} as a zip (${count} PDF${count === 1 ? "" : "s"})`}
      className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40"
    >
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
      <span className="hidden sm:inline">Zip</span>
    </button>
  );
}

function counts(nodes: FileNode[]): string {
  const en = nodes.filter((n) => n.lang === "en").length;
  const fr = nodes.filter((n) => n.lang === "fr").length;
  return `${nodes.length} file${nodes.length === 1 ? "" : "s"} · ${en} EN · ${fr} FR`;
}

function FolderHeader({
  open,
  onToggleOpen,
  checkbox,
  title,
  meta,
  actions,
  className,
  iconSize = 16,
}: {
  open: boolean;
  onToggleOpen: () => void;
  checkbox: ReactNode;
  title: string;
  meta: string;
  actions: ReactNode;
  className?: string;
  iconSize?: number;
}) {
  return (
    <div className={cn("flex items-center gap-2.5 px-3", className)}>
      {checkbox}
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={open}
        className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left"
      >
        <ChevronRight
          size={14}
          className={cn("shrink-0 text-slate-400 transition-transform", open && "rotate-90")}
        />
        {open ? (
          <FolderOpen size={iconSize} className="shrink-0 text-brand-600" />
        ) : (
          <Folder size={iconSize} className="shrink-0 text-slate-400" />
        )}
        <span className="shrink-0 text-sm font-medium text-slate-900">{title}</span>
        <span className="truncate text-xs text-slate-500">{meta}</span>
      </button>
      {actions}
    </div>
  );
}

/** One language column inside a grade. */
function LangSection({
  lang,
  nodes,
  scopeLabel,
  h,
}: {
  lang: LangKey;
  nodes: FileNode[];
  scopeLabel: string;
  h: TreeHandlers;
}) {
  const ids = idsOf(nodes);
  const state = selectionStateOf(nodes, h.selected);
  const key = `${scopeLabel}-${lang}`;
  const tone = lang === "en" ? "info" : lang === "fr" ? "brand" : "muted";
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-2 px-1">
        <GroupCheckbox
          state={state}
          label={`Select every ${langLabel(lang)} file here`}
          onChange={(next) => h.onToggleGroup(ids, next)}
        />
        <Badge tone={tone}>{langLabel(lang)}</Badge>
        <span className="text-[11px] text-slate-400">{nodes.length}</span>
        <span className="ml-auto">
          <DownloadGroupButton
            count={nodes.length}
            busy={h.downloading === key}
            what={`these ${langLabel(lang)} files`}
            onClick={() => h.onDownloadGroup(ids, key)}
          />
        </span>
      </div>
      <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
        {nodes.map((node) => (
          <FileRow
            key={node.file.id}
            node={node}
            selected={h.selected.has(node.file.id)}
            downloading={h.downloading === node.file.id}
            onToggle={(shiftKey) => h.onToggleFile(node.file.id, shiftKey, ids)}
            onDownload={() => h.onDownloadFile(node)}
            onDelete={() => h.onDeleteFile(node)}
          />
        ))}
      </div>
    </div>
  );
}

export function FileTree({ tree, h }: { tree: Tree; h: TreeHandlers }) {
  if (tree.total === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-slate-400">
        Nothing matches those filters.
      </p>
    );
  }

  return (
    <div className="space-y-2 p-3">
      {tree.years.map((year) => {
        const yearKey = `y${year.year}`;
        const open = h.isOpen(yearKey);
        const ids = idsOf(year.nodes);
        return (
          <div key={yearKey} className="overflow-hidden rounded-lg border border-slate-200">
            <FolderHeader
              open={open}
              onToggleOpen={() => h.onToggleOpen(yearKey)}
              className="bg-slate-50"
              iconSize={17}
              checkbox={
                <GroupCheckbox
                  state={selectionStateOf(year.nodes, h.selected)}
                  label={`Select every file in Year ${year.year}`}
                  onChange={(next) => h.onToggleGroup(ids, next)}
                />
              }
              title={`Year ${year.year}`}
              meta={counts(year.nodes)}
              actions={
                <DownloadGroupButton
                  count={ids.length}
                  busy={h.downloading === yearKey}
                  what={`all of Year ${year.year}`}
                  onClick={() => h.onDownloadGroup(ids, `year-${year.year}`)}
                />
              }
            />
            {open && (
              <div className="space-y-1.5 border-t border-slate-200 bg-white p-2">
                {year.grades.map((grade) => {
                  const gradeKey = `${yearKey}-g${grade.grade}`;
                  const gradeOpen = h.isOpen(gradeKey);
                  const gradeIds = idsOf(grade.nodes);
                  const sections: [LangKey, FileNode[]][] = (
                    [
                      ["en", grade.en],
                      ["fr", grade.fr],
                      ["other", grade.other],
                    ] as [LangKey, FileNode[]][]
                  ).filter(([, list]) => list.length > 0);
                  return (
                    <div
                      key={gradeKey}
                      className="overflow-hidden rounded-lg border border-slate-100"
                    >
                      <FolderHeader
                        open={gradeOpen}
                        onToggleOpen={() => h.onToggleOpen(gradeKey)}
                        checkbox={
                          <GroupCheckbox
                            state={selectionStateOf(grade.nodes, h.selected)}
                            label={`Select every file in Grade ${grade.grade}`}
                            onChange={(next) => h.onToggleGroup(gradeIds, next)}
                          />
                        }
                        title={`Grade ${grade.grade}`}
                        meta={counts(grade.nodes)}
                        actions={
                          <DownloadGroupButton
                            count={gradeIds.length}
                            busy={h.downloading === gradeKey}
                            what={`Grade ${grade.grade}`}
                            onClick={() =>
                              h.onDownloadGroup(gradeIds, `year-${year.year}-grade-${grade.grade}`)
                            }
                          />
                        }
                      />
                      {gradeOpen && (
                        <div
                          className={cn(
                            "grid gap-4 border-t border-slate-100 p-3",
                            sections.length > 1 && "lg:grid-cols-2"
                          )}
                        >
                          {sections.map(([lang, nodes]) => (
                            <LangSection
                              key={lang}
                              lang={lang}
                              nodes={nodes}
                              scopeLabel={`year-${year.year}-grade-${grade.grade}`}
                              h={h}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {tree.unsorted.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-amber-200">
          <FolderHeader
            open={h.isOpen("unsorted")}
            onToggleOpen={() => h.onToggleOpen("unsorted")}
            className="bg-amber-50/70"
            checkbox={
              <GroupCheckbox
                state={selectionStateOf(tree.unsorted, h.selected)}
                label="Select every unsorted file"
                onChange={(next) => h.onToggleGroup(idsOf(tree.unsorted), next)}
              />
            }
            title="Unsorted"
            meta={`${tree.unsorted.length} file${
              tree.unsorted.length === 1 ? "" : "s"
            } — the filename isn't in “Grade N Lesson NN …” form, so nobody was assigned`}
            actions={
              <DownloadGroupButton
                count={tree.unsorted.length}
                busy={h.downloading === "unsorted"}
                what="the unsorted files"
                onClick={() => h.onDownloadGroup(idsOf(tree.unsorted), "unsorted")}
              />
            }
          />
          {h.isOpen("unsorted") && (
            <div className="divide-y divide-slate-100 border-t border-amber-100 bg-white">
              {tree.unsorted.map((node) => (
                <FileRow
                  key={node.file.id}
                  node={node}
                  selected={h.selected.has(node.file.id)}
                  downloading={h.downloading === node.file.id}
                  onToggle={(shiftKey) =>
                    h.onToggleFile(node.file.id, shiftKey, idsOf(tree.unsorted))
                  }
                  onDownload={() => h.onDownloadFile(node)}
                  onDelete={() => h.onDeleteFile(node)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
