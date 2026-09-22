/**
 * Three questions on one screen, and the right request behind each.
 *
 * The server keeps lesson-access rows out of the default listing because a
 * teacher opening a PDF happens all day and would push every sign-in off the
 * page. That makes the filter the only way to reach them, so what these hold
 * is that each tab asks for what it claims to show — a tab that quietly sent
 * the wrong `event` would look completely normal and answer the wrong question.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import SuperAdminSecurityPage from "@/app/super-admin/security/page";
import { listSecurityLogs } from "@/lib/api";
import type { SecurityLog } from "@/types";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, listSecurityLogs: vi.fn(async () => []) };
});

const listMock = vi.mocked(listSecurityLogs);

function row(event: SecurityLog["event"], detail: string): SecurityLog {
  return {
    id: `sec_${detail}`,
    userId: "u_1",
    userName: "Rania Haddad",
    role: "teacher",
    schoolId: "sch_1",
    ip: "1.2.3.4",
    device: "",
    deviceLabel: "Chrome on Windows",
    locationLabel: "",
    locationLat: null,
    locationLng: null,
    detail,
    event,
    status: "ok",
    timestamp: "2026-09-22T10:00:00Z",
  } as unknown as SecurityLog;
}

beforeEach(() => {
  listMock.mockReset();
  listMock.mockResolvedValue([]);
});

describe("the security logs screen", () => {
  it("asks for the ordinary security events first, with no filter", async () => {
    render(<SuperAdminSecurityPage />);

    await waitFor(() => expect(listMock).toHaveBeenCalled());
    expect(listMock).toHaveBeenCalledWith(undefined);
  });

  it("asks for served lessons when that tab is chosen", async () => {
    listMock.mockResolvedValue([row("lesson-file-served", 'Opened "grade 1 lesson 01"')]);

    render(<SuperAdminSecurityPage />);
    await waitFor(() => expect(listMock).toHaveBeenCalled());
    fireEvent.click(screen.getByText("Lesson access"));

    await waitFor(() => expect(listMock).toHaveBeenLastCalledWith("lesson-file-served"));
    // And the row renders under a label rather than an empty badge, which is
    // what an event the table has no name for produces.
    expect(await screen.findByText("Lesson opened")).toBeInTheDocument();
    expect(screen.getByText('Opened "grade 1 lesson 01"')).toBeInTheDocument();
  });

  it("asks for refusals when that tab is chosen", async () => {
    render(<SuperAdminSecurityPage />);
    await waitFor(() => expect(listMock).toHaveBeenCalled());
    fireEvent.click(screen.getByText("Refused"));

    await waitFor(() => expect(listMock).toHaveBeenLastCalledWith("lesson-file-refused"));
  });

  it("says which kind of nothing it found", async () => {
    render(<SuperAdminSecurityPage />);

    expect(await screen.findByText("No security events.")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Lesson access"));

    // Not "No security events." — an empty lesson log is a different fact, and
    // on this screen the wrong one reads as "nothing happened" during exactly
    // the moment somebody is checking whether something did.
    expect(await screen.findByText("No lesson has been opened yet.")).toBeInTheDocument();
  });
});
