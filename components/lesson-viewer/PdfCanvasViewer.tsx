"use client";

import { useEffect, useRef, useState } from "react";
import {
  ZoomIn,
  ZoomOut,
  Loader2,
  FileWarning,
  Check,
  BookmarkCheck,
  ArrowLeft,
  ExternalLink,
} from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { fetchLessonPdf, saveLessonProgress } from "@/lib/api";
import { cn } from "@/lib/utils";

// In-app PDF viewer (PDF.js → canvas): no browser toolbar (no download/print/
// save), right-click + Ctrl+S/P blocked. Also tracks the slide the teacher has
// scrolled to and lets them self-report progress ("Save progress" / "Complete").
//
// Mobile-hardened: pages fit the viewport width, the device-pixel-ratio is
// capped, and only pages near the viewport are rendered to canvas (far pages
// are freed). This keeps memory bounded so phones don't blank/crash on long
// PDFs, while still never exposing a downloadable file.
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
  // Intrinsic page sizes (viewport at scale 1) so we can size placeholders and
  // compute a fit-to-width scale without rendering every page.
  const dimsRef = useRef<Array<{ width: number; height: number }>>([]);
  const wrappersRef = useRef<HTMLDivElement[]>([]);
  const renderedRef = useRef<Set<number>>(new Set());
  const ratiosRef = useRef<Map<number, number>>(new Map());
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  // fitScale = base scale that makes a page fill the container width.
  // zoom = user multiplier on top of that. Effective scale = fitScale * zoom.
  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [total, setTotal] = useState(0);
  const [current, setCurrent] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [done, setDone] = useState(accessStatus === "completed");
  const [useNativeMobileViewer, setUseNativeMobileViewer] = useState(false);
  const [nativeUrl, setNativeUrl] = useState<string | null>(null);
  const [nativeStatus, setNativeStatus] = useState<"loading" | "ready" | "error">("loading");

  const effScale = +(fitScale * zoom).toFixed(3);

  useEffect(() => {
    const detect = () => {
      setUseNativeMobileViewer(
        window.matchMedia("(max-width: 768px), (pointer: coarse)").matches
      );
    };
    detect();
    window.addEventListener("resize", detect);
    window.addEventListener("orientationchange", detect);
    return () => {
      window.removeEventListener("resize", detect);
      window.removeEventListener("orientationchange", detect);
    };
  }, []);

  useEffect(() => {
    if (!useNativeMobileViewer) return;
    let cancelled = false;
    let url: string | null = null;
    setNativeStatus("loading");
    setNativeUrl(null);
    (async () => {
      try {
        const data = await fetchLessonPdf(fileId);
        if (cancelled) return;
        const blob = new Blob([data], { type: "application/pdf" });
        url = URL.createObjectURL(blob);
        setNativeUrl(url);
        setNativeStatus("ready");
      } catch {
        if (!cancelled) setNativeStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [fileId, useNativeMobileViewer]);

  // Load the document and pre-measure every page (light; no rendering).
  useEffect(() => {
    if (useNativeMobileViewer) return;
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
        const dims: Array<{ width: number; height: number }> = [];
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const vp = page.getViewport({ scale: 1 });
          dims[n] = { width: vp.width, height: vp.height };
          page.cleanup();
        }
        dimsRef.current = dims;
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
  }, [fileId, useNativeMobileViewer]);

  // Compute the fit-to-width scale from the first page and the container width;
  // recompute on resize / orientation change.
  useEffect(() => {
    if (useNativeMobileViewer) return;
    if (status !== "ready") return;
    const container = containerRef.current;
    const first = dimsRef.current[1];
    if (!container || !first) return;

    const recompute = () => {
      const avail = container.clientWidth - 32; // px padding on each side
      if (avail <= 0) return;
      const s = Math.min(2, Math.max(0.4, avail / first.width));
      setFitScale(+s.toFixed(3));
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(container);
    return () => ro.disconnect();
  }, [status, useNativeMobileViewer]);

  // Build page placeholders and lazily render only pages near the viewport.
  useEffect(() => {
    if (useNativeMobileViewer) return;
    if (status !== "ready") return;
    const doc = docRef.current;
    const container = containerRef.current;
    if (!doc || !container) return;

    let cancelled = false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderedRef.current.clear();
    ratiosRef.current.clear();
    wrappersRef.current = [];
    container.innerHTML = "";

    async function renderPage(n: number, wrapper: HTMLDivElement) {
      if (cancelled || renderedRef.current.has(n)) return;
      renderedRef.current.add(n);
      try {
        const page = await doc!.getPage(n);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: effScale });
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.className = "block rounded-lg shadow-2xl";
        ctx.scale(dpr, dpr);
        wrapper.innerHTML = "";
        wrapper.appendChild(canvas);
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (cancelled) canvas.remove();
      } catch {
        renderedRef.current.delete(n);
      }
    }

    function freePage(n: number, wrapper: HTMLDivElement) {
      if (!renderedRef.current.has(n)) return;
      renderedRef.current.delete(n);
      wrapper.innerHTML = "";
    }

    // Lazy render/free: keep a margin around the viewport so scrolling is smooth.
    const lazy = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const el = e.target as HTMLDivElement;
          const n = Number(el.dataset.slide);
          if (e.isIntersecting) renderPage(n, el);
          else freePage(n, el);
        }
      },
      { root: container, rootMargin: "400px 0px" }
    );

    // Current-slide tracking: which page occupies the most of the viewport.
    const track = new IntersectionObserver(
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

    for (let n = 1; n <= doc.numPages; n++) {
      const d = dimsRef.current[n];
      if (!d) continue;
      const wrapper = document.createElement("div");
      wrapper.dataset.slide = String(n);
      wrapper.className = "mx-auto mb-4";
      wrapper.style.width = `${Math.floor(d.width * effScale)}px`;
      wrapper.style.height = `${Math.floor(d.height * effScale)}px`;
      wrapper.style.maxWidth = "100%";
      container.appendChild(wrapper);
      wrappersRef.current.push(wrapper);
      lazy.observe(wrapper);
      track.observe(wrapper);
    }

    return () => {
      cancelled = true;
      lazy.disconnect();
      track.disconnect();
    };
  }, [status, effScale, useNativeMobileViewer]);

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

  if (useNativeMobileViewer) {
    return (
      <div className="relative flex h-full flex-col">
        <div className={cn("flex items-center justify-between gap-2 border-b px-3 py-2 text-xs", light ? "border-slate-200/60 text-slate-600" : "border-white/5 text-slate-300")}>
          <span>Mobile PDF viewer</span>
          {onExit && (
            <button
              onClick={onExit}
              className={cn("inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 transition", light ? "border-slate-200 bg-white text-slate-700" : "border-white/10 bg-white/5 text-slate-200")}
            >
              <ArrowLeft size={13} /> Back
            </button>
          )}
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5 text-center">
          {nativeStatus === "loading" && (
            <>
              <Loader2 size={24} className={cn("animate-spin", light ? "text-slate-400" : "text-slate-500")} />
              <p className={light ? "text-sm text-slate-600" : "text-sm text-slate-300"}>
                Preparing the lesson PDF...
              </p>
            </>
          )}

          {nativeStatus === "error" && (
            <>
              <FileWarning size={24} className="text-red-400" />
              <p className={light ? "text-sm text-slate-600" : "text-sm text-slate-300"}>
                Couldn't load this lesson PDF.
              </p>
            </>
          )}

          {nativeStatus === "ready" && nativeUrl && (
            <>
              <p className={light ? "max-w-sm text-sm text-slate-600" : "max-w-sm text-sm text-slate-300"}>
                Open the lesson with your phone's PDF viewer.
              </p>
              <a
                href={nativeUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-brand to-brand-700 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-brand/30 transition hover:brightness-110"
              >
                <ExternalLink size={16} /> Open PDF
              </a>
              {lessonId && !done && (
                <button
                  onClick={() => save(true)}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
                >
                  <Check size={15} /> {saving ? "Saving..." : "Mark complete"}
                </button>
              )}
              {done && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                  <BookmarkCheck size={13} /> Lesson completed
                </span>
              )}
              {saved && (
                <span className={cn("text-xs", saved.startsWith("Couldn't") ? "text-red-500" : "text-emerald-600")}>
                  {saved}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      {/* Zoom toolbar (no download/print/save) */}
      <div className={cn("flex items-center justify-center gap-2 border-b px-3 py-1.5 text-xs", light ? "border-slate-200/60 text-slate-500" : "border-white/5 text-slate-400")}>
        <button className={barBtn} onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))} aria-label="Zoom out">
          <ZoomOut size={14} />
        </button>
        <span className="w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <button className={barBtn} onClick={() => setZoom((z) => Math.min(3, +(z + 0.15).toFixed(2)))} aria-label="Zoom in">
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
