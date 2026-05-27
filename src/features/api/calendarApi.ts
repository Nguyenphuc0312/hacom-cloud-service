/**
 * Calendar Event API - Frontend client for calendar events
 */

import apiClient from "../../lib/axios";

// Calendar event types (aligned with backend chat.calendar_event_type ENUM)
export type CalendarEventType = "PERSONAL" | "MEETING" | "ATTENDANCE" | "TASK" | "UNIT" | "LEADER";
export type CalendarVisibility = "PRIVATE" | "BUSY_ONLY" | "TEAM" | "UNIT" | "PUBLIC";
export type CalendarEventStatus = "CONFIRMED" | "TENTATIVE" | "CANCELLED";

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  type: CalendarEventType;
  source: "MANUAL" | "MEETING" | "ATTENDANCE" | "TASK" | "HRM";
  ownerUserId: string;
  ownerEmployeeId: string | null;
  unitId: string | null;
  departmentId: string | null;
  startAt: string;
  endAt: string;
  timezone: string;
  isAllDay: boolean;
  isRecurring: boolean;
  recurrenceRule: string | null;
  visibility: CalendarVisibility;
  status: CalendarEventStatus;
  attendees: string[];
  meetingChairman: string | null;
  meetingFormat: string | null;
  meetingLocation: string | null;
  metadata: Record<string, unknown>;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface CreateCalendarEventInput {
  title: string;
  description?: string;
  type: CalendarEventType;
  source?: "MANUAL" | "MEETING" | "ATTENDANCE" | "TASK" | "HRM";
  startAt: string;
  endAt: string;
  timezone?: string;
  isAllDay?: boolean;
  isRecurring?: boolean;
  recurrenceRule?: string;
  visibility?: CalendarVisibility;
  status?: CalendarEventStatus;
  attendees?: string[];
  meetingChairman?: string;
  meetingFormat?: string;
  meetingLocation?: string;
  metadata?: Record<string, unknown>;
  unitId?: string;
  departmentId?: string;
}

export interface UpdateCalendarEventInput {
  title?: string;
  description?: string;
  type?: CalendarEventType;
  startAt?: string;
  endAt?: string;
  timezone?: string;
  isAllDay?: boolean;
  isRecurring?: boolean;
  recurrenceRule?: string;
  visibility?: CalendarVisibility;
  status?: CalendarEventStatus;
  attendees?: string[];
  meetingChairman?: string;
  meetingFormat?: string;
  meetingLocation?: string;
  metadata?: Record<string, unknown>;
}

export interface CalendarEventFilters {
  start?: string;
  end?: string;
  types?: CalendarEventType[];
  status?: CalendarEventStatus;
}

// Backend API response shape
interface BackendResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  error?: unknown;
}

// Helper to extract data from backend API response
const getSuccessData = <T>(response: unknown): T | null => {
  const resp = response as BackendResponse<T>;
  if (resp && resp.success === true && resp.data !== undefined) {
    return resp.data;
  }
  return null;
};

export const calendarApi = {
  /**
   * Get calendar events for current user
   */
  getMyEvents: async (filters: CalendarEventFilters = {}): Promise<CalendarEvent[]> => {
    const params = new URLSearchParams();
    if (filters.start) params.set("start", filters.start);
    if (filters.end) params.set("end", filters.end);
    if (filters.types && filters.types.length > 0) params.set("types", filters.types.join(","));
    if (filters.status) params.set("status", filters.status);

    const query = params.toString();
    const response = await apiClient.get(
      `/calendar/events/me${query ? `?${query}` : ""}`
    );
    return getSuccessData<CalendarEvent[]>(response.data) || [];
  },

  /**
   * Get calendar events for a specific user
   */
  getUserEvents: async (userId: string, filters: CalendarEventFilters = {}): Promise<CalendarEvent[]> => {
    const params = new URLSearchParams();
    if (filters.start) params.set("start", filters.start);
    if (filters.end) params.set("end", filters.end);
    if (filters.types && filters.types.length > 0) params.set("types", filters.types.join(","));
    if (filters.status) params.set("status", filters.status);

    const query = params.toString();
    const response = await apiClient.get(
      `/calendar/events/users/${userId}${query ? `?${query}` : ""}`
    );
    return getSuccessData<CalendarEvent[]>(response.data) || [];
  },

  /**
   * Get all accessible calendar events
   */
  getEvents: async (filters: CalendarEventFilters = {}): Promise<CalendarEvent[]> => {
    const params = new URLSearchParams();
    if (filters.start) params.set("start", filters.start);
    if (filters.end) params.set("end", filters.end);
    if (filters.types && filters.types.length > 0) params.set("types", filters.types.join(","));
    if (filters.status) params.set("status", filters.status);

    const query = params.toString();
    const response = await apiClient.get(
      `/calendar/events${query ? `?${query}` : ""}`
    );
    return getSuccessData<CalendarEvent[]>(response.data) || [];
  },

  /**
   * Get calendar events for a unit
   */
  getUnitEvents: async (unitId: string, filters: CalendarEventFilters = {}): Promise<CalendarEvent[]> => {
    const params = new URLSearchParams();
    if (filters.start) params.set("start", filters.start);
    if (filters.end) params.set("end", filters.end);
    if (filters.types && filters.types.length > 0) params.set("types", filters.types.join(","));

    const query = params.toString();
    const response = await apiClient.get(
      `/calendar/units/${unitId}/events${query ? `?${query}` : ""}`
    );
    return getSuccessData<CalendarEvent[]>(response.data) || [];
  },

  /**
   * Get calendar events for unit leaders
   */
  getUnitLeaderEvents: async (unitId: string, filters: CalendarEventFilters = {}): Promise<CalendarEvent[]> => {
    const params = new URLSearchParams();
    if (filters.start) params.set("start", filters.start);
    if (filters.end) params.set("end", filters.end);
    if (filters.types && filters.types.length > 0) params.set("types", filters.types.join(","));

    const query = params.toString();
    const response = await apiClient.get(
      `/calendar/units/${unitId}/leaders${query ? `?${query}` : ""}`
    );
    return getSuccessData<CalendarEvent[]>(response.data) || [];
  },

  /**
   * Get a single calendar event by ID
   */
  getEventById: async (eventId: string): Promise<CalendarEvent> => {
    const response = await apiClient.get(`/calendar/events/${eventId}`);
    const data = getSuccessData<CalendarEvent>(response.data);
    if (!data) {
      throw new Error("Event not found");
    }
    return data;
  },

  /**
   * Create a new calendar event
   */
  createEvent: async (input: CreateCalendarEventInput): Promise<CalendarEvent> => {
    const response = await apiClient.post("/calendar/events", input);
    const data = getSuccessData<CalendarEvent>(response.data);
    if (!data) {
      throw new Error("Failed to create event");
    }
    return data;
  },

  /**
   * Update an existing calendar event
   */
  updateEvent: async (eventId: string, input: UpdateCalendarEventInput): Promise<CalendarEvent> => {
    const response = await apiClient.patch(`/calendar/events/${eventId}`, input);
    const data = getSuccessData<CalendarEvent>(response.data);
    if (!data) {
      throw new Error("Failed to update event");
    }
    return data;
  },

  /**
   * Delete a calendar event (soft delete)
   */
  deleteEvent: async (eventId: string): Promise<void> => {
    await apiClient.delete(`/calendar/events/${eventId}`);
  },
};

export default calendarApi;
