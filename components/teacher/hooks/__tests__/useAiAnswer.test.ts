/**
 * Which failures are worth offering a retry for.
 *
 * The hook caught every error the same way and put a "Try that question again"
 * button under all of them. Under "you've reached the hourly limit" that button
 * could only return the identical sentence — while the quota note under the
 * composer already said there were none left.
 *
 * The server now says which failures a retry could answer. A missing flag still
 * means retryable, so an older server behaves as it always did.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import { AiStreamError, streamTeacherAI } from "@/lib/api";
import { useAiAnswer } from "@/components/teacher/hooks/useAiAnswer";

// Hoisted above the imports by vitest, so the static import below binds to the
// mocked module. `importOriginal` keeps AiStreamError real — the hook checks
// against that exact class, so a stubbed one would make the test meaningless.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, streamTeacherAI: vi.fn() };
});

const streamMock = vi.mocked(streamTeacherAI);

const CONTEXT = { lessonId: "les_1", section: "A", currentSlide: null };

function harness() {
  const pushAssistant = vi.fn();
  const hook = renderHook(() =>
    useAiAnswer({
      visibleMessages: [],
      setMessages: vi.fn(),
      pushAssistant,
    })
  );
  return { ...hook, pushAssistant };
}

beforeEach(() => {
  streamMock.mockReset();
});

describe("useAiAnswer retry offer", () => {
  it("does not offer a retry for a refusal that cannot succeed", async () => {
    streamMock.mockRejectedValue(
      new AiStreamError(
        "You've reached the teacher AI assistant hourly limit (15). Please try again later.",
        false
      )
    );
    const { result, pushAssistant } = harness();

    await act(async () => {
      await result.current.ask("why is my LED not lighting?", CONTEXT);
    });

    // The teacher is still told what happened — only the useless button goes.
    expect(pushAssistant).toHaveBeenCalledWith(
      expect.stringContaining("reached"),
      expect.anything()
    );
    await waitFor(() => expect(result.current.failedPrompt).toBeNull());
    expect(result.current.failedThread).toBeNull();
  });

  it("still offers a retry when the assistant was merely busy", async () => {
    streamMock.mockRejectedValue(
      new AiStreamError("The AI assistant is busy right now.", true)
    );
    const { result } = harness();

    await act(async () => {
      await result.current.ask("explain pull-up resistors", CONTEXT);
    });

    await waitFor(() =>
      expect(result.current.failedPrompt).toBe("explain pull-up resistors")
    );
    expect(result.current.failedThread).toEqual({
      lessonId: "les_1",
      section: "A",
    });
  });

  it("offers a retry for a dropped connection, which is not a refusal", async () => {
    streamMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = harness();

    await act(async () => {
      await result.current.ask("what does slide 4 say?", CONTEXT);
    });

    await waitFor(() =>
      expect(result.current.failedPrompt).toBe("what does slide 4 say?")
    );
  });

  it("withdraws an earlier offer when the next failure cannot be retried", async () => {
    const { result } = harness();

    streamMock.mockRejectedValueOnce(
      new AiStreamError("The AI assistant is busy right now.", true)
    );
    await act(async () => {
      await result.current.ask("first question", CONTEXT);
    });
    await waitFor(() => expect(result.current.failedPrompt).toBe("first question"));

    streamMock.mockRejectedValueOnce(
      new AiStreamError("You've reached the hourly limit.", false)
    );
    await act(async () => {
      await result.current.ask("second question", CONTEXT);
    });

    // The standing offer belongs to a question the teacher can no longer ask.
    await waitFor(() => expect(result.current.failedPrompt).toBeNull());
  });
});
