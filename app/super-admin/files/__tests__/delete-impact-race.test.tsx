/**
 * The delete dialog has to describe the selection it is about to delete.
 *
 * Opening it asks the server what the selection costs, and two of those
 * questions can be outstanding at once: Cancel stays live while the first is
 * loading, so an admin who gives up on a slow one and deletes something else
 * has both in flight. Answers are not required to come back in the order they
 * were asked, and the slower one landing second used to overwrite the newer —
 * putting a description of one selection in front of a Delete button holding
 * another.
 *
 * That is the worst possible direction for it to fail in, because the
 * reassuring answer is the small one: "these files aren't linked to any lesson,
 * so nothing else is affected", shown over a folder that takes its lessons,
 * progress and chat history with it.
 *
 * The guard itself is tested in lib/__tests__/use-latest-only.test.ts, against
 * the hook the page actually calls. What is checked here is the other half:
 * that the dialog does not soften a large answer, and does not offer Delete
 * before it has one.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DeleteImpactModal } from "@/components/super-admin/files/DeleteImpactModal";
import type { DeletionImpact } from "@/lib/api";

afterEach(cleanup);

/** One stray PDF linked to nothing. The reassuring answer. */
const UNLINKED: DeletionImpact = {
  files: 1,
  lessons: 0,
  teachers: 0,
  assignments: 0,
  progress: 0,
  chatMessages: 0,
  accessRequests: 0,
  lessonsInProgress: 0,
  lessonTitles: [],
  missing: 0,
};

/** A whole grade's folder. The answer that has to be the one on screen. */
const A_WHOLE_GRADE: DeletionImpact = {
  files: 40,
  lessons: 12,
  teachers: 5,
  assignments: 60,
  progress: 318,
  chatMessages: 94,
  accessRequests: 3,
  lessonsInProgress: 7,
  lessonTitles: ["Grade 7 python lesson 01", "Grade 7 python lesson 02"],
  missing: 0,
};

describe("what the dialog says about each answer", () => {
  it("does not claim a folder is unlinked", async () => {
    render(
      <DeleteImpactModal
        open
        onClose={() => {}}
        impact={A_WHOLE_GRADE}
        loading={false}
        busy={false}
        error={null}
        onConfirm={() => {}}
      />
    );

    expect(screen.queryByText(/nothing else is affected/i)).not.toBeInTheDocument();
    expect(screen.getByText(/12/)).toBeInTheDocument();
  });

  it("keeps Delete disabled until a real answer has arrived", async () => {
    const onConfirm = vi.fn();
    render(
      <DeleteImpactModal
        open
        onClose={() => {}}
        impact={null}
        loading
        busy={false}
        error={null}
        onConfirm={onConfirm}
      />
    );

    const del = screen
      .getAllByRole("button")
      .find((b) => /delete/i.test(b.textContent ?? ""));
    expect(del).toBeDefined();
    expect(del).toBeDisabled();

    await userEvent.click(del!, { pointerEventsCheck: 0 });
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
