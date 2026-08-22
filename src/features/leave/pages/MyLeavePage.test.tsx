import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createMyLeaveRequest = vi.fn();
const getMyLeave = vi.fn();
const getPendingLeaveApprovals = vi.fn();

vi.mock("../../api/hrApi", () => ({
  hrApi: {
    getMyLeave: (...args: unknown[]) => getMyLeave(...args),
    createMyLeaveRequest: (...args: unknown[]) => createMyLeaveRequest(...args),
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
  });

  it("labels the day count as an estimate, not the deducted total", async () => {
    render(<MyLeavePage />);
    await screen.findByText("Gửi đơn");

    expect(screen.getByText(/Tạm tính/)).toBeTruthy();
    // The wording must not promise a figure the client cannot know.
    expect(screen.queryByText(/^Tổng:/)).toBeNull();
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
});
