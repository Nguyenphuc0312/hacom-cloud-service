import axios from "axios";
import type { AxiosInstance } from "axios";
import { HR_API_BASE_URL } from "../../config";
import { getAccessToken } from "../../services/tokenService";
import { compareIdentity } from "../../services/authIdentityGuard";
import { useAuthStore } from "../../stores";
import { logger } from "../../utils/logger";

/** Raised when the access token's identity does not match the current user. */
export class AuthIdentityMismatchError extends Error {
  constructor() {
    super("AUTH_IDENTITY_MISMATCH: access token does not match current user");
    this.name = "AuthIdentityMismatchError";
  }
}

/**
 * HR API client for accessing HRM data (attendance, employee info)
 * Uses the same auth token as the chat API
 */

const createHrApiClient = (): AxiosInstance => {
  const client = axios.create({
    baseURL: HR_API_BASE_URL,
    timeout: 30000,
    headers: {
      "Content-Type": "application/json",
    },
  });

  // Request interceptor: attach the freshest token (read at send-time, never a
  // cached header) AND verify it belongs to the current user.
  //
  // HRM/calendar is an OPTIONAL feature. A failure here MUST NOT tear down the
  // chat session. Therefore, when the token's identity does not match the
  // in-app user (cross-account contamination), we ONLY block this single HR
  // request locally — we deliberately do NOT call reportAuthIdentityMismatch()
  // here, because that triggers a global logout + "session expired" toast and
  // was the root cause of an optional HR 401 nuking the whole chat session.
  //
  // Genuine cross-account contamination is still detected and acted on by the
  // authStore "storage" listener (cross-tab token swap) and by the chat/auth
  // clients, which own the auth lifecycle. HR stays transport-only.
  client.interceptors.request.use(
    (config) => {
      const token = getAccessToken();
      if (!token) {
        return config;
      }

      const user = useAuthStore.getState().user;
      const identity = compareIdentity(token, user);

      if (import.meta.env.DEV) {
        // Dev-only, never logs the raw token.
        logger.debug("hr-api", "auth_identity_check", {
          userEmail: identity.userEmail,
          tokenEmail: identity.tokenEmail,
          tokenAuthUserId: identity.tokenAuthUserId,
          userId: identity.userId,
          mismatch: identity.mismatch,
          baseURL: HR_API_BASE_URL,
        });
      }

      if (identity.mismatch) {
        // Block only THIS request — do not log out the app. The caller
        // (calendar/attendance store) degrades gracefully on rejection.
        logger.warn("hr-api", "auth_identity_mismatch_blocked_local_only", {
          tokenAuthUserId: identity.tokenAuthUserId,
          userId: identity.userId,
        });
        return Promise.reject(new AuthIdentityMismatchError());
      }

      config.headers.Authorization = `Bearer ${token}`;
      return config;
    },
    (error) => Promise.reject(error),
  );

  // Response interceptor for error handling.
  // Optional-feature contract: never log out, never escalate to the auth
  // lifecycle. Just surface the error to the calling store, which decides how
  // to degrade (empty calendar + soft notice).
  client.interceptors.response.use(
    (response) => {
      if (
        typeof response.data === "string" &&
        response.data.trimStart().startsWith("<!doctype html")
      ) {
        return Promise.reject(
          new Error(
            "HR_API_HTML_RESPONSE: received HTML instead of JSON — check VITE_HR_API_BASE_URL",
          ),
        );
      }
      return response;
    },
    (error) => {
      const status = error.response?.status as number | undefined;
      const errorCode =
        (
          error.response?.data as
            { errorCode?: string; code?: string } | undefined
        )?.errorCode ??
        (
          error.response?.data as
            { errorCode?: string; code?: string } | undefined
        )?.code;
      if (status === 401 || status === 403) {
        // Logged for diagnostics only. This is NOT treated as a chat session
        // failure — HRM is optional and the chat/auth clients own logout.
        logger.warn(
          "hr-api",
          "optional_feature_auth_error_ignored_for_session",
          {
            status,
            errorCode: errorCode ?? null,
          },
        );
      }
      return Promise.reject(error);
    },
  );

  return client;
};

