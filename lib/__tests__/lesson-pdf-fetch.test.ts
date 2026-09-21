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

import { downloadLessonPdf, fetchLessonPdf, fileDownloadUrl, fileViewUrl } from "@/lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
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
