"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Keeps the transcript pinned to the newest message — but only while the
 * teacher is actually reading the newest message. Scroll up to re-read an
 * earlier answer and the view stays put, however much streams in below.
 *
 * `follow` is what the transcript should track: pass the messages and the
 * thinking flag, and any change re-checks whether to scroll.
 */
export function useTranscriptScroll(follow: unknown[]) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const atBottomRef = useRef(true);
  const suppressScrollUntilRef = useRef(0);

  useEffect(() => {
    if (!atBottomRef.current) return;
    scrollToBottom();
    // The caller decides what "something new happened" means.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, follow);

  // A smooth scroll fires scroll events all the way down, and every one of them
  // looks like "the teacher scrolled up" until the animation lands. Ignore the
  // transcript's own scrolling for the length of the animation.
  function scrollToBottom() {
    const el = scrollRef.current;
    if (!el) return;
    suppressScrollUntilRef.current = Date.now() + 800;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }

  // Track how close to the bottom the transcript is scrolled. Anything within a
  // bubble's height counts as "following along".
  function onTranscriptScroll(e: React.UIEvent<HTMLDivElement>) {
    if (Date.now() < suppressScrollUntilRef.current) return;
    const el = e.currentTarget;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    atBottomRef.current = near;
    setAtBottom((prev) => (prev === near ? prev : near));
  }

  // Resume following without moving the view — used when sending a message,
  // which is itself an intent to watch the reply.
  function followLatest() {
    atBottomRef.current = true;
    setAtBottom(true);
  }

  function jumpToLatest() {
    followLatest();
    scrollToBottom();
  }

  return {
    scrollRef,
    atBottom,
    onTranscriptScroll,
    jumpToLatest,
    followLatest,
  };
}
