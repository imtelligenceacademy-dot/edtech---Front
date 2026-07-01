"use client";

import { useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Loader2, FileWarning, Check, BookmarkCheck, ArrowLeft } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { fetchLessonPdf, saveLessonProgress } from "@/lib/api";
import { cn } from "@/lib/utils";

// In-app PDF viewer (PDF.js → canvas): no browser toolbar (no download/print/
// save), right-click + Ctrl+S/P blocked. Also tracks the slide the teacher has
// scrolled to and lets them self-report progress ("Save progress" / "Complete").
export function PdfCanvasViewer({
  fileId,
  lessonId,
  light = false,
  accessStatus,
  onExit,
  onCompleted,
}: {
  fileId: string;
  lessonId?: string;
  light?: boolean;
  accessStatus?: string | null;
  onExit?: () => void; // return to the lesson list
  onCompleted?: () => void; // fired after the lesson is marked complete
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const ratiosRef = useRef<Map<number, number>>(new Map());
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [scale, setScale] = useState(1.3);
  const [total, setTotal] = useState(0);
  const [current, setCurrent] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [done, setDone] = useState(accessStatus === "completed");

  // Load the document.
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
        const data = await fetchLessonPdf(fileId);
        if (cancelled) return;
        const doc = await pdfjs.getDocument({ data }).promise;
        if (cancelled) return;
        docRef.current = doc;
        setTotal(doc.numPages);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      docRef.current?.destroy?.();
      docRef.current = null;
    };
  }, [fileId]);

  // (Re)render all pages; observe them to track the current slide.
  useEffect(() => {
    if (status !== "ready") return;
    const doc = docRef.current;
    const container = containerRef.current;
    if (!doc || !container) return;

    let cancelled = false;
    ratiosRef.current.clear();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const n = Number((e.target as HTMLElement).dataset.slide);
          ratiosRef.current.set(n, e.isIntersecting ? e.intersectionRatio : 0);
        }
        let best = 1;
        let bestRatio = -1;
        ratiosRef.current.forEach((ratio, slide) => {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            best = slide;
          }
        });
        setCurrent(best);
      },
      { root: container, threshold: [0, 0.25, 0.5, 0.75, 1] }
    );

    (async () => {
      container.innerHTML = "";
      const ratio = window.devicePixelRatio || 1;
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        canvas.className = "mx-auto mb-4 rounded-lg shadow-2xl";
        canvas.dataset.slide = String(n);
        ctx.scale(ratio, ratio);
        container.appendChild(canvas);
        observer.observe(canvas);
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (cancelled) return;
      }
    })();
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [status, scale]);

  // Block save/print shortcuts while the viewer is mounted.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (k === "s" || k === "p")) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  async function save(complete: boolean) {
    if (!lessonId) return;
    setSaving(true);
    setSaved(null);
    try {
      const p = await saveLessonProgress(
        lessonId,
        complete ? { complete: true, total } : { slide: current, total }
      );
      setSaved(
        complete
          ? "Marked complete — 100%"
          : `Saved — stopped at slide ${current} (${p.percentComplete}%)`
      );
      if (complete || p.percentComplete >= 100) {
        setDone(true);
        onCompleted?.();
      }
    } catch {
      setSaved("Couldn't save progress.");
    } finally {
      setSaving(false);
    }
  }

  const barBtn = cn(
    "flex h-7 w-7 items-center justify-center rounded-md transition",
    light ? "text-slate-600 hover:bg-slate-100" : "text-slate-300 hover:bg-white/10"
  );

  return (
    <div className="relative flex h-full flex-col">
      {/* Zoom toolbar (no download/print/save) */}
      <div className={cn("flex items-center justify-center gap-2 border-b px-3 py-1.5 text-xs", light ? "border-slate-200/60 text-slate-500" : "border-white/5 text-slate-400")}>
        <button className={barBtn} onClick={() => setScale((s) => Math.max(0.6, +(s - 0.15).toFixed(2)))} aria-label="Zoom out">
          <ZoomOut size={14} />
        </button>
        <span className="w-12 text-center tabular-nums">{Math.round(scale * 100)}%</span>
        <button className={barBtn} onClick={() => setScale((s) => Math.min(2.5, +(s + 0.15).toFixed(2)))} aria-label="Zoom in">
          <ZoomIn size={14} />
        </button>
      </div>

      {/* Page canvases */}
      <div
        ref={containerRef}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        className="chat-scroll flex-1 select-none overflow-auto px-4 py-4"
        style={{ userSelect: "none" }}
      />

      {/* Self-reported progress bar */}
      {lessonId && status === "ready" && (
        <div className={cn("flex flex-wrap items-center gap-3 border-t px-4 py-2.5 text-xs", light ? "border-slate-200/60" : "border-white/5")}>
          <span className={light ? "text-slate-600" : "text-slate-300"}>
            You&apos;re on <strong>slide {current}</strong> of {total}
          </span>
          {saved && (
            <span className={cn("inline-flex items-center gap-1", saved.startsWith("Couldn't") ? "text-red-400" : "text-emerald-500")}>
              <Check size={12} /> {saved}
            </span>
          )}
          {done ? (
            <div className="ml-auto flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-medium text-emerald-700">
                <BookmarkCheck size={13} /> Lesson completed
              </span>
              {onExit && (
                <button
                  onClick={onExit}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-brand to-brand-700 px-3 py-1.5 text-white shadow-lg shadow-brand/30 transition hover:brightness-110"
                >
                  <ArrowLeft size={13} /> Back to lessons
                </button>
              )}
            </div>
          ) : (
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => save(false)}
                disabled={saving}
                className={cn("flex items-center gap-1.5 rounded-lg border px-3 py-1.5 transition", light ? "border-slate-200 text-slate-700 hover:bg-slate-100" : "border-white/10 text-slate-200 hover:bg-white/10")}
              >
                <BookmarkCheck size={13} /> Save progress
              </button>
              <button
                onClick={() => save(true)}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-brand to-brand-700 px-3 py-1.5 text-white shadow-lg shadow-brand/30 transition hover:brightness-110"
              >
                <Check size={13} /> Mark complete
              </button>
            </div>
          )}
        </div>
      )}

      {status !== "ready" && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm">
          {status === "loading" ? (
            <>
              <Loader2 size={22} className={cn("animate-spin", light ? "text-slate-400" : "text-slate-500")} />
              <span className={light ? "text-slate-500" : "text-slate-400"}>Loading lesson…</span>
            </>
          ) : (
            <>
              <FileWarning size={22} className="text-red-400" />
              <span className={light ? "text-slate-600" : "text-slate-300"}>Couldn&apos;t load this lesson PDF.</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
