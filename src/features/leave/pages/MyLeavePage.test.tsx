import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createMyLeaveRequest = vi.fn();
const getMyLeave = vi.fn();
const getPendingLeaveApprovals = vi.fn();

const searchMyLeaveReplacementCandidates = vi.fn();
vi.mock("../../api/hrApi", () => ({
  hrApi: {
    getMyLeave: (...args: unknown[]) => getMyLeave(...args),
    createMyLeaveRequest: (...args: unknown[]) => createMyLeaveRequest(...args),
    searchMyLeaveReplacementCandidates: (...args: unknown[]) =>
      searchMyLeaveReplacementCandidates(...args),
    cancelMyLeaveRequest: vi.fn(),
    getPendingLeaveApprovals: (...args: unknown[]) =>
      getPendingLeaveApprovals(...args),
    approveLeaveRequest: vi.fn(),
    rejectLeaveRequest: vi.fn(),
  },
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import toast from "react-hot-toast";

import { MyLeavePage } from "./MyLeavePage";

/**
 * Dates must stay in the future: the form blocks a start date more than three
 * days back (RETROACTIVE_LIMIT_DAYS), which would stop submission before the
 * payload is ever built. Hardcoded dates would therefore rot into failures, so
 * derive the next Thursday and the Monday after it.
 */
const nextThursday = () => {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + 7);
  while (date.getUTCDay() !== 4) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date;
};

const shift = (base: Date, days: number) => {
  const date = new Date(base);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
};

const iso = (value: Date) => value.toISOString().slice(0, 10);
const vn = (value: Date) => {
  const [y, m, d] = iso(value).split("-");
  return `${d}/${m}/${y}`;
};

const THU = nextThursday();
const FRI = shift(THU, 1);
const MON = shift(THU, 4);

/**
 * The chat client must not decide how many days a leave request costs.
 *
 * The server derives the count from the employee's assigned shift and skips
 * non-working days; a calendar count made here disagrees with it as soon as the
 * range crosses a weekend, and the request is rejected outright with
 * LEAVE_TOTAL_DAYS_MISMATCH. These tests pin the payload so the calculation
 * cannot quietly come back.
 */
describe("MyLeavePage — leave request payload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMyLeave.mockResolvedValue({
      year: 2026,
      employeeId: "emp-1",
      mode: "EMPLOYEE",
      balances: [],
      requests: [],
    });
    getPendingLeaveApprovals.mockResolvedValue(null);
    createMyLeaveRequest.mockResolvedValue({ id: "leave-1" });
  });
  searchMyLeaveReplacementCandidates.mockResolvedValue([]);

  const fillDate = async (
    user: ReturnType<typeof userEvent.setup>,
    label: string,
    value: string,
  ) => {
    const field = screen.getByLabelText(label);
    await user.clear(field);
    await user.type(field, value);
  };

  it("does not send a client-calculated totalDays", async () => {
    const user = userEvent.setup();
    render(<MyLeavePage />);
    await screen.findByText("Gửi đơn");

    // Thursday -> the following Monday spans a weekend: a calendar count says
    // 5, the server says 3.
    await fillDate(user, "Từ ngày", vn(THU));
    await fillDate(user, "Đến ngày", vn(MON));

    await user.click(screen.getByText("Gửi đơn"));

    await waitFor(() => expect(createMyLeaveRequest).toHaveBeenCalled());

    const payload = createMyLeaveRequest.mock.calls[0][0];
    expect(payload).not.toHaveProperty("totalDays");
    expect(payload).toMatchObject({
      leaveType: "ANNUAL",
      startDate: iso(THU),
      endDate: iso(MON),
    });
    await waitFor(() => expect(getMyLeave).toHaveBeenCalledTimes(2));
  });

  it("labels the day count as an estimate, not the deducted total", async () => {
    render(<MyLeavePage />);
    await screen.findByText("Gửi đơn");

    expect(screen.getByText(/Tạm tính/)).toBeTruthy();
    // The wording must not promise a figure the client cannot know.
    expect(screen.queryByText(/^Tổng:/)).toBeNull();
  });

  it("shows that sick leave usage comes from the OM timesheet symbol", async () => {
    getMyLeave.mockResolvedValueOnce({
      year: 2026,
      employeeId: "emp-1",
      mode: "EMPLOYEE",
      balances: [
        {
          leaveType: "SICK",
          label: "Ốm đau",
          entitlementDays: null,
          usedDays: 1,
          pendingDays: 0,
          remainingDays: null,
          source: "TIMESHEET_OM_SYMBOL",
          balanceStatus: "PENDING_HR_CSV_RECONCILIATION",
        },
      ],
      requests: [],
    });

    render(<MyLeavePage />);

    expect(await screen.findByText("Từ ký hiệu OM")).toBeTruthy();
  });

  it("labels a reconciled annual balance as live HRM truth", async () => {
    getMyLeave.mockResolvedValueOnce({
      year: 2026,
      employeeId: "emp-1",
      mode: "LIVE",
      balances: [
        {
          leaveType: "ANNUAL",
          label: "Phép năm",
          entitlementDays: 12,
          usedDays: 2,
          pendingDays: 0.5,
          remainingDays: 9.5,
          source: "RECONCILED_LEAVE_LEDGER",
          balanceStatus: "RECONCILED",
        },
      ],
      requests: [],
    });

    render(<MyLeavePage />);

    expect(await screen.findByText("Số dư đã đối chiếu trên HRM")).toBeTruthy();
    expect(screen.getByText("Quỹ phép đã đối chiếu")).toBeTruthy();
    expect(screen.queryByText("Số dư đang được HR đối chiếu")).toBeNull();
  });

  it("labels an unreconciled annual balance as trial data from the P timesheet", async () => {
    getMyLeave.mockResolvedValueOnce({
      year: 2026,
      employeeId: "emp-1",
      mode: "TRIAL_PENDING_CSV_RECONCILIATION",
      balances: [
        {
          leaveType: "ANNUAL",
          label: "Phép năm",
          entitlementDays: null,
          usedDays: 2,
          pendingDays: 0.5,
          remainingDays: null,
          source: "TIMESHEET_P_SYMBOL",
          balanceStatus: "PENDING_HR_CSV_RECONCILIATION",
        },
      ],
      requests: [],
    });

    render(<MyLeavePage />);

    expect(
      await screen.findByText("Số dư đang được HR đối chiếu"),
    ).toBeTruthy();
    expect(screen.getByText("Từ ký hiệu P")).toBeTruthy();
    expect(screen.getByText("Đối chiếu")).toBeTruthy();
    expect(screen.queryByText("Số dư đã đối chiếu trên HRM")).toBeNull();
  });

  it("sends the half-day sessions so the server can derive a half day", async () => {
    const user = userEvent.setup();
    render(<MyLeavePage />);
    await screen.findByText("Gửi đơn");

    await fillDate(user, "Từ ngày", vn(THU));
    await fillDate(user, "Đến ngày", vn(THU));
    await user.selectOptions(screen.getByLabelText("Buổi đầu"), "AM");
    await user.selectOptions(screen.getByLabelText("Buổi cuối"), "AM");

    await user.click(screen.getByText("Gửi đơn"));
    await waitFor(() => expect(createMyLeaveRequest).toHaveBeenCalled());

    const payload = createMyLeaveRequest.mock.calls[0][0];
    expect(payload).not.toHaveProperty("totalDays");
    expect(payload).toMatchObject({
      startHalfDaySession: "MORNING",
      endHalfDaySession: "MORNING",
    });
  });

  it("still submits sick leave with no attachment — the server decides", async () => {
    const user = userEvent.setup();
    render(<MyLeavePage />);
    await screen.findByText("Gửi đơn");

    // Fri -> Mon reads as 4 calendar days but is only 2 working days, so the
    // attachment rule must not be enforced from the estimate.
    await user.selectOptions(screen.getByLabelText("Loại nghỉ"), "SICK");
    await fillDate(user, "Từ ngày", vn(FRI));
    await fillDate(user, "Đến ngày", vn(MON));

    await user.click(screen.getByText("Gửi đơn"));

    await waitFor(() => expect(createMyLeaveRequest).toHaveBeenCalled());
    expect(createMyLeaveRequest.mock.calls[0][0]).not.toHaveProperty(
      "totalDays",
    );
  });

  it("surfaces the server duration error instead of a generic failure", async () => {
    const user = userEvent.setup();
    createMyLeaveRequest.mockRejectedValueOnce({
      response: { data: { message: "LEAVE_DURATION_SCHEDULE_UNASSIGNED" } },
    });
    render(<MyLeavePage />);
    await screen.findByText("Gửi đơn");

    await fillDate(user, "Từ ngày", vn(THU));
    await fillDate(user, "Đến ngày", vn(MON));
    await user.click(screen.getByText("Gửi đơn"));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(vi.mocked(toast.error).mock.calls[0][0]).toContain("liên hệ HR");
  });

  it("explains that an annual leave request crossing years needs HR confirmation", async () => {
    const user = userEvent.setup();
    createMyLeaveRequest.mockRejectedValueOnce({
      response: {
        data: {
          message: "ANNUAL_LEAVE_CROSS_YEAR_REQUIRES_HR_CONFIRMATION",
        },
      },
    });
    render(<MyLeavePage />);
    await screen.findByText("Gửi đơn");

    await fillDate(user, "Từ ngày", vn(THU));
    await fillDate(user, "Đến ngày", vn(MON));
    await user.click(screen.getByText("Gửi đơn"));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(vi.mocked(toast.error).mock.calls[0][0]).toContain("tách kỳ phép");
  });

  it("shows the official paid/unpaid allocation returned by HRM", async () => {
    getMyLeave.mockResolvedValueOnce({
      year: 2026,
      employeeId: "emp-1",
      mode: "LIVE",
      balances: [],
      requests: [
        {
          id: "leave-1",
          employeeId: "emp-1",
          leaveType: "ANNUAL",
          startDate: iso(THU),
          endDate: iso(THU),
          totalDays: 1,
          annualPaidDays: 0.5,
          unpaidDays: 0.5,
          status: "SUBMITTED",
        },
      ],
    });

    render(<MyLeavePage />);

    expect(await screen.findByText("0,5 P")).toBeTruthy();
    expect(screen.getByText("0,5 KL")).toBeTruthy();
  });

  it("labels the P/KL split as an estimate before the server derives workdays", async () => {
    getMyLeave.mockResolvedValueOnce({
      year: 2026,
      employeeId: "emp-1",
      mode: "LIVE",
      balances: [
        {
          leaveType: "ANNUAL",
          label: "Phép năm",
          entitlementDays: 1,
          usedDays: 0.5,
          pendingDays: 0,
          remainingDays: 0.5,
          source: "RECONCILED_LEAVE_LEDGER",
          balanceStatus: "RECONCILED",
        },
      ],
      requests: [],
    });

    render(<MyLeavePage />);

    expect(await screen.findByText(/Ước tính nguồn/)).toBeTruthy();
    expect(screen.getByText("0,5 P")).toBeTruthy();
    expect(screen.getByText("0,5 KL")).toBeTruthy();
  });

  it("searches within the department and submits the selected handover employee", async () => {
    const user = userEvent.setup();
    searchMyLeaveReplacementCandidates.mockResolvedValueOnce([
      {
        id: "emp-2",
        employeeCode: "HC0002",
        fullName: "Trần An",
        employeeAssignments: [
          { department: { id: "dept-1", name: "Phòng Nhân sự" } },
        ],
      },
    ]);
    render(<MyLeavePage />);
    await screen.findByText("Gửi đơn");

    await user.type(screen.getByLabelText("Người nhận bàn giao"), "Trần");
    await waitFor(() =>
      expect(searchMyLeaveReplacementCandidates).toHaveBeenCalledWith(
        "Trần",
        10,
      ),
    );
    await user.click(await screen.findByText("Trần An"));
    await fillDate(user, "Từ ngày", vn(THU));
    await fillDate(user, "Đến ngày", vn(THU));
    await user.click(screen.getByText("Gửi đơn"));

    await waitFor(() => expect(createMyLeaveRequest).toHaveBeenCalled());
    expect(createMyLeaveRequest.mock.calls[0][0]).toMatchObject({
      replacementEmployeeId: "emp-2",
    });
  });

  it("explains an invalid replacement returned by HRM", async () => {
    const user = userEvent.setup();
    createMyLeaveRequest.mockRejectedValueOnce({
      response: { data: { message: "LEAVE_REPLACEMENT_EMPLOYEE_INVALID" } },
    });
    render(<MyLeavePage />);
    await screen.findByText("Gửi đơn");
    await fillDate(user, "Từ ngày", vn(THU));
    await fillDate(user, "Đến ngày", vn(THU));

    await user.click(screen.getByText("Gửi đơn"));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(vi.mocked(toast.error).mock.calls[0][0]).toContain("cùng phòng ban");
  });
});
