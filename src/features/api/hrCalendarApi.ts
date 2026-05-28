/**
 * HR Calendar API - Frontend client for HR calendar events
 * Calls hr-api-service calendar endpoints using the same auth token
 */

import { hrApiClient } from "./hrApi";

/**
 * HR Calendar event types (aligned with hr-api-service Prisma enums)
 */
export type HRCalendarEventType = "MEETING" | "TASK" | "LEAVE" | "DEADLINE" | "REMINDER" | "OTHER";
export type HRCalendarVisibility = "PRIVATE" | "BUSY_ONLY" | "TEAM" | "UNIT" | "PUBLIC";
export type HRParticipantResponse = "PENDING" | "ACCEPTED" | "DECLINED" | "MAYBE";

/**
 * Participant info from HR API
 */
export interface HRCalendarParticipant {
  id: string;
  employeeId: string;
  employee: {
    id: string;
    fullName: string;
    employeeCode: string;
  } | null;
  response: HRParticipantResponse;
  createdAt: string;
}

/**
 * Owner info from HR API
 */
export interface HRCalendarOwner {
  id: string;
  fullName: string;
  employeeCode: string;
}

/**
 * Full HR Calendar Event from hr-api-service
 */
export interface HRCalendarEvent {
  id: string;
  title: string;
  description: string | null;
  ownerId: string;
  owner: HRCalendarOwner | null;
  startAt: string;
  endAt: string;
  timezone: string;
  isAllDay: boolean;
  isRecurring: boolean;
  recurrenceRule: string | null;
  visibility: HRCalendarVisibility;
  eventType: HRCalendarEventType;
  location: string | null;
  participants: HRCalendarParticipant[];
  canEdit: boolean;
  canDelete: boolean;
  canViewFullDetails: boolean;
  isParticipant: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Calendar event response with pagination
 */
export interface HRCalendarEventsResponse {
  data: HRCalendarEvent[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

/**
 * HR Calendar Permission
 */
export interface HRCalendarPermission {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canViewFullDetails: boolean;
  reason?: string;
}

/**
 * List calendar events params
 */
export interface ListHREventsParams {
  ownerId?: string;
  from?: string;
  to?: string;
  type?: string;
  visibility?: string;
  includeParticipantEvents?: boolean;
  page?: number;
  pageSize?: number;
}

/**
 * HR Calendar API client
 */
export const hrCalendarApi = {
  /**
   * List calendar events
   * - No ownerId: returns current user's events
   * - ownerId = current user: returns current user's events
   * - ownerId != current user: checks permission, returns owner's events or 403
   */
  listEvents: async (params: ListHREventsParams = {}): Promise<HRCalendarEventsResponse> => {
    const searchParams = new URLSearchParams();
    if (params.ownerId) searchParams.append("ownerId", params.ownerId);
    if (params.from) searchParams.append("from", params.from);
    if (params.to) searchParams.append("to", params.to);
    if (params.type) searchParams.append("type", params.type);
    if (params.visibility) searchParams.append("visibility", params.visibility);
    if (params.includeParticipantEvents) {
      searchParams.append("includeParticipantEvents", String(params.includeParticipantEvents));
    }
    if (params.page) searchParams.append("page", String(params.page));
    if (params.pageSize) searchParams.append("pageSize", String(params.pageSize));

    const query = searchParams.toString();
    const response = await hrApiClient.get(
      `/calendar/events${query ? `?${query}` : ""}`
    );
    // ResponseEnvelopeInterceptor wraps the list as:
    // { success, statusCode, data: { items: HRCalendarEvent[], pagination: {...} } }
    // (legacy-list normalization converts { data: [], pagination } → { items: [], pagination })
    const body = response.data as {
      success?: boolean;
      data?: { items?: HRCalendarEvent[]; pagination?: Record<string, number | boolean> };
    };
    const items: HRCalendarEvent[] = Array.isArray(body?.data?.items)
      ? body.data!.items!
      : Array.isArray(body?.data)
        ? (body.data as unknown as HRCalendarEvent[])
        : [];
    const pg = body?.data?.pagination as Record<string, number | boolean> | undefined;
    return {
      data: items,
      pagination: {
        page:       typeof pg?.page       === "number"  ? pg.page       : 1,
        pageSize:   typeof pg?.pageSize   === "number"  ? pg.pageSize   : 50,
        totalItems: typeof pg?.total      === "number"  ? pg.total      : 0,
        totalPages: typeof pg?.totalPages === "number"  ? pg.totalPages : 0,
        hasNextPage:  pg?.hasNextPage  === true,
        hasPrevPage:  pg?.hasPreviousPage === true,
      },
    };
  },

  /**
   * Get a single calendar event by ID
   */
  getEvent: async (eventId: string): Promise<HRCalendarEvent> => {
    const response = await hrApiClient.get<{ data: HRCalendarEvent }>(
      `/calendar/events/${eventId}`
    );
    return response.data.data;
  },

  /**
   * Get event permissions
   */
  getEventPermissions: async (eventId: string): Promise<HRCalendarPermission> => {
    const response = await hrApiClient.get<{ data: HRCalendarPermission }>(
      `/calendar/events/${eventId}/permissions`
    );
    return response.data.data;
  },

  /**
   * Create a calendar event
   */
  createEvent: async (input: {
    title: string;
    description?: string;
    startAt: string;
    endAt: string;
    eventType?: string;
    visibility?: string;
    isAllDay?: boolean;
    location?: string;
    participantIds?: string[];
  }): Promise<HRCalendarEvent> => {
    const response = await hrApiClient.post<{ data: HRCalendarEvent }>(
      "/calendar/events",
      input
    );
    return response.data.data;
  },

  /**
   * Update a calendar event
   */
  updateEvent: async (
    eventId: string,
    input: {
      title?: string;
      description?: string;
      startAt?: string;
      endAt?: string;
      eventType?: string;
      visibility?: string;
      isAllDay?: boolean;
      location?: string;
    }
  ): Promise<HRCalendarEvent> => {
    const response = await hrApiClient.patch<{ data: HRCalendarEvent }>(
      `/calendar/events/${eventId}`,
      input
    );
    return response.data.data;
  },

  /**
   * Delete a calendar event
   */
  deleteEvent: async (eventId: string): Promise<void> => {
    await hrApiClient.delete(`/calendar/events/${eventId}`);
  },

  /**
   * Update participant response
   */
  updateMyResponse: async (
    eventId: string,
    response: HRParticipantResponse
  ): Promise<void> => {
    await hrApiClient.patch(`/calendar/events/${eventId}/participants/me`, {
      response,
    });
  },
};

export default hrCalendarApi;
