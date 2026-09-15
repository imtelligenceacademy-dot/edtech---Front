"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { fetchLessonPdf } from "@/lib/api";

export type PageDims = { width: number; height: number };

// Loads a lesson PDF and pre-measures every page (light: no rendering yet).
// Shared by the scrolling lesson viewer and the single-page view projected on
// a classroom screen, so both fetch, protect and measure the file identically.
export function useLessonPdf(fileId: string, enabled = true) {
  const docRef = useRef<PDFDocumentProxy | null>(null);
  // Intrinsic page sizes (viewport at scale 1), 1-based, so a caller can size
  // placeholders and compute a fit scale without rendering anything.
  const dimsRef = useRef<Array<PageDims>>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("Could not load this lesson PDF.");

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setStatus("loading");
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        // That import yields, and a lot happens in the gap. The viewer
        // decides whether to hand the file to the phone's own PDF app in
        // an effect that runs while this one is waiting here, so on every
        // mobile open this had already been switched off by now — and
        // without this check the whole PDF was fetched and discarded,
        // then fetched again by the native branch. Two full downloads per
        // lesson opened, on school wifi.
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
        const data = await fetchLessonPdf(fileId);
        if (cancelled) return;
        const doc = await pdfjs.getDocument({ data }).promise;
        if (cancelled) {
          // Destroyed here rather than dropped. Cleanup can only let go
          // of what the ref already holds, and this never reached it — so
          // a teacher who tapped another lesson while this one was still
          // parsing left its document and its pdf.js worker alive for the
          // life of the tab.
          await doc.destroy?.();
          return;
        }
        docRef.current = doc;
        const dims: Array<PageDims> = [];
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
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(
            err instanceof Error ? err.message : "Could not load this lesson PDF."
          );
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
      docRef.current?.destroy?.();
      docRef.current = null;
    };
  }, [fileId, enabled]);

  return { docRef, dimsRef, total, status, errorMessage };
}

// Block the browser's save/print shortcuts while a protected PDF is on screen.
export function useBlockSaveShortcuts() {
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
}
