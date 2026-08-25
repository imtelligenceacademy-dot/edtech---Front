"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, FileWarning } from "lucide-react";
import { useBlockSaveShortcuts, useLessonPdf } from "./useLessonPdf";

// One lesson page, letterboxed to fill a classroom screen. This is what the
// students see, so it carries nothing else: no chrome, no controls, no hint
// that an assistant exists. The page shown is decided by the teacher's window.
export function PresentedPage({
  fileId,
  page,
  onReady,
}: {
  fileId: string;
  page: number;
  onReady?: (total: number) => void;
}) {
  const holderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const { docRef, dimsRef, total, status, errorMessage } = useLessonPdf(fileId);

  useBlockSaveShortcuts();

  // Tell the teacher's window how many pages there are, once.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  useEffect(() => {
    if (status === "ready" && total > 0) onReadyRef.current?.(total);
  }, [status, total]);

  // Track the window size: moving this window to a projector resizes it, and
  // the page has to be re-rendered at the new scale to stay sharp.
  useEffect(() => {
    const measure = () => {
      const el = holderRef.current;
      if (el) setViewport({ width: el.clientWidth, height: el.clientHeight });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Render the requested page, scaled to fit the screen without cropping.
  useEffect(() => {
    if (status !== "ready") return;
    const doc = docRef.current;
    const canvas = canvasRef.current;
    const dims = dimsRef.current[page];
    if (!doc || !canvas || !dims || viewport.width === 0) return;

    let cancelled = false;
    const safePage = Math.min(Math.max(1, page), doc.numPages);

    (async () => {
      const scale = Math.min(viewport.width / dims.width, viewport.height / dims.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      try {
        const pdfPage = await doc.getPage(safePage);
        if (cancelled) return;
        const vp = pdfPage.getViewport({ scale });
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        canvas.width = Math.floor(vp.width * dpr);
        canvas.height = Math.floor(vp.height * dpr);
        canvas.style.width = `${Math.floor(vp.width)}px`;
        canvas.style.height = `${Math.floor(vp.height)}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        await pdfPage.render({ canvasContext: ctx, viewport: vp }).promise;
        pdfPage.cleanup();
      } catch {
        /* a render superseded by the next page change — nothing to report */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [page, status, viewport, docRef, dimsRef]);

  return (
    <div
      ref={holderRef}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      className="flex h-full w-full select-none items-center justify-center bg-black"
      style={{ userSelect: "none" }}
    >
      {status === "loading" && (
        <Loader2 size={28} className="animate-spin text-slate-600" />
      )}
      {status === "error" && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <FileWarning size={20} className="text-red-400" />
          {errorMessage === "Stored file missing"
            ? "This lesson file is missing from storage."
            : errorMessage}
        </div>
      )}
      <canvas ref={canvasRef} className={status === "ready" ? "block" : "hidden"} />
    </div>
  );
}
