import axios from "axios";
import type { AxiosInstance } from "axios";
import { HR_API_BASE_URL } from "../../config";
import { getAccessToken } from "../../services/tokenService";
import {
  compareIdentity,
  reportAuthIdentityMismatch,
} from "../../services/authIdentityGuard";
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

  // Request interceptor: attach the freshest token AND verify it belongs to the
  // current user. The HR/calendar 401 is the canary for cross-account token
  // contamination (shared-localStorage refresh token overwritten by another
  // tab → stale tab refreshes into another user's session). Sending that token
  // would silently act as the wrong user, so we block it and force a clean
  // re-login instead.
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
        logger.warn("hr-api", "auth_identity_mismatch_blocked", {
          tokenAuthUserId: identity.tokenAuthUserId,
          userId: identity.userId,
        });
        reportAuthIdentityMismatch(identity);
        return Promise.reject(new AuthIdentityMismatchError());
      }

      config.headers.Authorization = `Bearer ${token}`;
      return config;
    },
    (error) => Promise.reject(error)
  );

  // Response interceptor for error handling
  client.interceptors.response.use(
    (response) => {
      if (
        typeof response.data === "string" &&
        response.data.trimStart().startsWith("<!doctype html")
      ) {
        return Promise.reject(
          new Error("HR_API_HTML_RESPONSE: received HTML instead of JSON — check VITE_HR_API_BASE_URL")
        );
      }
      return response;
    },
    (error) => {
      if (error.response?.status === 401) {
        console.error("HR API: Authentication error");
      }
      return Promise.reject(error);
    }
  );

  return client;
};

export const hrApiClient = createHrApiClient();

/**
 * Attendance calendar types
 */
export type ClassificationStatus = "PASS" | "WARNING" | "REVIEW_REQUIRED" | "ESCALATED";
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
      `/attendance/calendar/me${queryString ? `?${queryString}` : ""}`
    );
    // Unwrap standard envelope: { success: true, statusCode, data: <payload> }
    const body = response.data as { success?: boolean; data?: AttendanceCalendarResponse } & AttendanceCalendarResponse;
    return (body?.success === true && body.data !== undefined ? body.data : body) as AttendanceCalendarResponse;
  },

  /**
   * Get attendance detail for a specific date
   */
  getMyAttendanceDay: async (date: string): Promise<AttendanceCalendarDay | null> => {
    const response = await hrApiClient.get(
      `/attendance/calendar/me/${date}`
    );
    const body = response.data as { success?: boolean; data?: AttendanceCalendarDay | null } & (AttendanceCalendarDay | null);
    return (body && typeof body === 'object' && 'success' in body && (body as { success?: boolean }).success === true
      ? (body as { success?: boolean; data?: AttendanceCalendarDay | null }).data ?? null
      : body) as AttendanceCalendarDay | null;
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
