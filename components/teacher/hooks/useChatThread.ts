"use client";

import { useEffect, useRef, useState } from "react";
import { clearChatMessages, listChatMessages } from "@/lib/api";
import type { AIMessage } from "@/types";

/**
 * The conversation, one thread per lesson.
 *
 * Every turn carries the lesson it belongs to, so switching lessons switches
 * what is on screen without losing what was said about the other one. Threads
 * are pulled from the server the first time a lesson comes into play, then kept
 * in memory for the rest of the session.
 */
export function useChatThread(contextLessonId: string | null) {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  // Threads already pulled from the server this session.
  const loadedThreadsRef = useRef<Set<string>>(new Set());
  // The lesson in play, readable from callbacks that run outside render.
  const contextLessonRef = useRef<string | null>(null);
  contextLessonRef.current = contextLessonId;

  // Only this lesson's turns are on screen; the rest stay in memory for when
  // the teacher switches back.
  const visibleMessages = messages.filter(
    (m) => (m.lessonId ?? null) === contextLessonId
  );

  // Pull the stored thread for the lesson in play, once per lesson. Local
  // turns (the app's own "Opening ..." lines, and anything asked since) keep
  // their place because both are tagged with the same lesson.
  useEffect(() => {
    if (!contextLessonId || loadedThreadsRef.current.has(contextLessonId)) return;
    const lessonId = contextLessonId;
    loadedThreadsRef.current.add(lessonId);
    // No cancellation guard on purpose: React remounts effects in development,
    // and throwing away a resolved fetch would leave the thread empty. The
    // merge below is keyed by message id, so applying it twice is a no-op.
    listChatMessages(lessonId)
      .then((rows) => {
        if (rows.length === 0) return;
        const stored: AIMessage[] = rows.map((r) => ({
          id: r.id,
          role: r.role,
          content: r.content,
          timestamp: r.createdAt,
          sourceRef: r.sourceRef ?? undefined,
          lessonId: r.lessonId,
        }));
        setMessages((prev) => {
          const known = new Set(prev.map((m) => m.id));
          const fresh = stored.filter((m) => !known.has(m.id));
          if (fresh.length === 0) return prev;
          // History belongs before whatever this session has already added.
          const mine = prev.filter((m) => (m.lessonId ?? null) === lessonId);
          const others = prev.filter((m) => (m.lessonId ?? null) !== lessonId);
          return [...others, ...fresh, ...mine];
        });
      })
      .catch(() => {
        // Unreadable history shouldn't block the lesson; allow a later retry.
        loadedThreadsRef.current.delete(lessonId);
      });
  }, [contextLessonId]);

  /**
   * Say something as the assistant. Defaults to the lesson in play — pass
   * `lessonId` explicitly when the message is about a lesson being opened,
   * because the ref still holds the previous one until React re-renders and a
   * message filed under the old thread would vanish as the new one takes over.
   */
  function pushAssistant(content: string, extras: Partial<AIMessage> = {}) {
    setMessages((prev) => [
      ...prev,
      {
        id: `a_${Date.now()}`,
        role: "assistant",
        content,
        timestamp: new Date().toISOString(),
        lessonId: contextLessonRef.current,
        ...extras,
      },
    ]);
  }

  function pushUser(content: string) {
    setMessages((prev) => [
      ...prev,
      {
        id: `u_${Date.now()}`,
        role: "user",
        content,
        timestamp: new Date().toISOString(),
        lessonId: contextLessonRef.current,
      },
    ]);
  }

  // Wipe this lesson's conversation, on the server and on screen. Other
  // lessons' threads are untouched.
  async function clearThread(onError: (message: string) => void) {
    const lessonId = contextLessonRef.current;
    if (!lessonId) return;
    setMessages((prev) => prev.filter((m) => (m.lessonId ?? null) !== lessonId));
    try {
      await clearChatMessages(lessonId);
    } catch {
      onError("I couldn't clear this lesson's chat just now. Please try again.");
    }
  }

  return {
    messages,
    setMessages,
    visibleMessages,
    contextLessonRef,
    pushAssistant,
    pushUser,
    clearThread,
  };
}
