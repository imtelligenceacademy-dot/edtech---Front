/**
 * Which URL the lesson reader asks for, and what it says when nothing answers.
 *
 * A teacher opened a Grade 1 lesson in Edge and got a red icon and "Failed to
 * fetch". The file was fine and so was her account: Internet Download Manager's
 * extension had claimed the request and cancelled the page's own, so `fetch`
 * rejected before a byte arrived. IDM matches on two things and the old reader
 * handed it both — a URL ending in `/download` and a `Content-Disposition`
 * header. `/view` has neither.
 *
 * The saving paths keep `/download`, because a file an admin saves should carry
 * its name. That split is what these tests hold in place: it is one small edit
 * to "tidy" the reader back onto the URL everything else uses.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearLessonPdfCache,
  downloadLessonPdf,
  fetchLessonPdf,
  fileDownloadUrl,
  fileViewUrl,
  logout,
} from "@/lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  // The tab's kept PDFs are module state and would otherwise carry over, so
  // a test expecting a download would be handed the previous test's copy.
  clearLessonPdfCache();
});

function pdfResponse() {
  return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
    status: 200,
    headers: { "Content-Type": "application/pdf" },
  });
}

describe("the URLs themselves", () => {
  it("keeps the reader's and the saver's apart", () => {
    expect(fileViewUrl("file_1")).toMatch(/\/api\/files\/file_1\/view$/);
    expect(fileDownloadUrl("file_1")).toMatch(/\/api\/files\/file_1\/download$/);
  });
});

describe("fetchLessonPdf", () => {
  it("reads from /view, so a download manager has nothing to match on", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => pdfResponse());
    vi.stubGlobal("fetch", fetchMock);

    await fetchLessonPdf("file_95137e81a877adc9");

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toMatch(/\/view$/);
    expect(url).not.toMatch(/\/download$/);
  });

  it("names the likely cause when the request never lands", async () => {
    // What the browser actually throws when an extension cancels the request:
    // a bare TypeError, no response, no status to read.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );

    await expect(fetchLessonPdf("file_1")).rejects.toThrow(/download manager/i);
    await expect(fetchLessonPdf("file_1")).rejects.not.toThrow(/^Failed to fetch$/);
  });
});

describe("downloadLessonPdf", () => {
  it("still asks for /download, where the file comes back named", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => pdfResponse());
    vi.stubGlobal("fetch", fetchMock);
    // jsdom implements neither of these. Assign rather than `stubGlobal`:
    // `saveBlob` revokes on a `setTimeout`, which fires after the test has
    // ended and would find the stub already torn down.
    Object.assign(URL, { createObjectURL: () => "blob:fake", revokeObjectURL: () => {} });

    await downloadLessonPdf("file_1", "grade 1 microbit lesson 01 name badge.pdf");

    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/download$/);
  });
});

describe("a lesson already open in this tab", () => {
  /**
   * The teachers' plan for an unreliable connection: open the day's lessons in
   * the morning and leave the tabs open. That only holds if the PDF already on
   * the machine is the one used again — Full screen and reopening a lesson
   * each used to download the whole file again, and failed without a
   * connection.
   */
  const pdfOnly = () =>
    vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => pdfResponse());
  const noConnection = () =>
    vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => {
      throw new TypeError("Failed to fetch");
    });

  it("is not downloaded a second time", async () => {
    const fetchMock = pdfOnly();
    vi.stubGlobal("fetch", fetchMock);

    const first = await fetchLessonPdf("file_a");
    const second = await fetchLessonPdf("file_a");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new Uint8Array(second)).toEqual(new Uint8Array(first));
  });

  it("still opens after the connection has gone", async () => {
    vi.stubGlobal("fetch", pdfOnly());
    await fetchLessonPdf("file_a");

    vi.stubGlobal("fetch", noConnection());

    const again = await fetchLessonPdf("file_a");
    expect(again.byteLength).toBeGreaterThan(0);
  });

  it("hands every viewer a copy of its own", async () => {
    vi.stubGlobal("fetch", pdfOnly());
    const first = await fetchLessonPdf("file_a");

    // What PDF.js does with the buffer it is given: moves it to its worker,
    // leaving this one empty. A cache that handed out the same buffer twice
    // would give the second viewer — Full screen — a zero-byte file.
    structuredClone(first, { transfer: [first] });
    expect(first.byteLength).toBe(0);

    const second = await fetchLessonPdf("file_a");
    expect(second.byteLength).toBeGreaterThan(0);
  });

  it("shares one download between two viewers opened together", async () => {
    const fetchMock = pdfOnly();
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([fetchLessonPdf("file_a"), fetchLessonPdf("file_a")]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not keep a failure, so the next try really tries", async () => {
    vi.stubGlobal("fetch", noConnection());
    await expect(fetchLessonPdf("file_a")).rejects.toThrow();

    const fetchMock = pdfOnly();
    vi.stubGlobal("fetch", fetchMock);

    const bytes = await fetchLessonPdf("file_a");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it("is forgotten when the teacher signs out", async () => {
    // Each kept copy has her address stamped along its foot, and the next
    // person to sign in on this tab must be sent their own.
    const fetchMock = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) =>
      String(url).endsWith("/logout")
        ? new Response(JSON.stringify({ message: "ok" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        : pdfResponse()
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchLessonPdf("file_a");
    await logout();
    await fetchLessonPdf("file_a");

    const pdfRequests = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/view"));
    expect(pdfRequests).toHaveLength(2);
  });
});

describe("a lesson that was never loaded, with no connection", () => {
  it("says the teacher is offline rather than blaming a download manager", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );

    const failure = fetchLessonPdf("file_1");

    await expect(failure).rejects.toThrow(/offline/i);
    await expect(fetchLessonPdf("file_1")).rejects.not.toThrow(/download manager/i);
  });
});
