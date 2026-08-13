import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const get = vi.fn();
  const client = {
    get,
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  };

  return {
    get,
    create: vi.fn(() => client),
  };
});

vi.mock("axios", () => ({
  default: { create: mocks.create },
}));

vi.mock("../../config", () => ({ HR_API_BASE_URL: "http://hr.test" }));
vi.mock("../../services/tokenService", () => ({ getAccessToken: vi.fn() }));
vi.mock("../../services/authIdentityGuard", () => ({
  compareIdentity: vi.fn(() => ({ mismatch: false })),
}));
vi.mock("../../stores", () => ({
  useAuthStore: { getState: () => ({ user: null }) },
}));
vi.mock("../../utils/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("hrApi.getPendingLeaveApprovals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the reviewer-scoped endpoint and unwraps its paginated envelope", async () => {
    const request = {
      id: "leave-1",
      employeeId: "employee-1",
      leaveType: "ANNUAL" as const,
      startDate: "2026-08-14",
      endDate: "2026-08-14",
      totalDays: 1,
      status: "SUBMITTED" as const,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      employee: { id: "employee-1", employeeCode: "NV001", fullName: "Nguyễn A" },
      approvalSteps: [],
      currentApprovalStep: {
        id: "step-1",
        leaveRequestId: "leave-1",
        stepOrder: 1,
        stepCode: "ATTENDANCE_TRACKER",
        stepName: "Người theo dõi công",
        status: "SUBMITTED" as const,
        assignedReviewerUserId: "reviewer-1",
      },
    };
    const apiResult = {
      data: [request],
      pagination: {
        page: 2,
        pageSize: 50,
        total: 51,
        totalPages: 2,
        hasNextPage: false,
        hasPreviousPage: true,
      },
    };
    mocks.get.mockResolvedValueOnce({
      data: { success: true, data: apiResult },
    });

    const { hrApi } = await import("./hrApi");

    await expect(hrApi.getPendingLeaveApprovals({ page: 2, pageSize: 50 })).resolves.toEqual({
      items: [request],
      pagination: apiResult.pagination,
    });
    expect(mocks.get).toHaveBeenCalledWith(
      "/leave/requests/pending-approval?page=2&pageSize=50",
    );
  });
});
