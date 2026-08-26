"use client";

import { useRef, useState } from "react";
import { streamTeacherAI } from "@/lib/api";
import type { AIMessage } from "@/types";

type Thread = {
  /** This lesson's turns, oldest first — the conversation the model is given. */
  visibleMessages: AIMessage[];
  setMessages: React.Dispatch<React.SetStateAction<AIMessage[]>>;
  pushAssistant: (content: string, extras?: Partial<AIMessage>) => void;
};

/**
 * One question, streamed. Owns everything about a reply in flight: whether one
 * is running, stopping it, and re-asking the last one that failed.
 *
 * The reply is appended to the thread as it arrives, so a teacher reads it while
 * it is still being written.
 */
export function useAiAnswer(thread: Thread) {
  const [thinking, setThinking] = useState(false);
  const [streaming, setStreaming] = useState(false);
  // Kept so a failed turn can be retried without the teacher retyping it.
  const [failedPrompt, setFailedPrompt] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // `retry` re-asks a question that's already in the transcript, so the failed
  // turn (and its error reply) must be trimmed off the history first.
  async function ask(
    text: string,
    context: { lessonId: string | null; currentSlide: number | null },
    retry = false
  ) {
    const { visibleMessages, setMessages, pushAssistant } = thread;
    let prior = visibleMessages;
    if (retry) {
      prior = [...visibleMessages];
      while (prior.length && prior[prior.length - 1].role === "assistant") prior.pop();
      if (prior.length && prior[prior.length - 1].role === "user") prior.pop();
    }
    // Prior turns become the conversation history; the backend appends `text`.
    const history = prior
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }));
    const assistantId = `a_${Date.now()}`;
    const threadId = context.lessonId;
    let started = false;
    let sourceRef: string | undefined;
    const controller = new AbortController();
    abortRef.current = controller;
    setThinking(true);
    setStreaming(true);

    try {
      await streamTeacherAI(
        {
          message: text,
          lessonId: context.lessonId,
          currentSlide: context.currentSlide,
          history,
        },
        {
          signal: controller.signal,
          onMeta: (m) => {
            sourceRef = m.sourceRef;
          },
          onDelta: (delta) => {
            if (!started) {
              started = true;
              setThinking(false);
              setMessages((prev) => [
                ...prev,
                {
                  id: assistantId,
                  role: "assistant",
                  content: delta,
                  timestamp: new Date().toISOString(),
                  lessonId: threadId,
                },
              ]);
            } else {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: m.content + delta } : m
                )
              );
            }
          },
        }
      );
      // Attach the lesson reference once the stream completes.
      if (started && sourceRef) {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, sourceRef } : m))
        );
      }
      if (!started) {
        pushAssistant("I didn't get a response. Please try again.");
        setFailedPrompt(text);
      }
    } catch (err) {
      // Stopped on purpose — keep whatever streamed in and say nothing.
      if (controller.signal.aborted) return;
      // The backend sends a specific, already-safe reason (usage limit reached,
      // provider unavailable, timed out...). Prefer it over a generic line so the
      // teacher knows whether to retry now, wait, or ask an administrator.
      const reason = err instanceof Error ? err.message.trim() : "";
      const isNetwork =
        !reason || /failed to fetch|networkerror|load failed/i.test(reason);
      pushAssistant(
        isNetwork
          ? "I couldn't reach the assistant. Please check your connection and try again."
          : reason
      );
      setFailedPrompt(text);
    } finally {
      setThinking(false);
      setStreaming(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  // Abandon the reply in flight. Whatever already streamed in stays on screen.
  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setThinking(false);
    setStreaming(false);
  }

  // Re-ask the last question that failed, dropping the error reply.
  function retryLast(context: { lessonId: string | null; currentSlide: number | null }) {
    const text = failedPrompt;
    if (!text) return;
    setFailedPrompt(null);
    thread.setMessages((prev) => {
      const next = [...prev];
      if (next.length && next[next.length - 1].role === "assistant") next.pop();
      return next;
    });
    void ask(text, context, true);
  }

  return {
    thinking,
    setThinking,
    streaming,
    failedPrompt,
    setFailedPrompt,
    ask,
    stop,
    retryLast,
  };
}
