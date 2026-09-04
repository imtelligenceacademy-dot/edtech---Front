"use client";

import { useEffect, useRef, useState } from "react";
import { clearChatMessages, listChatMessages } from "@/lib/api";
import type { AIMessage } from "@/types";

/**
 * The conversation, one thread per lesson per class.
 *
 * Every turn carries the lesson AND the class it belongs to, so switching
 * either switches what is on screen without losing what was said elsewhere. A
 * teacher who takes 6A and 6B teaches the same lesson twice and asks different
 * things in each room; what was asked in 6A must not reappear when the lesson
 * is opened for 6B.
 *
 * The class matters here and not only on the server, because moving between
 * /teacher/grade-6/A and /teacher/grade-6/B re-renders this component rather
 * than remounting it — the messages already in memory survive the move, and
 * filtering by lesson alone would show them to the wrong class.
 *
 * Threads are pulled from the server the first time a lesson-and-class comes
 * into play, then kept in memory for the rest of the session.
 */
export function useChatThread(contextLessonId: string | null, section: string = "") {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  // Threads already pulled from the server this session.
  const loadedThreadsRef = useRef<Set<string>>(new Set());
  // The lesson in play, readable from callbacks that run outside render.
  const contextLessonRef = useRef<string | null>(null);
  contextLessonRef.current = contextLessonId;

  // The class in play, readable from callbacks that run outside render.
  const sectionRef = useRef<string>("");
  sectionRef.current = section;

  // Only this lesson's turns, in this class, are on screen; the rest stay in
  // memory for when the teacher switches back.
  const visibleMessages = messages.filter(
    (m) => (m.lessonId ?? null) === contextLessonId && (m.section ?? "") === section
  );

  // Pull the stored thread for the lesson in play, once per lesson. Local
  // turns (the app's own "Opening ..." lines, and anything asked since) keep
  // their place because both are tagged with the same lesson.
  useEffect(() => {
    if (!contextLessonId) return;
    const lessonId = contextLessonId;
    const forClass = section;
    const key = `${forClass}|${lessonId}`;
    if (loadedThreadsRef.current.has(key)) return;
    loadedThreadsRef.current.add(key);
    // No cancellation guard on purpose: React remounts effects in development,
    // and throwing away a resolved fetch would leave the thread empty. The
    // merge below is keyed by message id, so applying it twice is a no-op.
    listChatMessages(lessonId, forClass)
      .then((rows) => {
        if (rows.length === 0) return;
        const stored: AIMessage[] = rows.map((r) => ({
          id: r.id,
          role: r.role,
          content: r.content,
          timestamp: r.createdAt,
          sourceRef: r.sourceRef ?? undefined,
          lessonId: r.lessonId,
          section: r.section ?? "",
        }));
        setMessages((prev) => {
          const known = new Set(prev.map((m) => m.id));
          const fresh = stored.filter((m) => !known.has(m.id));
          if (fresh.length === 0) return prev;
          // History belongs before whatever this session has already added.
          const isThisThread = (m: AIMessage) =>
            (m.lessonId ?? null) === lessonId && (m.section ?? "") === forClass;
          const mine = prev.filter(isThisThread);
          const others = prev.filter((m) => !isThisThread(m));
          return [...others, ...fresh, ...mine];
        });
      })
      .catch(() => {
        // Unreadable history shouldn't block the lesson; allow a later retry.
        loadedThreadsRef.current.delete(key);
      });
  }, [contextLessonId, section]);

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
        section: sectionRef.current,
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
        section: sectionRef.current,
      },
    ]);
  }

  // Wipe this class's conversation about this lesson, on the server and on
  // screen. Other lessons, and the same lesson in the teacher's other classes,
  // are untouched.
  async function clearThread(onError: (message: string) => void) {
    const lessonId = contextLessonRef.current;
    if (!lessonId) return;
    const forClass = sectionRef.current;
    setMessages((prev) =>
      prev.filter(
        (m) => (m.lessonId ?? null) !== lessonId || (m.section ?? "") !== forClass
      )
    );
    try {
      await clearChatMessages(lessonId, forClass);
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
