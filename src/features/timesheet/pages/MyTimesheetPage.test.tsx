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

/**
 * Some shifts include Sunday (a weekly template, or a weekday mask with the
 * Sunday bit set). The grid must take "is this a working day" from the schedule
 * the server resolved for that employee, never from the weekday itself —
 * otherwise a Sunday-working employee sees their shift painted as a rest day.
 */
describe("MyTimesheetPage — shifts that include Sunday", () => {
  /** The Sundays and one Monday of a fixed month, so the weekday is unambiguous. */
  const SUNDAYS = ["2026-03-01", "2026-03-08", "2026-03-15"];
  const MONDAY = "2026-03-02";

  const renderMonth = async (days: ReturnType<typeof day>[]) => {
    getMyTimesheet.mockResolvedValue({
      period: {
        id: "period-1",
        month: 3,
        year: 2026,
        status: "PENDING_EMPLOYEE",
        confirmDeadline: null,
      },
      confirmation: null,
      days,
      summary: { totalPaidDays: 0, totalLeaveDays: 0, countBySymbol: {} },
    });
    render(
      <MemoryRouter initialEntries={["/timesheet?period=2026-03"]}>
        <MyTimesheetPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(getMyTimesheet).toHaveBeenCalled());
  };

  const cellByDayNumber = async (date: string) => {
    const label = String(Number(date.slice(8, 10)));
    const nodes = await screen.findAllByText(label);
    const cell = nodes
      .map((node) => node.closest("div.flex.flex-col"))
      .find((node): node is HTMLElement => node !== null);
    if (!cell) throw new Error(`No cell rendered for ${date}`);
    return cell;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not mark a worked Sunday as a rest day", async () => {
    await renderMonth([
      ...SUNDAYS.map((date) =>
        day(date, {
          isWorkingDay: true,
          paidDays: 1,
          displaySymbol: "+",
          shiftCode: "HC1",
          source: "DEVICE",
          firstPunch: "08:00",
          lastPunch: "17:30",
          needsExplanation: false,
        }),
      ),
      day(MONDAY, {
        isWorkingDay: true,
        paidDays: 1,
        displaySymbol: "+",
        source: "DEVICE",
        needsExplanation: false,
      }),
    ]);

    const sunday = await cellByDayNumber(SUNDAYS[0]);
    // A worked Sunday shows its credit, not the "Nghỉ" rest-day wording.
    expect(within(sunday).getByText("1 công")).toBeTruthy();
    expect(within(sunday).queryByText("Nghỉ")).toBeNull();
    expect(within(sunday).getByText("HC1")).toBeTruthy();
    expect(within(sunday).queryByText("+")).toBeNull();
  });

  it("keeps the Sunday header neutral when the shift works Sundays", async () => {
    const { container } = { container: document.body };
    await renderMonth(
      SUNDAYS.map((date) =>
        day(date, {
          isWorkingDay: true,
          paidDays: 1,
          displaySymbol: "+",
          source: "DEVICE",
          needsExplanation: false,
        }),
      ),
    );

    await cellByDayNumber(SUNDAYS[0]);
    const header = [...container.querySelectorAll("div")].find(
      (node) => node.textContent?.trim() === "CN",
    );
    expect(header).toBeTruthy();
    // Red is reserved for a column that is genuinely a rest day.
    expect(header?.className).not.toContain("f43f5e");
  });

  it("still marks Sunday as a rest day for an ordinary office shift", async () => {
    const { container } = { container: document.body };
    await renderMonth([
      ...SUNDAYS.map((date) =>
        day(date, {
          isWorkingDay: false,
          source: "REST_DAY",
          needsExplanation: false,
        }),
      ),
      day(MONDAY, {
        isWorkingDay: true,
        paidDays: 1,
        displaySymbol: "+",
        source: "DEVICE",
        needsExplanation: false,
      }),
    ]);

    const sunday = await cellByDayNumber(SUNDAYS[0]);
    expect(within(sunday).getByText("Nghỉ")).toBeTruthy();

    const header = [...container.querySelectorAll("div")].find(
      (node) => node.textContent?.trim() === "CN",
    );
    expect(header?.className).toContain("f43f5e");
  });
});
