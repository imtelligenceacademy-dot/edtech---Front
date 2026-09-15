/**
 * What the PDF loader does when it is switched off mid-load.
 *
 * `useLessonPdf` opens with `await import("pdfjs-dist")`, and that yields. The
 * viewer decides whether to hand the file to the phone's own PDF app in an
 * effect that runs during exactly that gap, so on a phone this hook is always
 * switched off while it is waiting there. With no check afterwards the whole
 * PDF was fetched and thrown away, and the native branch then fetched the same
 * file again — two full downloads per lesson opened, on school wifi.
 *
 * The same shape, one await later, leaked a parsed document: cancel between
 * `getDocument` resolving and the ref assignment and cleanup had nothing to
 * destroy, so the document and its pdf.js worker stayed alive for the life of
 * the tab.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const fetchLessonPdf = vi.fn();
const getDocument = vi.fn();
const destroy = vi.fn();

vi.mock("@/lib/api", () => ({
  fetchLessonPdf: (...args: unknown[]) => fetchLessonPdf(...args),
}));

vi.mock("pdfjs-dist", () => ({
  version: "4.0.0",
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: (...args: unknown[]) => getDocument(...args),
}));

import { useLessonPdf } from "@/components/lesson-viewer/useLessonPdf";

afterEach(() => {
  vi.clearAllMocks();
});

/** A document that reports one page, and records being destroyed. */
function aDocument() {
  return {
    numPages: 1,
    getPage: async () => ({
      getViewport: () => ({ width: 800, height: 600 }),
      cleanup: () => {},
    }),
    destroy,
  };
}

describe("when the viewer is switched off while the loader is waiting", () => {
  it("does not fetch a PDF nobody is going to render", async () => {
    fetchLessonPdf.mockResolvedValue(new Uint8Array([1]));
    getDocument.mockReturnValue({ promise: Promise.resolve(aDocument()) });

    // Mounted enabled, then switched off before the dynamic import resolves —
    // which is the ordering a phone produces on every single lesson open.
    const { unmount } = renderHook(() => useLessonPdf("file_1", true));
    unmount();

    await new Promise((r) => setTimeout(r, 20));

    expect(fetchLessonPdf).not.toHaveBeenCalled();
  });

  it("destroys a document it is not going to keep", async () => {
    fetchLessonPdf.mockResolvedValue(new Uint8Array([1]));
    let release: (doc: unknown) => void = () => {};
    getDocument.mockReturnValue({
      promise: new Promise((res) => {
        release = res;
      }),
    });

    const { unmount } = renderHook(() => useLessonPdf("file_2", true));
    // Let the import and the fetch through, so the hook is waiting on the parse.
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchLessonPdf).toHaveBeenCalledTimes(1);

    unmount();
    release(aDocument());
    await new Promise((r) => setTimeout(r, 20));

    expect(destroy).toHaveBeenCalled();
  });
});

describe("when it is left alone", () => {
  it("loads the document and measures its pages", async () => {
    fetchLessonPdf.mockResolvedValue(new Uint8Array([1]));
    getDocument.mockReturnValue({ promise: Promise.resolve(aDocument()) });

    const { result } = renderHook(() => useLessonPdf("file_3", true));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.total).toBe(1);
    expect(fetchLessonPdf).toHaveBeenCalledWith("file_3");
  });

  it("fetches nothing at all when it starts disabled", async () => {
    renderHook(() => useLessonPdf("file_4", false));

    await new Promise((r) => setTimeout(r, 20));

    expect(fetchLessonPdf).not.toHaveBeenCalled();
  });
});
