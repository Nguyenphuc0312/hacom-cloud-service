/**
 * Calendar Store - Manages calendar events state
 * Uses hr-api-service for all calendar operations (supports viewing others' calendars)
 */

import { create } from "zustand";
import { hrCalendarApi, type HRCalendarEvent } from "../features/api/hrCalendarApi";
import { toast } from "../utils/toast";
import { registerStoreResetter } from "./storeResetRegistry";

export type CalendarMode = "my" | "other" | "unit";
export type CalendarView = "day" | "week" | "month";

// Use EventType (local lowercase) for UI filters — mirror EventType in calendarEvents.ts
export type CalendarEventFilterType = "work" | "personal" | "task" | "meeting" | "attendance";

export type CalendarErrorCode =
  | "EMPLOYEE_LINK_REQUIRED"
  | "EMPLOYEE_INACTIVE"
  | "FORBIDDEN"
  | "UNAVAILABLE"
  | "NOT_FOUND"
  | "NETWORK_ERROR"
  | "UNKNOWN_ERROR";

interface CalendarState {
  // Current view state
  mode: CalendarMode;
  view: CalendarView;
  currentYear: number;
  currentMonth: number;
  selectedDate: Date;

  // Data state — stores HR calendar events
  events: HRCalendarEvent[];
  isLoading: boolean;
  error: string | null;
  errorCode: CalendarErrorCode | null;
  /**
   * True when the calendar feature could not load for any reason (HR/auth/
   * network). The chat app stays fully usable; the calendar widget just shows
   * a soft "unavailable" state. NEVER implies the chat session is expired.
   */
  calendarUnavailable: boolean;

  // Other user's calendar
  viewingUserId: string | null;
  viewingUserName: string | null;

  // Unit calendar
  viewingUnitId: string | null;
  viewingUnitName: string | null;

  // Filters - use local EventType
  filters: {
    types: CalendarEventFilterType[];
  };

  // Actions
  setMode: (mode: CalendarMode) => void;
  setView: (view: CalendarView) => void;
  setDate: (year: number, month: number) => void;
  setSelectedDate: (date: Date) => void;
  setFilters: (types: CalendarEventFilterType[]) => void;
  setViewingUser: (userId: string | null, userName: string | null) => void;
  setViewingUnit: (unitId: string | null, unitName: string | null) => void;
  resetCalendarData: () => void;

  // Data operations
  fetchEvents: (start?: string, end?: string) => Promise<void>;
  createEvent: (input: Parameters<typeof hrCalendarApi.createEvent>[0]) => Promise<HRCalendarEvent | null>;
  updateEvent: (eventId: string, input: Parameters<typeof hrCalendarApi.updateEvent>[1]) => Promise<boolean>;
  deleteEvent: (eventId: string) => Promise<boolean>;

  // Helpers
  getStartOfMonth: () => string;
  getEndOfMonth: () => string;
  goToPrevMonth: () => void;
  goToNextMonth: () => void;
  goToToday: () => void;
}

const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

let calendarRequestSequence = 0;

