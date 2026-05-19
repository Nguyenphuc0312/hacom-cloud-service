import axios from "axios";
import type { AxiosInstance } from "axios";
import { HR_API_BASE_URL } from "../../config";
import { getAccessToken } from "../../services/tokenService";

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

  // Request interceptor to add auth token
  client.interceptors.request.use(
    (config) => {
      const token = getAccessToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  // Response interceptor for error handling
  client.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        // Auth error - trigger logout or refresh
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

    const response = await hrApiClient.get<AttendanceCalendarResponse>(
      `/attendance/calendar/me${queryString ? `?${queryString}` : ""}`
    );
    return response.data;
  },

  /**
   * Get attendance detail for a specific date
   */
  getMyAttendanceDay: async (date: string): Promise<AttendanceCalendarDay | null> => {
    const response = await hrApiClient.get<AttendanceCalendarDay | null>(
      `/attendance/calendar/me/${date}`
    );
    return response.data;
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
