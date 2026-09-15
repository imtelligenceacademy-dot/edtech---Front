/**
 * The ICT Fair panel must not show one school's sections under another's name.
 *
 * Schools do not share fair projects, and the section rows are drop targets: a
 * PDF dropped on one is filed into that section. So a stale row is not a
 * cosmetic problem, it is a project filed into the school the admin had just
 * navigated away from, where its teachers can see it and the admin who put it
 * there cannot.
 *
 * Two things had to be true and only one of them was. The rows were cleared
 * when the request *failed* — the catch block has described this exact failure
 * since it was written — and not when it succeeded, which is the path that
 * actually happens. And nothing stopped a slow answer for the previous school
 * landing after a fast one for the new school.
 *
 * This is one of the eight frontend fixes that shipped before this repo had a
 * test suite, on a careful read alone. The read was right; this is the proof.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const listSchools = vi.fn();
const listFairSections = vi.fn();
const listUnfiledFairProjects = vi.fn();

vi.mock("@/lib/api", () => ({
  listSchools: (...a: unknown[]) => listSchools(...a),
  listFairSections: (...a: unknown[]) => listFairSections(...a),
  listUnfiledFairProjects: (...a: unknown[]) => listUnfiledFairProjects(...a),
  createFairSection: vi.fn(),
  deleteFairProject: vi.fn(),
  deleteFairSection: vi.fn(),
  downloadFileSelection: vi.fn(),
  downloadLessonPdf: vi.fn(),
  fileDownloadUrl: (id: string) => `/files/${id}`,
  updateFairProject: vi.fn(),
  updateFairSection: vi.fn(),
  uploadFairProject: vi.fn(),
}));

import { FairPanel } from "@/components/super-admin/files/FairPanel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const SCHOOLS = [
  { id: "sch_a", name: "Balamand" },
  { id: "sch_b", name: "Elsewhere" },
];

const section = (id: string, title: string) => ({
  id,
  schoolId: id,
  title,
  blurb: null,
  grades: ["G7"],
  projects: [],
});

const A_SECTIONS = [section("fsec_a", "Smart Home")];
const B_SECTIONS = [section("fsec_b", "Weather Station")];

async function pick(schoolName: string) {
  const select = await screen.findByRole("combobox");
  await userEvent.selectOptions(
    select,
    screen.getByRole("option", { name: new RegExp(schoolName, "i") })
  );
}

describe("switching school", () => {
  it("does not leave the old school's sections on screen while the new ones load", async () => {
    listSchools.mockResolvedValue(SCHOOLS);
    listUnfiledFairProjects.mockResolvedValue([]);
    let releaseB: (rows: unknown[]) => void = () => {};
    listFairSections
      .mockImplementationOnce(async () => A_SECTIONS)
      .mockImplementationOnce(
        () =>
          new Promise((res) => {
            releaseB = res;
          })
      );

    render(<FairPanel />);
    await pick("Balamand");
    await waitFor(() => expect(screen.getByText("Smart Home")).toBeInTheDocument());

    await pick("Elsewhere");

    // B has not answered yet. A's rows are drop targets; they must be gone.
    await waitFor(() =>
      expect(screen.queryByText("Smart Home")).not.toBeInTheDocument()
    );

    releaseB(B_SECTIONS);
    await waitFor(() => expect(screen.getByText("Weather Station")).toBeInTheDocument());
  });

  it("keeps the school the admin chose last, whatever order the answers arrive in", async () => {
    listSchools.mockResolvedValue(SCHOOLS);
    listUnfiledFairProjects.mockResolvedValue([]);
    let releaseA: (rows: unknown[]) => void = () => {};
    listFairSections
      .mockImplementationOnce(
        () =>
          new Promise((res) => {
            releaseA = res;
          })
      )
      .mockImplementationOnce(async () => B_SECTIONS);

    render(<FairPanel />);
    await pick("Balamand");
    await pick("Elsewhere");
    await waitFor(() =>
      expect(screen.getByText("Weather Station")).toBeInTheDocument()
    );

    // Only now does the abandoned school answer.
    releaseA(A_SECTIONS);
    await new Promise((r) => setTimeout(r, 20));

    expect(screen.getByText("Weather Station")).toBeInTheDocument();
    expect(screen.queryByText("Smart Home")).not.toBeInTheDocument();
  });

  it("does not report a failure that belongs to a school already left", async () => {
    listSchools.mockResolvedValue(SCHOOLS);
    listUnfiledFairProjects.mockResolvedValue([]);
    let rejectA: (err: Error) => void = () => {};
    listFairSections
      .mockImplementationOnce(
        () =>
          new Promise((_res, rej) => {
            rejectA = rej;
          })
      )
      .mockImplementationOnce(async () => B_SECTIONS);

    render(<FairPanel />);
    await pick("Balamand");
    await pick("Elsewhere");
    await waitFor(() =>
      expect(screen.getByText("Weather Station")).toBeInTheDocument()
    );

    rejectA(new Error("Balamand's sections could not be loaded"));
    await new Promise((r) => setTimeout(r, 20));

    expect(
      screen.queryByText(/Balamand's sections could not be loaded/i)
    ).not.toBeInTheDocument();
  });
});
