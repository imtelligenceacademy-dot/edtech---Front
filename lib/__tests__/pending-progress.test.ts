/**
 * Progress saves that could not reach the server, held until they can.
 *
 * On an unreliable connection a teacher pressed Mark complete, the request
 * never arrived, and the save was gone — "Couldn't save progress." and nothing
 * else. These hold the rules that make keeping it safe: only a request with no
 * answer is held (a refusal stays a refusal), a completion is never replaced
 * by a later page, and a save is only ever sent as the account that made it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearPendingProgress,
  flushPendingProgress,
  pendingProgressCount,
  PROGRESS_SYNCED_EVENT,
  saveProgressOrQueue,
} from "@/lib/pending-progress";

// A token shaped like the server's. Only the payload is read in the browser.
function tokenFor(accountId: string): string {
  const part = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${part({ alg: "HS256" })}.${part({ sub: accountId })}.signature`;
}

function signInAs(accountId: string) {
  window.localStorage.setItem("imt_access_token", tokenFor(accountId));
}

const noConnection = () =>
  vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => {
    throw new TypeError("Failed to fetch");
  });

function answer(status: number, body: object) {
  return vi.fn(
    async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      })
  );
}

const SAVED = { lessonId: "les_1", percentComplete: 100, completed: true };

function sentBodies(fetchMock: ReturnType<typeof answer>) {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
}

beforeEach(() => {
  signInAs("u_rania");
});

afterEach(() => {
  clearPendingProgress();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("a save the server never received", () => {
  it("is held rather than lost", async () => {
    vi.stubGlobal("fetch", noConnection());

    const outcome = await saveProgressOrQueue("les_1", { complete: true, section: "" });

    expect(outcome.status).toBe("queued");
    expect(pendingProgressCount()).toBe(1);
  });

  it("is sent once the server can be reached, and says so", async () => {
    vi.stubGlobal("fetch", noConnection());
    await saveProgressOrQueue("les_1", { complete: true, section: "" });

    const back = answer(200, SAVED);
    vi.stubGlobal("fetch", back);
    const synced = vi.fn();
    window.addEventListener(PROGRESS_SYNCED_EVENT, synced);

    await flushPendingProgress();
    window.removeEventListener(PROGRESS_SYNCED_EVENT, synced);

    expect(String(back.mock.calls[0][0])).toMatch(/\/api\/progress\/les_1$/);
    expect(sentBodies(back)).toEqual([{ complete: true, section: "" }]);
    expect(pendingProgressCount()).toBe(0);
    // What tells the lesson list to refresh, since a completion may have
    // unlocked the next lesson.
    expect(synced).toHaveBeenCalledTimes(1);
  });

  it("goes when the browser says the connection is back", async () => {
    vi.stubGlobal("fetch", noConnection());
    await saveProgressOrQueue("les_1", { slide: 4, total: 11, section: "" });

    const back = answer(200, SAVED);
    vi.stubGlobal("fetch", back);
    window.dispatchEvent(new Event("online"));

    await vi.waitFor(() => expect(pendingProgressCount()).toBe(0));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("stays held while the server is still out of reach", async () => {
    vi.stubGlobal("fetch", noConnection());
    await saveProgressOrQueue("les_1", { complete: true, section: "" });

    await flushPendingProgress();

    expect(pendingProgressCount()).toBe(1);
  });

  it("is held when the server's proxy fails, which a retry can fix", async () => {
    vi.stubGlobal("fetch", answer(502, { detail: "Bad gateway" }));

    const outcome = await saveProgressOrQueue("les_1", { complete: true, section: "" });

    expect(outcome.status).toBe("queued");
  });
});

describe("a save the server refused", () => {
  it("is not held — it would be refused again", async () => {
    vi.stubGlobal("fetch", answer(403, { detail: "Lesson not assigned to you" }));

    await expect(
      saveProgressOrQueue("les_1", { complete: true, section: "" })
    ).rejects.toThrow("Lesson not assigned to you");
    expect(pendingProgressCount()).toBe(0);
  });
});

describe("two saves for the same lesson while offline", () => {
  it("never lets a later page number replace a completion", async () => {
    vi.stubGlobal("fetch", noConnection());
    await saveProgressOrQueue("les_1", { complete: true, total: 11, section: "" });
    await saveProgressOrQueue("les_1", { slide: 3, total: 11, section: "" });

    const back = answer(200, SAVED);
    vi.stubGlobal("fetch", back);
    await flushPendingProgress();

    expect(sentBodies(back)).toEqual([{ complete: true, total: 11, section: "" }]);
  });

  it("sends only the latest page", async () => {
    vi.stubGlobal("fetch", noConnection());
    await saveProgressOrQueue("les_1", { slide: 3, total: 11, section: "" });
    await saveProgressOrQueue("les_1", { slide: 7, total: 11, section: "" });

    const back = answer(200, SAVED);
    vi.stubGlobal("fetch", back);
    await flushPendingProgress();

    expect(sentBodies(back)).toEqual([{ slide: 7, total: 11, section: "" }]);
  });
});

describe("a save held for one teacher", () => {
  it("is not sent after another signs in on the same browser", async () => {
    // The stored token is shared by every tab. Rania's save is held in this
    // tab; Karim signs in from another; sending now would write her progress
    // under his account.
    vi.stubGlobal("fetch", noConnection());
    await saveProgressOrQueue("les_1", { complete: true, section: "" });
    signInAs("u_karim");

    const back = answer(200, SAVED);
    vi.stubGlobal("fetch", back);
    await flushPendingProgress();

    expect(back).not.toHaveBeenCalled();
    expect(pendingProgressCount()).toBe(1);
  });

  it("is sent when she signs back in", async () => {
    vi.stubGlobal("fetch", noConnection());
    await saveProgressOrQueue("les_1", { complete: true, section: "" });
    signInAs("u_karim");
    signInAs("u_rania");

    const back = answer(200, SAVED);
    vi.stubGlobal("fetch", back);
    await flushPendingProgress();

    expect(back).toHaveBeenCalledTimes(1);
  });
});
