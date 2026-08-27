"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DeleteImpactModal } from "@/components/super-admin/files/DeleteImpactModal";
import { FairPanel } from "@/components/super-admin/files/FairPanel";
import { FileTree, type TreeHandlers } from "@/components/super-admin/files/FileTree";
import { FilesToolbar } from "@/components/super-admin/files/FilesToolbar";
import { UploadPanel } from "@/components/super-admin/files/UploadPanel";
import {
  bulkDeleteFiles,
  downloadFileSelection,
  downloadLessonPdf,
  fileDeletionImpact,
  listLessons,
  listUploadedFiles,
  type DeletionImpact,
} from "@/lib/api";
import {
  EMPTY_FILTERS,
  buildNodes,
  buildTree,
  filterNodes,
  idsOf,
  selectionStateOf,
  type FileNode,
  type Filters,
} from "@/lib/super-admin/files";
import type { Lesson, UploadedFile } from "@/types";

/**
 * Folders default to Year open, Grade closed: 400 rows expanded on arrival is
 * what made this page unreadable, and the grade line already carries the counts
 * you scan for. A search is different — it has narrowed things itself, so its
 * matches are shown open.
 */
function defaultOpen(key: string): boolean {
  return key === "unsorted" || !key.includes("-g");
}

export default function FilesPage() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const [downloading, setDownloading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Both delete paths — one row, or a whole selection — go through the same
  // confirmation, so the row delete gets the cascade counts too.
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const [impact, setImpact] = useState<DeletionImpact | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Anchor for shift-click range selection, per list.
  const lastTouched = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const [fileRows, lessonRows] = await Promise.all([listUploadedFiles(), listLessons()]);
    setFiles(fileRows);
    setLessons(lessonRows);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      await refresh();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load the files.");
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  useEffect(() => {
    load();
  }, [load]);

  // Escape drops the selection — the quickest way out of a mis-click on a
  // folder checkbox that just picked 30 files.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && pendingDelete === null) setSelected(new Set());
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingDelete]);

  const nodes = useMemo(() => buildNodes(files, lessons), [files, lessons]);
  const visible = useMemo(() => filterNodes(nodes, filters), [nodes, filters]);
  const tree = useMemo(() => buildTree(visible), [visible]);
  const visibleIds = useMemo(() => idsOf(visible), [visible]);

  const searching = filters.search.trim() !== "";
  const isOpen = useCallback(
    (key: string) => (searching ? true : openMap[key] ?? defaultOpen(key)),
    [openMap, searching]
  );

  function toggleOpen(key: string) {
    setOpenMap((m) => ({ ...m, [key]: !(m[key] ?? defaultOpen(key)) }));
  }

  function setAllOpen(open: boolean) {
    const next: Record<string, boolean> = { unsorted: open };
    for (const year of tree.years) {
      next[`y${year.year}`] = open;
      for (const grade of year.grades) next[`y${year.year}-g${grade.grade}`] = open;
    }
    setOpenMap(next);
  }

  function toggleGroup(ids: string[], next: boolean) {
    setSelected((cur) => {
      const copy = new Set(cur);
      for (const id of ids) {
        if (next) copy.add(id);
        else copy.delete(id);
      }
      return copy;
    });
  }

  function toggleFile(id: string, shiftKey: boolean, list: string[]) {
    const anchor = lastTouched.current;
    lastTouched.current = id;
    const turningOn = !selected.has(id);

    if (shiftKey && anchor && anchor !== id) {
      const from = list.indexOf(anchor);
      const to = list.indexOf(id);
      if (from !== -1 && to !== -1) {
        const [start, end] = from < to ? [from, to] : [to, from];
        toggleGroup(list.slice(start, end + 1), turningOn);
        return;
      }
    }
    toggleGroup([id], turningOn);
  }

  async function runDownload(key: string, run: () => Promise<void>) {
    setDownloading(key);
    setActionError(null);
    try {
      await run();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setDownloading(null);
    }
  }

  function downloadGroup(ids: string[], label: string) {
    return runDownload(label, () => downloadFileSelection(ids, label));
  }

  function downloadNode(node: FileNode) {
    return runDownload(node.file.id, () =>
      downloadLessonPdf(node.file.id, node.file.filename)
    );
  }

  // Opening the dialog asks the server what the selection costs; the dialog
  // shows nothing but a spinner until it knows.
  async function askToDelete(ids: string[]) {
    setPendingDelete(ids);
    setImpact(null);
    setDeleteError(null);
    setImpactLoading(true);
    try {
      setImpact(await fileDeletionImpact(ids));
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Couldn't check what this removes.");
      setImpact({
        files: ids.length,
        lessons: 0,
        teachers: 0,
        assignments: 0,
        progress: 0,
        chatMessages: 0,
        accessRequests: 0,
        lessonsInProgress: 0,
        lessonTitles: [],
        missing: 0,
      });
    } finally {
      setImpactLoading(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await bulkDeleteFiles(pendingDelete);
      await refresh();
      const removed = new Set(pendingDelete);
      setSelected((cur) => new Set(Array.from(cur).filter((id) => !removed.has(id))));
      setPendingDelete(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeleteBusy(false);
    }
  }

  const handlers: TreeHandlers = {
    selected,
    onToggleFile: toggleFile,
    onToggleGroup: toggleGroup,
    onDownloadGroup: downloadGroup,
    onDownloadFile: downloadNode,
    onDeleteFile: (node) => askToDelete([node.file.id]),
    downloading,
    isOpen,
    onToggleOpen: toggleOpen,
  };

  const selectedIds = useMemo(
    () => visibleIds.filter((id) => selected.has(id)),
    [visibleIds, selected]
  );
  // A selection survives a filter change, so count what is actually held, not
  // only what happens to be on screen.
  const selectedCount = selected.size;

  return (
    <>
      <PageHeader
        title="Files"
        subtitle="Every lesson PDF — upload, search, download, or clear out a whole grade."
      />

      <UploadPanel onUploaded={refresh} />

      {loadError && (
        <Card className="mb-4 border-red-200 bg-red-50/60">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <AlertCircle size={16} className="shrink-0 text-red-500" />
            <p className="flex-1 text-sm text-red-700">{loadError}</p>
            <Button size="sm" variant="secondary" onClick={load}>
              Try again
            </Button>
          </div>
        </Card>
      )}

      <Card className="flex max-h-[calc(100vh-8rem)] min-h-[360px] flex-col overflow-hidden">
        <FilesToolbar
          filters={filters}
          onFilters={setFilters}
          shown={visible.length}
          total={nodes.length}
          selectedCount={selectedCount}
          shownState={selectionStateOf(visible, selected)}
          onToggleShown={(next) => toggleGroup(visibleIds, next)}
          onClearSelection={() => setSelected(new Set())}
          onDownloadSelected={() =>
            runDownload("selection", () =>
              downloadFileSelection(Array.from(selected), "selection")
            )
          }
          onDeleteSelected={() => askToDelete(Array.from(selected))}
          onExpandAll={() => setAllOpen(true)}
          onCollapseAll={() => setAllOpen(false)}
          downloadingSelection={downloading === "selection"}
        />

        {actionError && (
          <p className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">
            {actionError}
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/40">
          {loading ? (
            <p className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
              <Loader2 size={15} className="animate-spin" /> Loading files…
            </p>
          ) : nodes.length === 0 && !loadError ? (
            <p className="py-16 text-center text-sm text-slate-400">
              No lesson PDFs yet — upload some above.
            </p>
          ) : (
            <FileTree tree={tree} h={handlers} />
          )}
        </div>
      </Card>

      {selectedIds.length !== selectedCount && selectedCount > 0 && (
        <p className="mt-2 px-1 text-xs text-slate-500">
          {selectedCount - selectedIds.length} selected file
          {selectedCount - selectedIds.length === 1 ? " is" : "s are"} hidden by the current
          filters — Download and Delete still cover all {selectedCount}.
        </p>
      )}

      <FairPanel />

      <DeleteImpactModal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        impact={impact}
        loading={impactLoading}
        busy={deleteBusy}
        error={deleteError}
        onConfirm={confirmDelete}
      />
    </>
  );
}
