"use client";

import { useRef, useState } from "react";
import { AiStreamError, streamTeacherAI } from "@/lib/api";
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
  // Kept so a failed turn can be retried without the teacher retyping it —
  // with the thread it belongs to, because a teacher can switch lesson or class
  // while the retry button is still on screen. Re-asking with whatever context
  // is current would send a Grade 5 question into Grade 7's thread and store
  // the answer there.
  const [failed, setFailed] = useState<{
    text: string;
    lessonId: string | null;
    section: string;
  } | null>(null);
  const failedPrompt = failed?.text ?? null;
  const abortRef = useRef<AbortController | null>(null);

  /** Drop the pending retry offer. Setting one is `ask`'s job: it is the only
   *  place that knows which thread the failure belongs to. */
  function clearFailedPrompt() {
    setFailed(null);
  }

  // `retry` re-asks a question that's already in the transcript, so the failed
  // turn (and its error reply) must be trimmed off the history first.
  async function ask(
    text: string,
    context: { lessonId: string | null; section: string; currentSlide: number | null },
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
    // Held alongside the lesson: both together decide which thread the reply
    // lands in, and the teacher can switch class while it streams.
    const threadSection = context.section;
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
          section: context.section,
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
                  section: threadSection,
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
        pushAssistant("I didn't get a response. Please try again.", {
          lessonId: threadId,
          section: threadSection,
        });
        setFailed({ text, lessonId: threadId, section: threadSection });
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
      // Tagged with the thread that failed rather than the one on screen now:
      // a failure that lands after the teacher has moved on belongs to the
      // conversation that asked, not the one they are reading.
      pushAssistant(
        isNetwork
          ? "I couldn't reach the assistant. Please check your connection and try again."
          : reason,
        { lessonId: threadId, section: threadSection }
      );
      // Offer the retry only for a failure that could answer differently. The
      // server says which — a busy provider yes, a spent allowance or a refused
      // request no — and anything that isn't an assistant failure at all (a
      // dropped connection) is worth another go by default.
      //
      // Offered for everything, the button sat directly under "you've reached
      // the hourly limit" and returned that same sentence, while the quota note
      // under the composer already said there were none left.
      if (!(err instanceof AiStreamError) || err.retryable) {
        setFailed({ text, lessonId: threadId, section: threadSection });
      } else {
        // Clear any earlier offer too: it belongs to a question the teacher can
        // no longer ask.
        setFailed(null);
      }
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
  //
  // Re-asked in the thread it was asked in, and the error reply is trimmed from
  // that thread — `prev` holds every lesson's turns, so popping its last entry
  // deleted whatever the teacher had most recently seen somewhere else.
  function retryLast(context: {
    lessonId: string | null;
    section: string;
    currentSlide: number | null;
  }) {
    if (!failed) return;
    const { text, lessonId, section } = failed;
    setFailed(null);
    thread.setMessages((prev) => {
      const mine = (m: AIMessage) =>
        (m.lessonId ?? null) === lessonId && (m.section ?? "") === section;
      let lastIndex = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (mine(prev[i])) {
          lastIndex = i;
          break;
        }
      }
      if (lastIndex === -1 || prev[lastIndex].role !== "assistant") return prev;
      return prev.filter((_, i) => i !== lastIndex);
    });
    void ask(text, { ...context, lessonId, section }, true);
  }

  return {
    thinking,
    setThinking,
    streaming,
    failedPrompt,
    /** The lesson and class the failed question belongs to, so the retry
     *  button appears under that conversation and no other. */
    failedThread: failed ? { lessonId: failed.lessonId, section: failed.section } : null,
    clearFailedPrompt,
    ask,
    stop,
    retryLast,
  };
}
