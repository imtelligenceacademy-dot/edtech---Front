"use client";

import { useEffect, useState } from "react";
import { PANE_WIDTH_KEY } from "@/lib/teacher/prefs";

/**
 * How the lesson viewer and the assistant share the screen: a draggable
 * divider, and a way to fold the assistant away entirely for presenting at
 * full width. The width is a teacher's own preference, so it outlives the tab.
 */
export function useLessonSplit() {
  const [paneWidth, setPaneWidth] = useState(60);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    try {
      const width = Number(window.localStorage.getItem(PANE_WIDTH_KEY));
      if (width >= 35 && width <= 80) setPaneWidth(width);
    } catch {
      /* unreadable storage — the default split is fine */
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    // Don't write until the stored value has been read, or the default would
    // overwrite the teacher's choice on every load.
    if (!restored) return;
    try {
      window.localStorage.setItem(PANE_WIDTH_KEY, String(Math.round(paneWidth)));
    } catch {
      /* preference just won't stick */
    }
  }, [restored, paneWidth]);

  // Drag the divider between the lesson viewer and the chat.
  function startPaneDrag(e: React.MouseEvent) {
    e.preventDefault();
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onMove(ev: MouseEvent) {
      const pct = (ev.clientX / window.innerWidth) * 100;
      setPaneWidth(Math.min(80, Math.max(35, pct)));
    }
    function onUp() {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return {
    paneWidth,
    setPaneWidth,
    chatCollapsed,
    setChatCollapsed,
    startPaneDrag,
  };
}
