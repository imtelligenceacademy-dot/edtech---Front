/**
 * What an admin is told when a request fails.
 *
 * `parseResponse` ran `JSON.parse` on the body *before* looking at the status.
 * A body that is not JSON is exactly what a proxy returns when the request
 * never reached the API — an HTML 502 or 504 page — so the parse threw a
 * SyntaxError which then stood in for the real failure. Every error card on
 * every admin screen read `Unexpected token '<', "<html>..." is not valid
 * JSON`, including the Files delete dialog, where that string appeared in the
 * place where the explanation of what a delete removes was supposed to be.
 *
 * The status was discarded entirely too, so nothing downstream could tell a
 * 403 from a 500, and the only fallback sentence was "Request failed. Please
 * try again." for all of them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiFetch } from "@/lib/api";

function respondWith(body: string, status: number, ok = status < 400) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    text: async () => body,
  } as unknown as Response);
}

beforeEach(() => {
  vi.stubGlobal("fetch", respondWith("{}", 200));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a failure the API explained itself", () => {
  it("passes the explanation through untouched", async () => {
    vi.stubGlobal(
      "fetch",
      respondWith(JSON.stringify({ detail: "School still has 3 lessons." }), 409)
    );

    await expect(apiFetch("/api/schools/sch_1")).rejects.toThrow(
      "School still has 3 lessons."
    );
  });

  it("keeps the status on the error", async () => {
    vi.stubGlobal("fetch", respondWith(JSON.stringify({ detail: "Nope" }), 403));

    await expect(apiFetch("/api/x")).rejects.toMatchObject({
      status: 403,
      message: "Nope",
    });
  });
});

describe("a failure that never reached the API", () => {
  it("does not report an HTML error page as a JSON syntax problem", async () => {
    const html = "<html><head><title>502 Bad Gateway</title></head><body></body></html>";
    vi.stubGlobal("fetch", respondWith(html, 502));

    const err = (await apiFetch("/api/schools").catch((e) => e)) as ApiError;

    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).not.toMatch(/JSON/i);
    expect(err.message).not.toMatch(/Unexpected token/i);
    expect(err.message).toMatch(/not responding/i);
    expect(err.status).toBe(502);
  });

  it("says something different for a refusal than for an outage", async () => {
    vi.stubGlobal("fetch", respondWith("Forbidden", 403));
    const forbidden = (await apiFetch("/api/x").catch((e) => e)) as ApiError;

    vi.stubGlobal("fetch", respondWith("", 500));
    const broken = (await apiFetch("/api/x").catch((e) => e)) as ApiError;

    expect(forbidden.message).not.toEqual(broken.message);
  });

  it("handles an empty body without inventing a parse error", async () => {
    vi.stubGlobal("fetch", respondWith("", 404));

    const err = (await apiFetch("/api/x").catch((e) => e)) as ApiError;

    expect(err.status).toBe(404);
    expect(err.message).not.toMatch(/JSON/i);
  });
});

describe("a request that worked", () => {
  it("returns the parsed body", async () => {
    vi.stubGlobal("fetch", respondWith(JSON.stringify({ id: "sch_1" }), 200));

    await expect(apiFetch<{ id: string }>("/api/schools/sch_1")).resolves.toEqual({
      id: "sch_1",
    });
  });

  it("returns nothing for a 204 without touching the body", async () => {
    vi.stubGlobal("fetch", respondWith("", 204));

    await expect(apiFetch("/api/schools/sch_1")).resolves.toBeUndefined();
  });
});
