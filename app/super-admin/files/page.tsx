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
import { useLatestOnly } from "@/lib/use-latest-only";
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
  // Which impact question the dialog is currently showing the answer to.
  const impactQuestion = useLatestOnly();
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
  //
  // Two of those questions can be outstanding at once — Cancel stays live while
  // the impact is still loading, so an admin who gives up on a slow one and
  // deletes something else has both in flight — and the answers are not
  // required to come back in the order they were asked. The slower one landing
  // second overwrote the newer one, which put a description of one selection in
  // front of a Delete button holding another: the dialog reading "these files
  // aren't linked to any lesson, so nothing else is affected" over a folder
  // that takes its lessons, progress and chat history with it.
  async function askToDelete(ids: string[]) {
    const isCurrent = impactQuestion.claim();

    setPendingDelete(ids);
    setImpact(null);
    setDeleteError(null);
    setImpactLoading(true);
    try {
      const answer = await fileDeletionImpact(ids);
      if (!isCurrent()) return;
      setImpact(answer);
    } catch (err) {
      if (!isCurrent()) return;
      // No invented numbers. A fabricated all-zero impact used to stand in
      // here, which made the modal say "nothing else is affected" about a
      // delete that cascades lessons, progress and chats — the one claim this
      // dialog exists to check. With impact left null the modal shows the
      // error and keeps Delete disabled until a real answer arrives.
      setDeleteError(err instanceof Error ? err.message : "Couldn't check what this removes.");
    } finally {
      if (isCurrent()) setImpactLoading(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await bulkDeleteFiles(pendingDelete);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed.");
      setDeleteBusy(false);
      return;
    }

    // Past this line the delete has happened. Reloading the list is how the
    // screen catches up, and it can fail on its own — a dropped connection, an
    // expired session — which used to land in the same catch and be reported as
    // "Delete failed", with the impact numbers still on screen under "This
    // cannot be undone". The admin read a destroyed grade as an untouched one.
    const removed = new Set(pendingDelete);
    setSelected((cur) => new Set(Array.from(cur).filter((id) => !removed.has(id))));
    setPendingDelete(null);
    setDeleteBusy(false);
    try {
      await refresh();
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : "The files were deleted, but the list could not be reloaded."
      );
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
        onClose={() => {
          // Retires the outstanding question too, so an answer arriving after
          // the dialog is shut does not write itself into the next one.
          impactQuestion.retire();
          setPendingDelete(null);
          setImpactLoading(false);
        }}
        impact={impact}
        loading={impactLoading}
        busy={deleteBusy}
        error={deleteError}
        onConfirm={confirmDelete}
      />
    </>
  );
}
