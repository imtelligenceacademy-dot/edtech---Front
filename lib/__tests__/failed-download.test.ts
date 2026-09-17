/**
 * What a failed binary download says, and what it cleans up.
 *
 * Five helpers each threw a sentence of their own on any non-OK response,
 * throwing away the status and whatever the server said. One expired session
 * therefore read as "Could not generate the backup." on one button, "Could not
 * build the PDF archive." on the button beside it, and "Could not export the
 * chat history." on another screen — all three of which sound like a server
 * fault, so the admin retried instead of signing in. The dead token was left in
 * localStorage as well, which keeps bouncing them back into an app they can no
 * longer talk to.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, downloadChatExport, downloadDatabase } from "@/lib/api";

const ACCESS_TOKEN_KEY = "imt_access_token";
const ROLE_KEY = "imt_role";

function respond(status: number, body: string, contentType = "application/json") {
  return new Response(body, { status, headers: { "Content-Type": contentType } });
}

beforeEach(() => {
  window.localStorage.setItem(ACCESS_TOKEN_KEY, "stale-token");
  window.localStorage.setItem(ROLE_KEY, "super-admin");
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("a download that fails", () => {
  it("says what the server said, not what the caller guessed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond(409, JSON.stringify({ detail: "A backup is already running." })))
    );

    await expect(downloadDatabase()).rejects.toThrow("A backup is already running.");
  });

  it("keeps the status, so callers can tell an outage from a refusal", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(503, "")));

    await expect(downloadDatabase()).rejects.toMatchObject({
      name: "ApiError",
      status: 503,
    });
  });

  it("calls an expired session an expired session", async () => {
    // The refresh cannot rescue it either.
    vi.stubGlobal("fetch", vi.fn(async () => respond(401, "")));

    await expect(downloadChatExport()).rejects.toThrow(/session has expired/i);
  });

  it("drops the dead token, so the app stops bouncing them back in", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(401, "")));

    await expect(downloadChatExport()).rejects.toBeInstanceOf(ApiError);

    expect(window.localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(window.localStorage.getItem(ROLE_KEY)).toBeNull();
  });

  it("survives a body that is not JSON at all", async () => {
    // What a proxy returns when the request never reached the API.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond(502, "<html><body>Bad Gateway</body></html>", "text/html"))
    );

    await expect(downloadDatabase()).rejects.toThrow(/server is not responding/i);
  });

  it("leaves a good token alone on an unrelated failure", async () => {
    // The control: only a 401 means the token is dead.
    vi.stubGlobal("fetch", vi.fn(async () => respond(500, "")));

    await expect(downloadDatabase()).rejects.toBeInstanceOf(ApiError);
    expect(window.localStorage.getItem(ACCESS_TOKEN_KEY)).toBe("stale-token");
  });
});