export const hrApiClient = createHrApiClient();

/**
 * Attendance calendar types
 */
export type ClassificationStatus =
  "PASS" | "WARNING" | "REVIEW_REQUIRED" | "ESCALATED";
export type ClassificationColor = "green" | "yellow" | "orange" | "red";
export type ExceptionStatus =
  | "NONE"
  | "PENDING_MANAGER_CONFIRMATION"
  | "PENDING_HR_REVIEW"
  | "ESCALATED"
  | "APPROVED"
  | "REJECTED"
  | "RESOLVED";

export interface AttendanceCalendarDay {
  date: string;
  employeeId?: string | null;
  employeeCode?: string | null;
  fullName?: string | null;
  firstPunch?: string | null;
  lastPunch?: string | null;
  displaySymbol?: string | null;
  shiftCode?: string | null;
  shiftName?: string | null;
  lateMinutes?: number | null;
  totalTime?: string | null;
  totalMinutes?: number | null;
  classificationStatus?: ClassificationStatus | null;
  classificationColor?: ClassificationColor | null;
  classificationLabel?: string | null;
  classificationReasons?: string[] | null;
  exceptionStatus?: ExceptionStatus | null;
  exceptionReason?: string | null;
  requiresAction: boolean;
  status?: string | null;
  mappingStatus?: string | null;
}

export interface AttendanceCalendarResponse {
  items: AttendanceCalendarDay[];
  reason?: string | null;
  message?: string | null;
}

export type TimesheetPeriodStatus =
  "DRAFT" | "PENDING_EMPLOYEE" | "PENDING_HR" | "CLOSED";

export type TimesheetConfirmationStatus = "PENDING" | "CONFIRMED" | "DISPUTED";

export interface MyTimesheetPeriod {
  id: string;
  month: number;
  year: number;
  status: TimesheetPeriodStatus;
  confirmDeadline: string | null;
}

export interface MyTimesheetConfirmation {
  id?: string;
  periodId?: string;
  employeeId?: string;
  status: TimesheetConfirmationStatus;
  confirmedAt: string | null;
  disputeNote: string | null;
  disputedAt?: string | null;
  snapshotJson?: unknown;
}

export interface MyTimesheetDay {
  id?: string;
  date: string;
  /** Server-owned day source. `UNASSIGNED` is not absence; `HOLIDAY_UNPAID` is a non-working unpaid holiday. */
  source?: string | null;
  displaySymbol: string;
  shiftCode?: string | null;
  shiftName?: string | null;
  paidDays: number;
  isWorkingDay: boolean;
  holidayName: string | null;
  firstPunch: string | null;
  lastPunch: string | null;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  needsExplanation: boolean;
}

export interface MyTimesheetSummary {
  totalPaidDays: number;
  totalLeaveDays: number;
  countBySymbol: Record<string, number>;
}

export interface MyTimesheetResponse {
  period: MyTimesheetPeriod | null;
  confirmation: MyTimesheetConfirmation | null;
  days: MyTimesheetDay[];
  summary: MyTimesheetSummary;
  reason?: "PERIOD_NOT_OPEN" | "EMPLOYEE_NOT_LINKED" | string;
  message?: string | null;
}

export interface MyTimesheetQuery {
  month: number;
  year: number;
}

export interface TeamTimesheetConfirmation {
  id: string;
  employeeId: string;
  employeeCode: string;
  fullName: string;
  unitName: string | null;
  departmentName: string | null;
  status: TimesheetConfirmationStatus;
  confirmedAt: string | null;
  disputedAt: string | null;
  disputeNote: string | null;
  snapshot: {
    totalPaidDays: number | null;
    totalLeaveDays: number | null;
  };
}

export interface TeamTimesheetSummary {
  total: number;
  pending: number;
  confirmed: number;
  disputed: number;
}

export interface TeamTimesheetResponse {
  period: MyTimesheetPeriod | null;
  confirmations: TeamTimesheetConfirmation[];
  summary: TeamTimesheetSummary;
  reason?: "PERIOD_NOT_OPEN" | string;
  message?: string | null;
}

