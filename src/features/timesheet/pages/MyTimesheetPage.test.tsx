import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getMyTimesheet = vi.fn();
const getPendingAttendanceExplanations = vi.fn();
const authState = vi.hoisted(() => ({
  roles: ["EMPLOYEE"] as string[],
  permissions: [] as string[],
}));

vi.mock("../../../stores/authStore", () => ({
  useAuthStore: (
    selector: (state: {
      user: {
        id: string;
        username: string;
        roles: string[];
        permissions: string[];
      };
    }) => unknown,
  ) =>
    selector({
      user: { id: "user-1", username: "tester", ...authState },
    }),
}));

vi.mock("../../api/hrApi", () => ({
  hrApi: {
    getWorkShiftCatalog: vi.fn().mockResolvedValue([
      {
        code: "HC1",
        name: "Ca HC1",
        groupName: "Hành chính",
        startTime: "08:00",
        endTime: "17:00",
        breakStart: "12:00",
        breakEnd: "13:00",
        standardMinutes: 480,
        dayValue: 1,
      },
    ]),
    getMyTimesheet: (...args: unknown[]) => getMyTimesheet(...args),
    confirmMyTimesheet: vi.fn(),
    disputeMyTimesheet: vi.fn(),
    getMyAttendanceExplanations: vi.fn().mockResolvedValue([]),
    getPendingAttendanceExplanations: (...args: unknown[]) =>
      getPendingAttendanceExplanations(...args),
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

beforeEach(() => {
  authState.roles = ["EMPLOYEE"];
  authState.permissions = [];
  getPendingAttendanceExplanations.mockResolvedValue({ items: [] });
});

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
  const past = iso(shift(-1));
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
    return waitFor(() => {
      const cell = screen
        .queryAllByText(label)
        .map((node) => node.closest("div[title]")?.parentElement)
        .find((node): node is HTMLElement => Boolean(node));
      if (!cell) throw new Error(`No cell rendered for ${date}`);
      return cell;
    });
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
      <MemoryRouter initialEntries={["/timesheet?month=2026-03"]}>
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

  it("opens the shift catalogue when the displayed shift code is clicked", async () => {
    await renderMonth([
      day(SUNDAYS[0], {
        isWorkingDay: true,
        paidDays: 1,
        displaySymbol: "+",
        shiftCode: "HC1",
        source: "DEVICE",
        firstPunch: "08:00",
        lastPunch: "17:30",
        needsExplanation: false,
      }),
    ]);

    const sunday = await cellByDayNumber(SUNDAYS[0]);
    const trigger = within(sunday).getByRole("button", { name: /HC1/i });
    fireEvent.click(trigger);

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect((await screen.findAllByText("Ca HC1")).length).toBeGreaterThan(0);
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

describe("MyTimesheetPage — complete month grid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMyTimesheet.mockResolvedValue({
      period: {
        id: "period-1",
        month: 9,
        year: 2099,
        status: "PENDING_EMPLOYEE",
        confirmDeadline: null,
      },
      confirmation: null,
      days: [
        day("2099-09-01", {
          paidDays: 1,
          displaySymbol: "L1",
          source: "DEVICE",
          needsExplanation: false,
        }),
      ],
      summary: { totalPaidDays: 1, totalLeaveDays: 0, countBySymbol: {} },
    });
  });

  it("renders every date and fills only dates returned by the server", async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/timesheet?month=2099-09"]}>
        <MyTimesheetPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(getMyTimesheet).toHaveBeenCalled());
    expect(container.querySelectorAll("[data-date]")).toHaveLength(30);
    expect(
      container.querySelector('[data-date="2099-09-01"]')?.textContent,
    ).toContain("L1");
    expect(
      container.querySelector('[data-date="2099-09-30"]')?.textContent,
    ).toContain("Chưa tới");
  });
});

describe("MyTimesheetPage — Chat approval visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMyTimesheet.mockResolvedValue({
      period: null,
      confirmation: null,
      days: [],
      summary: { totalPaidDays: 0, totalLeaveDays: 0, countBySymbol: {} },
    });
  });

  it("does not fetch or show pending explanations for a regular user", async () => {
    render(
      <MemoryRouter>
        <MyTimesheetPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(getMyTimesheet).toHaveBeenCalled());
    expect(getPendingAttendanceExplanations).not.toHaveBeenCalled();
    expect(screen.queryByText("Chờ duyệt giải trình")).toBeNull();
  });

  it("shows pending explanations for a scoped reviewer with effective permissions", async () => {
    authState.permissions = ["hr.attendance.read", "hr.attendance.update"];
    getPendingAttendanceExplanations.mockResolvedValueOnce({
      items: [
        {
          id: "explanation-1",
          employeeId: "employee-2",
          type: "LATE",
          reason: "Đi công trình buổi sáng",
          status: "SUBMITTED",
          employee: { employeeCode: "HC0002", fullName: "Trần An" },
          timesheetDay: { workDate: "2026-08-25", displaySymbol: "?" },
        },
      ],
    });

    render(
      <MemoryRouter>
        <MyTimesheetPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Chờ duyệt giải trình")).toBeTruthy();
    expect(await screen.findByText("Trần An")).toBeTruthy();
    expect(getPendingAttendanceExplanations).toHaveBeenCalledTimes(1);
  });

  it("shows the full approval queue outside the narrow action sidebar", async () => {
    authState.permissions = ["hr.attendance.read", "hr.attendance.update"];
    getPendingAttendanceExplanations.mockResolvedValueOnce({
      items: Array.from({ length: 6 }, (_, index) => ({
        id: `explanation-${index + 1}`,
        employeeId: `employee-${index + 1}`,
        type: index === 0 ? "LATE" : "OTHER",
        reason: `Lý do giải trình ${index + 1}`,
        status: "SUBMITTED",
        employee: {
          employeeCode: `HC000${index + 1}`,
          fullName: `Nhân viên ${index + 1}`,
        },
        timesheetDay: {
          workDate: `2026-08-${String(index + 10).padStart(2, "0")}`,
        },
      })),
    });

    render(
      <MemoryRouter>
        <MyTimesheetPage />
      </MemoryRouter>,
    );

    const heading = await screen.findByText("Chờ duyệt giải trình");
    const queue = heading.closest("section");
    expect(queue).toBeTruthy();
    expect(queue?.closest("aside")).toBeNull();
    expect(screen.getByText("6 yêu cầu")).toBeTruthy();
    expect(screen.getByText("Nhân viên 6")).toBeTruthy();
    expect(screen.getByText("Đi muộn")).toBeTruthy();
  });

  it("shows the team link only with attendance read permission", async () => {
    const { unmount } = render(
      <MemoryRouter>
        <MyTimesheetPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(getMyTimesheet).toHaveBeenCalled());
    expect(screen.queryByText("Nhóm của tôi")).toBeNull();
    unmount();

    vi.clearAllMocks();
    authState.permissions = ["hr.attendance.read"];
    getMyTimesheet.mockResolvedValue({
      period: null,
      confirmation: null,
      days: [],
      summary: { totalPaidDays: 0, totalLeaveDays: 0, countBySymbol: {} },
    });
    render(
      <MemoryRouter>
        <MyTimesheetPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Nhóm của tôi")).toBeTruthy();
  });
});
