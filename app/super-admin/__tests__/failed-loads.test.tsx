/**
 * Two screens that said something untrue while also saying the load failed.
 *
 * AI Usage treated `!report` as "still loading", and a failed load leaves it
 * null for good — so the page animated its loading skeleton for ever,
 * underneath the red card explaining what had gone wrong. Try again, fail
 * again, and it does the same.
 *
 * Progress rendered its empty state whenever there were no teachers in hand,
 * which after a failed load is always. So the page carried two claims at once:
 * a banner saying it could not load, and a card saying the platform has no
 * teacher accounts on it. One of them was a fact about the request and the
 * other was presented as a fact about the business.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const getTeacherAiUsage = vi.fn();
const listSchools = vi.fn();
const listUsers = vi.fn();
const listLessons = vi.fn();
const listProgress = vi.fn();

vi.mock("@/lib/api", () => ({
  getTeacherAiUsage: (...a: unknown[]) => getTeacherAiUsage(...a),
  listSchools: (...a: unknown[]) => listSchools(...a),
  listUsers: (...a: unknown[]) => listUsers(...a),
  listLessons: (...a: unknown[]) => listLessons(...a),
  listProgress: (...a: unknown[]) => listProgress(...a),
}));

import AiUsagePage from "@/app/super-admin/ai-usage/page";
import ProgressPage from "@/app/super-admin/progress/page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** The animated placeholder, which has no text of its own to find. */
function skeletons(container: HTMLElement) {
  return container.querySelectorAll(".animate-pulse");
}

describe("AI Usage, when it cannot load", () => {
  it("stops pretending to load", async () => {
    getTeacherAiUsage.mockRejectedValue(new Error("The server is not responding."));
    listSchools.mockResolvedValue([]);

    const { container } = render(<AiUsagePage />);

    await waitFor(() =>
      expect(screen.getByText(/server is not responding/i)).toBeInTheDocument()
    );
    expect(skeletons(container)).toHaveLength(0);
  });

  it("still shows the skeleton while it really is loading", async () => {
    getTeacherAiUsage.mockReturnValue(new Promise(() => {}));
    listSchools.mockResolvedValue([]);

    const { container } = render(<AiUsagePage />);

    expect(skeletons(container).length).toBeGreaterThan(0);
  });
});

describe("Progress, when it cannot load", () => {
  it("does not also claim the platform has no teachers", async () => {
    listUsers.mockRejectedValue(new Error("Your session has expired."));
    listSchools.mockResolvedValue([]);
    listLessons.mockResolvedValue([]);
    listProgress.mockResolvedValue([]);

    render(<ProgressPage />);

    await waitFor(() =>
      expect(screen.getByText(/session has expired/i)).toBeInTheDocument()
    );
    expect(screen.queryByText(/No teachers yet/i)).not.toBeInTheDocument();
  });

  it("still says so when there genuinely are none", async () => {
    listUsers.mockResolvedValue([]);
    listSchools.mockResolvedValue([]);
    listLessons.mockResolvedValue([]);
    listProgress.mockResolvedValue([]);

    render(<ProgressPage />);

    await waitFor(() =>
      expect(screen.getByText(/No teachers yet/i)).toBeInTheDocument()
    );
  });
});
