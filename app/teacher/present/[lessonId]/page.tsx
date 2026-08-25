"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { PdfCanvasViewer } from "@/components/lesson-viewer/PdfCanvasViewer";
import { getLesson } from "@/lib/api";
import { openPresentChannel, type PresentChannel } from "@/lib/present-channel";
import type { Lesson } from "@/types";

// The window the class sees: the lesson, scrollable like any presentation, and
// nothing else — no chat, no controls, no branding. The teacher scrolls it
// directly, and the page they land on is reported back so their own window
// stays in step. It never writes progress; that stays with the teacher.
export default function PresentLessonPage({
  params,
}: {
  params: { lessonId: string };
}) {
  const { lessonId } = params;
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A page the teacher asked us to jump to (from their ‹ › controls).
  const [goToPage, setGoToPage] = useState<number | undefined>(undefined);
  const [showHint, setShowHint] = useState(true);
  const channelRef = useRef<PresentChannel | null>(null);
  // The last page either side knows about, so scrolling here and jumping from
  // there don't echo each other back and forth.
  const syncedPageRef = useRef(0);

  // The API refuses a lesson this teacher can't open, so this is the access
  // check as well as the way we learn which file to render.
  useEffect(() => {
    getLesson(lessonId)
      .then(setLesson)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "This lesson can't be opened.")
      );
  }, [lessonId]);

  useEffect(() => {
    const channel = openPresentChannel(lessonId, (message) => {
      if (message.type === "page") {
        syncedPageRef.current = message.page;
        setGoToPage(message.page);
      }
      if (message.type === "stop") window.close();
    });
    channelRef.current = channel;
    // Announce ourselves so the teacher's window sends the current page.
    channel.post({ type: "hello" });

    // Only a real close says goodbye. Saying it from the effect cleanup would
    // also fire on a remount (React's development double-invoke, a fast
    // refresh) and tell the teacher's window the projector was shut down.
    const sayBye = () => channel.post({ type: "bye" });
    window.addEventListener("pagehide", sayBye);
    return () => {
      window.removeEventListener("pagehide", sayBye);
      channel.close();
    };
  }, [lessonId]);

  // Scrolling here moves the teacher's page counter — and with it the slide the
  // assistant answers about.
  const reportPage = useCallback((page: number) => {
    if (page === syncedPageRef.current) return;
    syncedPageRef.current = page;
    channelRef.current?.post({ type: "page", page });
  }, []);

  // Full screen needs a gesture in this window, so ask for one — with a hint
  // that gets out of the way. Double-click, so it never fights scrolling.
  useEffect(() => {
    const timer = window.setTimeout(() => setShowHint(false), 8000);
    return () => window.clearTimeout(timer);
  }, []);

  async function toggleFullscreen() {
    setShowHint(false);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* denied — the window is already sized to the display anyway */
    }
  }

  if (error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black px-8 text-center text-sm text-slate-400">
        {error}
      </div>
    );
  }

  if (!lesson?.fileId) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black">
        <Loader2 size={28} className="animate-spin text-slate-600" />
      </div>
    );
  }

  return (
    <div
      className="relative h-screen w-screen overflow-hidden bg-black"
      onDoubleClick={toggleFullscreen}
    >
      <PdfCanvasViewer
        fileId={lesson.fileId}
        bare
        goToPage={goToPage}
        onSlideChange={reportPage}
        onReady={(total) => channelRef.current?.post({ type: "ready", total })}
      />
      {showHint && (
        <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-[11px] text-white/70">
          Scroll to move through the lesson · double-click for full screen
        </p>
      )}
    </div>
  );
}
