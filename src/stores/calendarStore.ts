/**
 * Calendar Store - Manages calendar events state
 * Uses hr-api-service for all calendar operations (supports viewing others' calendars)
 */

import { create } from "zustand";
import { hrCalendarApi, type HRCalendarEvent } from "../features/api/hrCalendarApi";
import { toast } from "../utils/toast";

export type CalendarMode = "my" | "other" | "unit";
export type CalendarView = "day" | "week" | "month";

// Use EventType (local lowercase) for UI filters
export type CalendarEventFilterType = "vietnam_holiday" | "international" | "work" | "personal" | "task" | "meeting" | "attendance";

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
  viewingUserId: null,
  viewingUserName: null,
  viewingUnitId: null,
  viewingUnitName: null,
  filters: {
    types: [],
  },

  // Setters
  setMode: (mode) => {
    set({ mode, viewingUserId: null, viewingUserName: null, viewingUnitId: null, viewingUnitName: null });
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
      viewingUserId: null,
      viewingUserName: null,
      viewingUnitId: unitId,
      viewingUnitName: unitName,
    });
  },

  // Data operations
  // Uses hr-api-service for all calendar events (supports viewing others' calendars)
  fetchEvents: async (start?: string, end?: string) => {
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
          // Current user's own calendar — no ownerId means "my calendar"
          const myResponse = await hrCalendarApi.listEvents({
            from: startDate,
            to: endDate,
          });
          events = myResponse.data;
          break;
        }
        case "other": {
          if (viewingUserId) {
            // Viewing another user's calendar — pass ownerId to hr-api-service
            // hr-api-service checks permission and returns 403 if not allowed
            const otherResponse = await hrCalendarApi.listEvents({
              ownerId: viewingUserId,
              from: startDate,
              to: endDate,
              includeParticipantEvents: true,
            });
            events = otherResponse.data;
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

      set({ events, isLoading: false, error: null });
    } catch (error) {
      console.error("Failed to fetch calendar events:", error);
      // Distinguish 403 (permission denied) from other errors
      const axiosError = error as { response?: { status?: number; data?: { message?: string } } };
      if (axiosError.response?.status === 403) {
        set({
          error: axiosError.response?.data?.message || "Bạn không có quyền xem lịch của người này.",
          isLoading: false,
          events: [], // Clear events on permission denied
        });
        toast.error("Bạn không có quyền xem lịch của người này.");
      } else {
        set({
          error: error instanceof Error ? error.message : "Không thể tải lịch",
          isLoading: false,
        });
        toast.error("Không thể tải lịch");
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
