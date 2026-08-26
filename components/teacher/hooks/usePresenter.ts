"use client";

import { useEffect, useRef, useState } from "react";
import { openPresentChannel, type PresentChannel } from "@/lib/present-channel";
import { openPresenterWindow, placeOnExternalScreen } from "@/lib/window-placement";
import type { Lesson } from "@/types";

export type Presenting = { lesson: Lesson; page: number; total: number };

type Callbacks = {
  /** The page the class is looking at — what the assistant is asked about. */
  onPageChange: (page: number | null) => void;
  /** Said in the teacher's own conversation when the projection moves. */
  say: (message: string, extras: { sourceRef: string; lessonId: string }) => void;
  /** Presenting takes the lesson out of this window and into the projector. */
  onStart: (lesson: Lesson) => void;
  /** Lesson access may have moved on while presenting. */
  onStop: () => void;
};

/**
 * The lesson on the classroom's second screen.
 *
 * The projected window is a second copy of this app at /teacher/present/<id>;
 * the two talk over a BroadcastChannel. This window owns the page number and
 * every write, and the projection only renders what it is told — except that
 * scrolling it reports back, so the counter here follows the class.
 */
export function usePresenter(callbacks: Callbacks) {
  const [presenting, setPresenting] = useState<Presenting | null>(null);
  const [presentBlocked, setPresentBlocked] = useState(false);
  const presentingRef = useRef<Presenting | null>(null);
  presentingRef.current = presenting;
  const winRef = useRef<Window | null>(null);
  const channelRef = useRef<PresentChannel | null>(null);
  const byeTimerRef = useRef<number | null>(null);
  // Callbacks change identity every render; read them through a ref so the
  // listeners below don't have to be torn down and rebuilt for that.
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  // Put a lesson on the second display. A window already on the projector is
  // reused — switching lessons should move the class along, not leave them on
  // the old one while a second window opens somewhere. A new window has to be
  // opened inside this click or the browser blocks it, so placement follows.
  function start(lesson: Lesson) {
    if (!lesson.fileId) return;
    const url = `/teacher/present/${lesson.id}`;
    const existing = winRef.current;
    const reusing = Boolean(existing && !existing.closed);

    // Drop the old lesson's channel before navigating: its document says
    // goodbye on unload, and nobody should be listening for that any more.
    cancelByeTimer();
    channelRef.current?.close();
    channelRef.current = null;

    let win: Window | null = existing;
    if (reusing) {
      try {
        win!.location.href = url;
        win!.focus();
      } catch {
        win = null; // window is gone or not ours any more
      }
    }
    if (!win || win.closed) {
      const opened = openPresenterWindow(url);
      if (!opened.win) {
        setPresentBlocked(true);
        return;
      }
      win = opened.win;
      void placeOnExternalScreen(win);
    }
    setPresentBlocked(false);
    winRef.current = win;

    const channel = openPresentChannel(lesson.id, (message) => {
      // A "bye" is treated as tentative: reloading the projected window sends
      // one before the new document announces itself, and that shouldn't look
      // like the teacher shut the projector down.
      if (message.type === "hello" || message.type === "ready") cancelByeTimer();
      if (message.type === "hello") {
        channel.post({ type: "page", page: presentingRef.current?.page ?? 1 });
      }
      if (message.type === "ready") {
        setPresenting((prev) => (prev ? { ...prev, total: message.total } : prev));
      }
      // The teacher scrolled the projected window itself: follow it here, so
      // the counter, the progress they save and the slide the assistant
      // answers about are all the page the class is actually looking at.
      if (message.type === "page") {
        setPresenting((prev) => (prev ? { ...prev, page: message.page } : prev));
        cbRef.current.onPageChange(message.page);
      }
      if (message.type === "bye") {
        byeTimerRef.current = window.setTimeout(() => {
          byeTimerRef.current = null;
          stop(false);
        }, 700);
      }
    });
    channelRef.current = channel;

    setPresenting({ lesson, page: 1, total: 0 });
    cbRef.current.onPageChange(1);
    cbRef.current.onStart(lesson);
    cbRef.current.say(
      reusing
        ? `The classroom screen is now showing "${lesson.title}", from page 1.`
        : `"${lesson.title}" is on your second screen. Use the bar below to change the page — the class only ever sees the lesson, never this chat.`,
      { sourceRef: lesson.title, lessonId: lesson.id }
    );
  }

  function stop(closeWindow = true) {
    cancelByeTimer();
    if (closeWindow) {
      channelRef.current?.post({ type: "stop" });
      closeWindowQuietly();
    }
    channelRef.current?.close();
    channelRef.current = null;
    winRef.current = null;
    setPresenting(null);
    cbRef.current.onPageChange(null);
    cbRef.current.onStop();
  }

  // The class follows this window: every page change is pushed to the projector
  // and becomes the slide the assistant is asked about.
  function goToPage(next: number) {
    const current = presentingRef.current;
    if (!current) return;
    const max = current.total || Number.MAX_SAFE_INTEGER;
    const page = Math.min(Math.max(1, next), max);
    if (page === current.page) return;
    channelRef.current?.post({ type: "page", page });
    setPresenting({ ...current, page });
    cbRef.current.onPageChange(page);
  }

  function cancelByeTimer() {
    if (byeTimerRef.current !== null) {
      window.clearTimeout(byeTimerRef.current);
      byeTimerRef.current = null;
    }
  }

  function closeWindowQuietly() {
    try {
      winRef.current?.close();
    } catch {
      /* already gone */
    }
  }

  // Arrow / page keys drive the projector, unless the teacher is typing.
  useEffect(() => {
    if (!presenting) return;
    function onKey(e: KeyboardEvent) {
      const tag = document.activeElement?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      const page = presentingRef.current?.page ?? 1;
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        goToPage(page + 1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goToPage(page - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenting]);

  // Never leave a projector showing a lesson this window has walked away from.
  useEffect(() => {
    function closePresenter() {
      channelRef.current?.post({ type: "stop" });
      closeWindowQuietly();
    }
    window.addEventListener("beforeunload", closePresenter);
    return () => {
      window.removeEventListener("beforeunload", closePresenter);
      closePresenter();
      channelRef.current?.close();
    };
  }, []);

  return {
    presenting,
    presentingRef,
    presentBlocked,
    startPresenting: start,
    stopPresenting: stop,
    goToPage,
  };
}
