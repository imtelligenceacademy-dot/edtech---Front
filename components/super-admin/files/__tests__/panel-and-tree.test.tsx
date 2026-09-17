/**
 * Two admin controls that left the screen in a state it could not leave.
 *
 * UploadPanel awaited the caller's reload outside any try, so a reload that
 * failed after the uploads had succeeded aborted the rest of the function: the
 * panel stayed "Uploading 12 of 12…" with Upload and Cancel both disabled, and
 * the per-file outcomes the admin uploaded in order to read were discarded.
 *
 * FileTree's Year and Grade Zip buttons compared the spinner against a key that
 * never matched the one the download registers (`y2` against `year-2`), so the
 * slowest action on the page showed no spinner and stayed enabled — which reads
 * as a click that missed, and invites a second full archive build.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { FileTree } from "@/components/super-admin/files/FileTree";
import { UploadPanel } from "@/components/super-admin/files/UploadPanel";
import { buildTree } from "@/lib/super-admin/files";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    uploadFile: vi.fn(async () => ({
      file: { id: "file_1", filename: "a.pdf" },
      lessonTitle: "Grade 7 lesson 01",
      assignedCount: 1,
      teacherNames: ["Rita"],
      note: null,
    })),
    previewUploads: vi.fn(async () => []),
  };
});

function pdf(name: string) {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], name, {
    type: "application/pdf",
  });
}

describe("UploadPanel", () => {
  it("does not get stuck when the reload after a successful upload fails", async () => {
    const onUploaded = vi.fn(async () => {
      throw new Error("The server is not responding.");
    });
    render(<UploadPanel onUploaded={onUploaded} />);
    const user = userEvent.setup();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, pdf("Grade 7 python lesson 01.pdf"));

    // Several controls match /upload/; the one that starts it is exact.
    const upload = await screen.findByRole("button", { name: /^Upload \d+/i });
    await user.click(upload);

    await waitFor(() => expect(onUploaded).toHaveBeenCalled());

    // The uploads happened, so the panel has to come back and say so — and say
    // that the list behind it could not be reloaded.
    await waitFor(() =>
      expect(screen.getByText(/server is not responding/i)).toBeInTheDocument()
    );
    expect(screen.queryByText(/Uploading 1 of 1/i)).not.toBeInTheDocument();
  });
});

describe("FileTree", () => {
  // Built by the real grouping function rather than hand-rolled, so the shape
  // cannot drift from what the component is actually given.
  const NODE = {
    file: {
      id: "file_1",
      filename: "Grade 7 python lesson 01.pdf",
      contentType: "application/pdf",
      sizeBytes: 4,
      createdAt: "2026-09-01T10:00:00Z",
    },
    year: 2,
    grade: 7,
    lang: "en" as const,
    course: "python",
    lessonNo: 1,
    label: "lesson 01",
    haystack: "grade 7 python lesson 01.pdf",
  };
  const TREE = buildTree([NODE as never]);

  function handlers(downloading: string | null) {
    return {
      selected: new Set<string>(),
      onToggleFile: vi.fn(),
      onToggleGroup: vi.fn(),
      onDownloadGroup: vi.fn(),
      onDownloadFile: vi.fn(),
      onDelete: vi.fn(),
      isOpen: () => true,
      onToggleOpen: vi.fn(),
      downloading,
      deleting: null,
    };
  }

  it("shows the year Zip as busy while that year is downloading", () => {
    // `year-2` is the label the click actually registers.
    render(<FileTree tree={TREE} h={handlers("year-2") as never} />);

    const zips = screen.getAllByRole("button", { name: /zip/i });
    expect(zips.some((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it("leaves the Zip buttons alone when nothing is downloading", () => {
    render(<FileTree tree={TREE} h={handlers(null) as never} />);

    const zips = screen.getAllByRole("button", { name: /zip/i });
    expect(zips.every((b) => !(b as HTMLButtonElement).disabled)).toBe(true);
  });

  it("registers the same label it watches for", async () => {
    const h = handlers(null);
    render(<FileTree tree={TREE} h={h as never} />);
    const user = userEvent.setup();

    const zips = screen.getAllByRole("button", { name: /zip/i });
    await user.click(zips[0]);

    // The label handed to the download is what the busy check compares against.
    // They were written out separately and disagreed.
    expect(h.onDownloadGroup).toHaveBeenCalledWith(expect.anything(), "year-2");
  });
});
