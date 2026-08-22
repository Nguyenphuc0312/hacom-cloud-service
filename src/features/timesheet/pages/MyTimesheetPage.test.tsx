import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getMyTimesheet = vi.fn();

vi.mock("../../api/hrApi", () => ({
  hrApi: {
    getMyTimesheet: (...args: unknown[]) => getMyTimesheet(...args),
    confirmMyTimesheet: vi.fn(),
    disputeMyTimesheet: vi.fn(),
    getMyAttendanceExplanations: vi.fn().mockResolvedValue([]),
    getPendingAttendanceExplanations: vi.fn().mockResolvedValue(null),
    createAttendanceExplanation: vi.fn(),
    approveAttendanceExplanation: vi.fn(),
    rejectAttendanceExplanation: vi.fn(),
  },
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import { MyTimesheetPage } from "./MyTimesheetPage";

const iso = (value: Date) => value.toISOString().slice(0, 10);

const shift = (days: number) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
};

const day = (date: string, overrides: Record<string, unknown> = {}) => ({
  id: `day-${date}`,
  date,
  source: "MISSING",
  displaySymbol: "",
  paidDays: 0,
  isWorkingDay: true,
  holidayName: null,
  firstPunch: null,
  lastPunch: null,
  lateMinutes: 0,
  earlyLeaveMinutes: 0,
  needsExplanation: true,
  ...overrides,
});

/**
 * A timesheet computed before the server-side fix still carries
 * `needsExplanation: true` on days that have not happened yet, and keeps it
 * until the next recompute. The grid must refuse to render any "needs review"
 * affordance for those days no matter what the API sends.
 */
describe("MyTimesheetPage — future days", () => {
  const past = iso(shift(-3));
  const future = iso(shift(3));

  beforeEach(() => {
    vi.clearAllMocks();
    getMyTimesheet.mockResolvedValue({
      // The grid only renders when a period exists; without it the page shows
      // the "no timesheet yet" empty state and asserts nothing useful.
      period: {
        id: "period-1",
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        status: "PENDING_EMPLOYEE",
        confirmDeadline: null,
      },
      confirmation: null,
      days: [day(past), day(future)],
      summary: { totalPaidDays: 0, totalLeaveDays: 0, countBySymbol: {} },
    });
  });

  const cellFor = async (date: string) => {
    const label = String(Number(date.slice(8, 10)));
    const nodes = await screen.findAllByText(label);
    const cell = nodes
      .map((node) => node.closest("div.flex.flex-col"))
      .find((node): node is HTMLElement => node !== null);
    if (!cell) throw new Error(`No cell rendered for ${date}`);
    return cell;
  };

  const renderPage = () =>
    render(
      <MemoryRouter>
        <MyTimesheetPage />
      </MemoryRouter>,
    );

  it("shows no explanation button on a day that has not happened", async () => {
    renderPage();
    await waitFor(() => expect(getMyTimesheet).toHaveBeenCalled());

    const cell = await cellFor(future);
    expect(within(cell).queryByText("Giải trình")).toBeNull();
  });

  it("shows no warning ring or icon on a day that has not happened", async () => {
    renderPage();
    await waitFor(() => expect(getMyTimesheet).toHaveBeenCalled());

    const cell = await cellFor(future);
    expect(cell.innerHTML).not.toContain("ring-amber-300");
    expect(cell.querySelector("svg")).toBeNull();
  });

  it("still flags a past day that genuinely needs an explanation", async () => {
    renderPage();
    await waitFor(() => expect(getMyTimesheet).toHaveBeenCalled());

    const cell = await cellFor(past);
    expect(within(cell).getByText("Giải trình")).toBeTruthy();
    expect(cell.innerHTML).toContain("ring-amber-300");
  });

  it("labels a future day as not yet reached instead of zero credit", async () => {
    renderPage();
    await waitFor(() => expect(getMyTimesheet).toHaveBeenCalled());

    const cell = await cellFor(future);
    expect(within(cell).getByText("Chưa tới")).toBeTruthy();
  });

  it("counts only real review days, not future ones", async () => {
    renderPage();
    await waitFor(() => expect(getMyTimesheet).toHaveBeenCalled());

    // One past day needs review; the future day must not be counted.
    // The label sits in its own div, so step up to the tile that wraps both.
    const tile = (await screen.findByText("Ngày cần xem lại"))
      .parentElement as HTMLElement;
    expect(within(tile).getByText("1")).toBeTruthy();
  });
});
