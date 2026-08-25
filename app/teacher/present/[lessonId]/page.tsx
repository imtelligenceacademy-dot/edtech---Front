"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { PresentedPage } from "@/components/lesson-viewer/PresentedPage";
import { getLesson } from "@/lib/api";
import { openPresentChannel, type PresentChannel } from "@/lib/present-channel";
import type { Lesson } from "@/types";

// The window the class sees. It is opened by the teacher's window, lives on the
// projector, and shows one lesson page and nothing else. It never writes
// progress and never renders the assistant — that is the whole point of it.
export default function PresentLessonPage({
  params,
}: {
  params: { lessonId: string };
}) {
  const { lessonId } = params;
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [showHint, setShowHint] = useState(true);
  const channelRef = useRef<PresentChannel | null>(null);

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
      if (message.type === "page") setPage(message.page);
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

  // Full screen needs a gesture in this window, so we ask for one — once, with
  // a hint that fades out of the way.
  useEffect(() => {
    const timer = window.setTimeout(() => setShowHint(false), 6000);
    return () => window.clearTimeout(timer);
  }, []);

  async function goFullscreen() {
    setShowHint(false);
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      /* denied or already full screen — the window is sized to the display anyway */
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
    <div className="relative h-screen w-screen overflow-hidden bg-black" onClick={goFullscreen}>
      <PresentedPage
        fileId={lesson.fileId}
        page={page}
        onReady={(total) => channelRef.current?.post({ type: "ready", total })}
      />
      {showHint && (
        <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-[11px] text-white/70">
          Click anywhere for full screen
        </p>
      )}
    </div>
  );
}