export interface TeamTimesheetQuery {
  periodId?: string;
  month?: number;
  year?: number;
}

export type LeaveType =
  "ANNUAL" | "SICK" | "UNPAID" | "MARRIAGE" | "MATERNITY" | "OTHER";

export type WorkflowStatus =
  "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "CANCELLED";

export type LeaveHalfDaySession = "FULL_DAY" | "MORNING" | "AFTERNOON";

export interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  startHalfDaySession?: LeaveHalfDaySession;
  endHalfDaySession?: LeaveHalfDaySession;
  totalDays: number;
  reason?: string | null;
  attachmentUrl?: string | null;
  noticeRequiredDays?: number | null;
  noticeActualDays?: number | null;
  lateSubmission?: boolean;
  status: WorkflowStatus;
  approverId?: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: {
    id: string;
    employeeCode?: string | null;
    fullName?: string | null;
  } | null;
  approvalSteps?: LeaveApprovalStep[];
  /** Server-selected step that is actionable by the signed-in reviewer. */
  currentApprovalStep?: LeaveApprovalStep | null;
}

export interface LeaveApprovalStep {
  id: string;
  leaveRequestId: string;
  stepOrder: number;
  stepCode: string;
  stepName: string;
  status: WorkflowStatus;
  /** Immutable reviewer binding captured when the leave request was submitted. */
  assignedReviewerUserId?: string | null;
  reviewedAt?: string | null;
  note?: string | null;
}

