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

import { MyLeavePage } from "./MyLeavePage";

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

    // Thu 10/09/2026 -> Mon 14/09/2026 spans a weekend: a calendar count says
    // 5, the server says 3.
    await fillDate(user, "Từ ngày", "10/09/2026");
    await fillDate(user, "Đến ngày", "14/09/2026");

    await user.click(screen.getByText("Gửi đơn"));

    await waitFor(() => expect(createMyLeaveRequest).toHaveBeenCalled());

    const payload = createMyLeaveRequest.mock.calls[0][0];
    expect(payload).not.toHaveProperty("totalDays");
    expect(payload).toMatchObject({
      leaveType: "ANNUAL",
      startDate: "2026-09-10",
      endDate: "2026-09-14",
    });
  });

  it("labels the day count as an estimate, not the deducted total", async () => {
    render(<MyLeavePage />);
    await screen.findByText("Gửi đơn");

    expect(screen.getByText(/Tạm tính/)).toBeTruthy();
    // The wording must not promise a figure the client cannot know.
    expect(screen.queryByText(/^Tổng:/)).toBeNull();
  });
});
