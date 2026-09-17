/**
 * Clearing a lesson's chat clears the lesson it is named after.
 *
 * `clearThread` read the lesson id from the context ref — the lesson the
 * assistant is currently grounded in. The rail's button sits inside a card
 * built from a different lesson (the one last opened, whether or not it is
 * still openable), and the two part company the moment that lesson is
 * completed: the card still shows it, the context has moved on to the next
 * openable lesson in the grade.
 *
 * The button was therefore labelled with one lesson and issued an irreversible
 * server-side delete against another.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import { clearChatMessages } from "@/lib/api";
import { useChatThread } from "@/components/teacher/hooks/useChatThread";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    clearChatMessages: vi.fn(async () => {}),
    listChatMessages: vi.fn(async () => []),
  };
});

const clearMock = vi.mocked(clearChatMessages);

beforeEach(() => {
  clearMock.mockClear();
  clearMock.mockResolvedValue(undefined as never);
});

describe("clearThread", () => {
  it("clears the lesson it is asked about, not the one in play", async () => {
    // The assistant has moved on to lesson B; the card still shows lesson A.
    const { result } = renderHook(() => useChatThread("les_b", "A"));

    await act(async () => {
      await result.current.clearThread(() => {}, "les_a");
    });

    expect(clearMock).toHaveBeenCalledWith("les_a", "A");
  });

  it("still defaults to the lesson in play when no id is named", async () => {
    const { result } = renderHook(() => useChatThread("les_b", "A"));

    await act(async () => {
      await result.current.clearThread(() => {});
    });

    expect(clearMock).toHaveBeenCalledWith("les_b", "A");
  });

  it("removes only that lesson's turns from the transcript", async () => {
    const { result } = renderHook(() => useChatThread("les_b", "A"));

    act(() => {
      result.current.setMessages([
        { id: "1", role: "user", content: "about A", lessonId: "les_a", section: "A" },
        { id: "2", role: "user", content: "about B", lessonId: "les_b", section: "A" },
        { id: "3", role: "user", content: "A, other class", lessonId: "les_a", section: "B" },
      ] as never);
    });

    await act(async () => {
      await result.current.clearThread(() => {}, "les_a");
    });

    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    const kept = result.current.messages.map((m) => m.content);
    expect(kept).toContain("about B");
    // Another class's thread for the same lesson is a different conversation.
    expect(kept).toContain("A, other class");
  });

  it("says so when the server refuses", async () => {
    clearMock.mockRejectedValue(new Error("nope"));
    const onError = vi.fn();
    const { result } = renderHook(() => useChatThread("les_b", "A"));

    await act(async () => {
      await result.current.clearThread(onError, "les_a");
    });

    expect(onError).toHaveBeenCalled();
  });

  it("does nothing at all when there is no lesson to clear", async () => {
    const { result } = renderHook(() => useChatThread(null, ""));

    await act(async () => {
      await result.current.clearThread(() => {});
    });

    expect(clearMock).not.toHaveBeenCalled();
  });
});