export const useCalendarStore = create<CalendarState>((set, get) => ({
  // Initial state
  mode: "my",
  view: "month",
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth(),
  selectedDate: new Date(),
  events: [],
  isLoading: false,
  error: null,
  errorCode: null,
  calendarUnavailable: false,
  viewingUserId: null,
  viewingUserName: null,
  viewingUnitId: null,
  viewingUnitName: null,
  filters: {
    types: [],
  },

  // Setters
  setMode: (mode) => {
    set({ mode, events: [], viewingUserId: null, viewingUserName: null, viewingUnitId: null, viewingUnitName: null, error: null, errorCode: null, calendarUnavailable: false });
    get().fetchEvents();
  },

  setView: (view) => set({ view }),

  setDate: (year, month) => set({ currentYear: year, currentMonth: month }),

  setSelectedDate: (date) => set({ selectedDate: date }),

  setFilters: (types) => {
    set({ filters: { types } });
    get().fetchEvents();
  },

  setViewingUser: (userId, userName) => {
    set({
      mode: "other",
      events: [],
      viewingUserId: userId,
      viewingUserName: userName,
      viewingUnitId: null,
      viewingUnitName: null,
    });
    // Trigger refetch immediately when viewing user changes
    get().fetchEvents();
  },

  setViewingUnit: (unitId, unitName) => {
    set({
      mode: "unit",
      events: [],
      viewingUserId: null,
      viewingUserName: null,
      viewingUnitId: unitId,
      viewingUnitName: unitName,
    });
  },

  resetCalendarData: () => {
    ++calendarRequestSequence;
    set({
      mode: "my",
      events: [],
      isLoading: false,
      error: null,
      errorCode: null,
      calendarUnavailable: false,
      viewingUserId: null,
      viewingUserName: null,
      viewingUnitId: null,
      viewingUnitName: null,
    });
  },

  // Data operations
  // Uses hr-api-service for all calendar events (supports viewing others' calendars)
  fetchEvents: async (start?: string, end?: string) => {
    const requestSequence = ++calendarRequestSequence;
    const state = get();
    const { mode, viewingUserId } = state;

    // Default to current month range
    const startDate = start || state.getStartOfMonth();
    const endDate = end || state.getEndOfMonth();

    set({ isLoading: true, error: null });

    try {
      let events: HRCalendarEvent[] = [];

      switch (mode) {
        case "my": {
          const myResponse = await hrCalendarApi.listEvents({
            scope: 'mine',
            from: startDate,
            to: endDate,
          });
          // Backend returns mode:'NO_HR_PROFILE' (200) when the auth user has no HR employee record.
          // Show a soft notice instead of a hard error — the grid stays visible and empty.
          if (myResponse.mode === 'NO_HR_PROFILE') {
            if (requestSequence !== calendarRequestSequence) return;
            set({
              events: [],
              isLoading: false,
              error: "Tài khoản chưa liên kết hồ sơ nhân sự. Lịch phòng ban và công ty sẽ khả dụng sau khi liên kết.",
              errorCode: "EMPLOYEE_LINK_REQUIRED",
              calendarUnavailable: true,
            });
            return;
          }
          events = Array.isArray(myResponse.data) ? myResponse.data : [];
          break;
        }
        case "other": {
          if (viewingUserId) {
            // Viewing another user's calendar.
            // Use ownerAuthUserId (auth-domain UUID) — backend resolves to correct employee/HR user.
            // DO NOT use ownerId here: it is ambiguous (backend expects employeeId, not authUserId).
            const otherResponse = await hrCalendarApi.listEvents({
              scope: 'person',
              ownerAuthUserId: viewingUserId,
              from: startDate,
              to: endDate,
              includeParticipantEvents: true,
            });
            events = Array.isArray(otherResponse.data) ? otherResponse.data : [];
          }
          break;
        }
        case "unit": {
          // TODO: Implement unit calendar API via hr-api-service
          toast.warning("Tính năng lịch đơn vị đang phát triển");
          set({ isLoading: false });
          return;
        }
      }

      if (requestSequence !== calendarRequestSequence) return;
      set({
        events,
        isLoading: false,
        error: null,
        errorCode: null,
        calendarUnavailable: false,
      });
    } catch (error) {
      if (requestSequence !== calendarRequestSequence) return;
      // The calendar is an OPTIONAL feature served by the HR API. Any failure
      // here — auth (401/403), business (422), server (5xx), or network — must
      // degrade gracefully WITHOUT logging the user out or claiming the chat
      // session expired. The chat app keeps working; only the calendar widget
      // shows a soft unavailable notice.
      console.error("Failed to fetch calendar events:", error);
      const axiosError = error as {
        response?: { status?: number; data?: { message?: string; errorCode?: string; code?: string } };
      };
      const status = axiosError.response?.status;
      const serverErrorCode =
        axiosError.response?.data?.errorCode ?? axiosError.response?.data?.code;

      if (
        status === 422 &&
        (serverErrorCode === "EMPLOYEE_LINK_REQUIRED" || serverErrorCode === "EMPLOYEE_CONTEXT_NOT_FOUND" || !serverErrorCode)
      ) {
        // Account not linked to an HR employee record — config issue, not a
        // transient error and definitely not a session problem.
        set({
          events: [],
          error:
            "Tài khoản của bạn chưa được liên kết với hồ sơ nhân sự nên chưa thể tải lịch cá nhân.",
          errorCode: "EMPLOYEE_LINK_REQUIRED",
          isLoading: false,
          calendarUnavailable: true,
        });
      } else if (status === 422 && serverErrorCode === "EMPLOYEE_INACTIVE") {
        set({
          events: [],
          error: "Hồ sơ nhân sự đang bị tạm ngưng nên chưa thể tải lịch.",
          errorCode: "EMPLOYEE_INACTIVE",
          isLoading: false,
          calendarUnavailable: true,
        });
      } else if (status === 403) {
        set({
          events: [],
          error: "Bạn không có quyền xem lịch này.",
          errorCode: "FORBIDDEN",
          isLoading: false,
          calendarUnavailable: true,
        });
      } else if (status === 401) {
        // An optional-feature 401 is NOT a chat session expiry. Do not show the
        // "phiên đăng nhập hết hạn" message and do not trigger any logout — the
        // chat/auth clients own the auth lifecycle, not the calendar.
        set({
          events: [],
          error: "Không tải được lịch. Vui lòng thử lại sau.",
          errorCode: "UNAVAILABLE",
          isLoading: false,
          calendarUnavailable: true,
        });
      } else {
        set({
          events: [],
          error: "Không tải được lịch. Vui lòng thử lại sau.",
          errorCode: "NETWORK_ERROR",
          isLoading: false,
          calendarUnavailable: true,
        });
      }
    }
  },

  createEvent: async (input) => {
    try {
      const event = await hrCalendarApi.createEvent(input);
      const state = get();

      // Add to events list if within current view range
      const eventStart = new Date(event.startAt);
      const stateStart = new Date(state.getStartOfMonth());
      const stateEnd = new Date(state.getEndOfMonth());

      if (eventStart >= stateStart && eventStart <= stateEnd) {
        set({ events: [...state.events, event] });
      }

      toast.success("Đã tạo sự kiện");
      return event;
    } catch (error) {
      console.error("Failed to create event:", error);
      toast.error("Không thể tạo sự kiện");
      return null;
    }
  },

  updateEvent: async (eventId, input) => {
    try {
      const updatedEvent = await hrCalendarApi.updateEvent(eventId, input);
      const state = get();

      // Update in events list
      set({
        events: state.events.map((e) => (e.id === eventId ? updatedEvent : e)),
      });

      toast.success("Đã cập nhật sự kiện");
      return true;
    } catch (error) {
      console.error("Failed to update event:", error);
      toast.error("Không thể cập nhật sự kiện");
      return false;
    }
  },

  deleteEvent: async (eventId) => {
    try {
      await hrCalendarApi.deleteEvent(eventId);
      const state = get();

      // Remove from events list
      set({
        events: state.events.filter((e) => e.id !== eventId),
      });

      toast.success("Đã xóa sự kiện");
      return true;
    } catch (error) {
      console.error("Failed to delete event:", error);
      toast.error("Không thể xóa sự kiện");
      return false;
    }
  },

  // Helpers
  getStartOfMonth: () => {
    const state = get();
    const date = new Date(state.currentYear, state.currentMonth, 1);
    return formatDate(date);
  },

  getEndOfMonth: () => {
    const state = get();
    const date = new Date(state.currentYear, state.currentMonth + 1, 0);
    return formatDate(date);
  },

  goToPrevMonth: () => {
    const state = get();
    if (state.currentMonth === 0) {
      set({ currentYear: state.currentYear - 1, currentMonth: 11 });
    } else {
      set({ currentMonth: state.currentMonth - 1 });
    }
  },

  goToNextMonth: () => {
    const state = get();
    if (state.currentMonth === 11) {
      set({ currentYear: state.currentYear + 1, currentMonth: 0 });
    } else {
      set({ currentMonth: state.currentMonth + 1 });
    }
  },

  goToToday: () => {
    const today = new Date();
    set({
      currentYear: today.getFullYear(),
      currentMonth: today.getMonth(),
      selectedDate: today,
    });
  },
}));

export default useCalendarStore;

registerStoreResetter("calendar", () => {
  useCalendarStore.getState().resetCalendarData();
});