export interface PendingLeaveApprovalsResponse {
  items: LeaveRequest[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

/**
 * `buildListResponse` from HR API deliberately uses `data`, unlike a few
 * older list endpoints that return `items`. Normalize at this boundary so the
 * reviewer inbox is never silently empty after the API interceptor unwraps.
 */
interface PendingLeaveApprovalsApiPayload {
  data?: LeaveRequest[];
  items?: LeaveRequest[];
  pagination: PendingLeaveApprovalsResponse["pagination"];
}

export interface LeaveBalance {
  leaveType: Extract<LeaveType, "ANNUAL" | "SICK" | "UNPAID" | "OTHER">;
  label: string;
  entitlementDays: number | null;
  usedDays: number;
  pendingDays: number;
  remainingDays: number | null;
  source:
    | "TIMESHEET_P_SYMBOL"
    | "TIMESHEET_OM_SYMBOL"
    | "TIMESHEET_KL_SYMBOL"
    | "APPROVED_LEAVE_REQUESTS"
    | string;
  balanceStatus: "PENDING_HR_CSV_RECONCILIATION" | string;
}

export interface MyLeaveResponse {
  year: number;
  employeeId: string | null;
  mode:
    | "LIVE"
    | "TRIAL_PENDING_CSV_RECONCILIATION"
    | "EMPLOYEE_NOT_LINKED"
    | string;
  balances: LeaveBalance[];
  requests: LeaveRequest[];
  reason?: "EMPLOYEE_NOT_LINKED" | string;
  message?: string | null;
}

export interface CreateMyLeaveRequestPayload {
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  startHalfDaySession?: LeaveHalfDaySession;
  endHalfDaySession?: LeaveHalfDaySession;
  /**
   * Bỏ trống để server tự tính theo lịch làm việc đã phân của nhân viên.
   * FE không biết ca/ngày lễ của từng người nên không tự tính số ngày chính
   * thức — gửi số tự tính sẽ bị trả `LEAVE_TOTAL_DAYS_MISMATCH`.
   */
  totalDays?: number;
  reason?: string;
  attachmentUrl?: string;
}

export type AttendanceExplanationType =
  "MISSING_PUNCH" | "LATE" | "EARLY_LEAVE" | "OUT_OF_OFFICE" | "OTHER";

export interface AttendanceExplanation {
  id: string;
  employeeId: string;
  timesheetDayId: string;
  type: AttendanceExplanationType;
  reason: string;
  status: WorkflowStatus;
  reviewerId?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  employee?: {
    employeeCode: string;
    fullName: string;
  };
  timesheetDay?: {
    id?: string;
    workDate: string;
    displaySymbol?: string | null;
    firstPunch?: string | null;
    lastPunch?: string | null;
    needsExplanation?: boolean;
    isLocked?: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CreateAttendanceExplanationPayload {
  timesheetDayId: string;
  type: AttendanceExplanationType;
  reason: string;
}

export interface AttendanceExplanationListResponse {
  items: AttendanceExplanation[];
  reason?: "EMPLOYEE_NOT_LINKED" | string;
}

const unwrapHrEnvelope = <T>(
  payload: { success?: boolean; data?: T } & T,
): T =>
  payload &&
  typeof payload === "object" &&
  "success" in payload &&
  payload.success === true
    ? (payload as { data: T }).data
    : (payload as T);

/**
 * HR API endpoints
 */
export const hrApi = {
  /**
   * Get my attendance calendar
   */
  getMyAttendanceCalendar: async (params?: {
    from?: string;
    to?: string;
  }): Promise<AttendanceCalendarResponse> => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    const queryString = query.toString();

    const response = await hrApiClient.get(
      `/attendance/calendar/me${queryString ? `?${queryString}` : ""}`,
    );
    // Unwrap standard envelope: { success: true, statusCode, data: <payload> }
    const body = response.data as {
      success?: boolean;
      data?: AttendanceCalendarResponse;
    } & AttendanceCalendarResponse;
    return (
      body?.success === true && body.data !== undefined ? body.data : body
    ) as AttendanceCalendarResponse;
  },

  /**
   * Get attendance detail for a specific date
   */
  getMyAttendanceDay: async (
    date: string,
  ): Promise<AttendanceCalendarDay | null> => {
    const response = await hrApiClient.get(`/attendance/calendar/me/${date}`);
    const body = response.data as {
      success?: boolean;
      data?: AttendanceCalendarDay | null;
    } & (AttendanceCalendarDay | null);
    return (
      body &&
      typeof body === "object" &&
      "success" in body &&
      (body as { success?: boolean }).success === true
        ? ((body as { success?: boolean; data?: AttendanceCalendarDay | null })
            .data ?? null)
        : body
    ) as AttendanceCalendarDay | null;
  },

  /**
   * Check if HR API is available
   */
  healthCheck: async (): Promise<boolean> => {
    try {
      await hrApiClient.get("/health", { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  },

  getMyTimesheet: async (
    params: MyTimesheetQuery,
  ): Promise<MyTimesheetResponse> => {
    const query = new URLSearchParams();
    query.set("month", String(params.month));
    query.set("year", String(params.year));
    const response = await hrApiClient.get(`/timesheet/me?${query.toString()}`);
    return unwrapHrEnvelope<MyTimesheetResponse>(response.data);
  },

  confirmMyTimesheet: async (
    params: MyTimesheetQuery,
  ): Promise<MyTimesheetConfirmation> => {
    const response = await hrApiClient.post("/timesheet/me/confirm", params);
    return unwrapHrEnvelope<MyTimesheetConfirmation>(response.data);
  },

  disputeMyTimesheet: async (
    params: MyTimesheetQuery & { note: string },
  ): Promise<MyTimesheetConfirmation> => {
    const response = await hrApiClient.post("/timesheet/me/dispute", params);
    return unwrapHrEnvelope<MyTimesheetConfirmation>(response.data);
  },

  getTeamTimesheet: async (
    params: TeamTimesheetQuery,
  ): Promise<TeamTimesheetResponse> => {
    const query = new URLSearchParams();
    if (params.periodId) query.set("periodId", params.periodId);
    if (params.month) query.set("month", String(params.month));
    if (params.year) query.set("year", String(params.year));
    const response = await hrApiClient.get(
      `/team/timesheet?${query.toString()}`,
    );
    return unwrapHrEnvelope<TeamTimesheetResponse>(response.data);
  },

  getMyLeave: async (params?: { year?: number }): Promise<MyLeaveResponse> => {
    const query = new URLSearchParams();
    if (params?.year) query.set("year", String(params.year));
    const response = await hrApiClient.get(
      `/leave/me${query.toString() ? `?${query.toString()}` : ""}`,
    );
    return unwrapHrEnvelope<MyLeaveResponse>(response.data);
  },

  createMyLeaveRequest: async (
    payload: CreateMyLeaveRequestPayload,
  ): Promise<LeaveRequest> => {
    const response = await hrApiClient.post("/leave/me/requests", payload);
    return unwrapHrEnvelope<LeaveRequest>(response.data);
  },

  cancelMyLeaveRequest: async (id: string): Promise<LeaveRequest> => {
    const response = await hrApiClient.post(`/leave/me/requests/${id}/cancel`);
    return unwrapHrEnvelope<LeaveRequest>(response.data);
  },

  getPendingLeaveApprovals: async (
    params: { page?: number; pageSize?: number } = {},
  ): Promise<PendingLeaveApprovalsResponse> => {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.pageSize) query.set("pageSize", String(params.pageSize));
    const response = await hrApiClient.get(
      `/leave/requests/pending-approval${query.toString() ? `?${query.toString()}` : ""}`,
    );
    const payload = unwrapHrEnvelope<PendingLeaveApprovalsApiPayload>(
      response.data,
    );
    return {
      items: payload.items ?? payload.data ?? [],
      pagination: payload.pagination,
    };
  },

  approveLeaveRequest: async (id: string): Promise<LeaveRequest> => {
    const response = await hrApiClient.post(`/leave/requests/${id}/approve`);
    return unwrapHrEnvelope<LeaveRequest>(response.data);
  },

  rejectLeaveRequest: async (id: string): Promise<LeaveRequest> => {
    const response = await hrApiClient.post(`/leave/requests/${id}/reject`);
    return unwrapHrEnvelope<LeaveRequest>(response.data);
  },

  createAttendanceExplanation: async (
    payload: CreateAttendanceExplanationPayload,
  ): Promise<AttendanceExplanation> => {
    const response = await hrApiClient.post(
      "/attendance/explanations/me",
      payload,
    );
    return unwrapHrEnvelope<AttendanceExplanation>(response.data);
  },

  getMyAttendanceExplanations: async (params?: {
    month?: number;
    year?: number;
  }): Promise<AttendanceExplanationListResponse> => {
    const query = new URLSearchParams();
    if (params?.month) query.set("month", String(params.month));
    if (params?.year) query.set("year", String(params.year));
    const response = await hrApiClient.get(
      `/attendance/explanations/me${query.toString() ? `?${query.toString()}` : ""}`,
    );
    return unwrapHrEnvelope<AttendanceExplanationListResponse>(response.data);
  },

  getPendingAttendanceExplanations:
    async (): Promise<AttendanceExplanationListResponse> => {
      const response = await hrApiClient.get(
        "/attendance/explanations/pending",
      );
      return unwrapHrEnvelope<AttendanceExplanationListResponse>(response.data);
    },

  approveAttendanceExplanation: async (
    id: string,
    note?: string,
  ): Promise<AttendanceExplanation> => {
    const response = await hrApiClient.post(
      `/attendance/explanations/${id}/approve`,
      {
        note,
      },
    );
    return unwrapHrEnvelope<AttendanceExplanation>(response.data);
  },

  rejectAttendanceExplanation: async (
    id: string,
    note?: string,
  ): Promise<AttendanceExplanation> => {
    const response = await hrApiClient.post(
      `/attendance/explanations/${id}/reject`,
      {
        note,
      },
    );
    return unwrapHrEnvelope<AttendanceExplanation>(response.data);
  },
};

/**
 * Utility to check if attendance data exists for current user
 */
export const checkAttendanceAccess = async (): Promise<{
  hasAccess: boolean;
  employeeId: string | null;
}> => {
  try {
    const data = await hrApi.getMyAttendanceCalendar({
      from: "2000-01-01",
      to: "2000-01-01",
    });
    if (data.items && data.items.length > 0) {
      return {
        hasAccess: true,
        employeeId: data.items[0]?.employeeId ?? null,
      };
    }
    return { hasAccess: false, employeeId: null };
  } catch {
    return { hasAccess: false, employeeId: null };
  }
};
