"use client";

import { Download, Eye, Loader2, Trash2 } from "lucide-react";
import { cn, formatDateOnly } from "@/lib/utils";
import { fileDownloadUrl } from "@/lib/api";
import { courseLabel, formatBytes, type FileNode } from "@/lib/super-admin/files";

/**
 * One PDF.
 *
 * The lesson number leads as a chip and the grade/lesson prefix is stripped from
 * the name, because the folder above already said Grade 7: what's left is the
 * part that tells two rows apart. The row actions stay out of the way until the
 * pointer is on the row — with 400 of these on screen, three visible icon
 * buttons per row is most of what makes the page hard to read.
 */
export function FileRow({
  node,
  selected,
  downloading,
  onToggle,
  onDownload,
  onDelete,
}: {
  node: FileNode;
  selected: boolean;
  downloading: boolean;
  onToggle: (shiftKey: boolean) => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const { file } = node;
  return (
    <div
      className={cn(
        "group flex items-center gap-2 px-2 py-1.5 transition-colors",
        selected ? "bg-brand-50" : "hover:bg-slate-50"
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        // onClick, not onChange: it is the only one carrying shiftKey, which is
        // how a whole run of lessons gets picked in two clicks. Keyboard
        // activation (space) fires it too, with shiftKey false.
        readOnly
        onClick={(e) => {
          e.stopPropagation();
          onToggle(e.shiftKey);
        }}
        aria-label={`Select ${file.filename}`}
        className="h-4 w-4 shrink-0 rounded border-slate-300 text-brand focus:ring-brand"
      />

      <span
        className={cn(
          "w-7 shrink-0 rounded text-center text-[11px] font-semibold tabular-nums",
          node.lessonNo == null ? "text-slate-300" : "bg-slate-100 py-0.5 text-slate-600"
        )}
        title={node.lessonNo == null ? "No lesson number in the filename" : "Lesson number"}
      >
        {node.lessonNo == null ? "—" : String(node.lessonNo).padStart(2, "0")}
      </span>

      <span
        className="min-w-0 flex-1 truncate text-[13px] text-slate-800"
        title={file.filename}
      >
        {node.label}
      </span>

      {node.course && (
        <span className="hidden shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 lg:inline">
          {courseLabel(node.course)}
        </span>
      )}

      <span className="hidden w-14 shrink-0 text-right text-[11px] tabular-nums text-slate-400 sm:inline">
        {formatBytes(file.sizeBytes)}
      </span>
      <span className="hidden w-20 shrink-0 text-right text-[11px] text-slate-400 xl:inline">
        {formatDateOnly(file.createdAt)}
      </span>

      <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
        <a
          href={fileDownloadUrl(file.id)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900"
          title="Open in a new tab"
        >
          <Eye size={14} />
        </a>
        <button
          type="button"
          onClick={onDownload}
          disabled={downloading}
          className="rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900 disabled:opacity-50"
          title="Download this PDF"
        >
          {downloading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Download size={14} />
          )}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
          title="Delete this lesson"
        >
          <Trash2 size={14} />
        </button>
      </span>
    </div>
  );
}
