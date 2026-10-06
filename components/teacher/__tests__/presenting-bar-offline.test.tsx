/**
 * Saving from the classroom controls with no connection.
 *
 * The bar used to say "Couldn't save just now." and drop the save. It now
 * holds it, says so, and does not claim the lesson is finished: the next one
 * unlocks only once the server hears about it, and pretending otherwise sends
 * the teacher looking for a lesson that is still locked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { PresentingBar } from "@/components/teacher/PresentingBar";
import { clearPendingProgress, pendingProgressCount } from "@/lib/pending-progress";
import type { Lesson } from "@/types";

const LESSON = { id: "les_1", title: "grade 8 microbit lesson 01 name badge" } as Lesson;

function tokenFor(accountId: string): string {
  const part = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${part({ alg: "HS256" })}.${part({ sub: accountId })}.signature`;
}

function bar(onCompleted = vi.fn()) {
  render(
    <PresentingBar
      lesson={LESSON}
      section=""
      page={4}
      total={11}
      onPrev={() => {}}
      onNext={() => {}}
      onStop={() => {}}
      onCompleted={onCompleted}
      light
    />
  );
  return onCompleted;
}

beforeEach(() => {
  window.localStorage.setItem("imt_access_token", tokenFor("u_rania"));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    })
  );
});

afterEach(() => {
  clearPendingProgress();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("saving from the presenting bar with no connection", () => {
  it("keeps the page she stopped at, and says it will sync", async () => {
    bar();

    fireEvent.click(screen.getByText("Save progress"));

    expect(await screen.findByText(/page 4 saved on this device/i)).toBeInTheDocument();
    expect(pendingProgressCount()).toBe(1);
  });

  it("keeps a completion without claiming the lesson is done", async () => {
    const onCompleted = bar();

    fireEvent.click(screen.getByText("Mark complete"));
    fireEvent.click(screen.getByText("Yes, complete it"));

    expect(await screen.findByText(/marked complete on this device/i)).toBeInTheDocument();
    expect(pendingProgressCount()).toBe(1);
    expect(onCompleted).not.toHaveBeenCalled();
  });
});
