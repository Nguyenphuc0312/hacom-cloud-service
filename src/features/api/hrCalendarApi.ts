/**
 * HR Calendar API - Frontend client for HR calendar events
 * Calls hr-api-service calendar endpoints using the same auth token
 */

import { hrApiClient } from "./hrApi";
import { logger } from "../../utils/logger";

/**
 * HR Calendar event types (aligned with hr-api-service Prisma enums)
 */
export type HRCalendarEventType = "MEETING" | "TASK" | "LEAVE" | "DEADLINE" | "REMINDER" | "OTHER" | "PERSONAL";
export type HRCalendarVisibility = "PRIVATE" | "BUSY_ONLY" | "TEAM" | "UNIT" | "PUBLIC";
export type HRParticipantResponse = "PENDING" | "ACCEPTED" | "DECLINED" | "MAYBE";

/**
 * Participant info from HR API
 */
export interface HRCalendarParticipant {
  id: string;
  employeeId: string;
  authUserId?: string | null;
  employeeCode?: string | null;
  fullName?: string | null;
  avatarUrl?: string | null;
  departmentName?: string | null;
  employee: {
    id: string;
    fullName: string;
    employeeCode: string;
  } | null;
  response: HRParticipantResponse;
  respondedAt?: string | null;
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
 * Attachment đính kèm 1 event (file/ảnh).
 * File được upload trước qua chat-api (purpose `calendar_attachment`), hr-api
 * chỉ lưu + trả lại metadata. `url` là URL tải/preview (public hoặc presigned).
 * Xem contract: chat-api-service/docs/requests/FE__calendar-attachments__contract__01-07-26.md
 */
export interface CalendarAttachmentDto {
  fileId: string;
  filename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  relationshipStatus?: "ACTIVE" | "REMOVED";
  metadataStatus?: "PENDING" | "READY" | "RESOLVE_FAILED" | "DELETED";
  downloadStatus?:
    | "READY"
    | "NOT_READY"
    | "TEMPORARILY_UNAVAILABLE"
    | "FORBIDDEN"
    | "DELETED";
  url: string | null;
  thumbnailUrl?: string | null;
}

/**
 * Full HR Calendar Event from hr-api-service
 */
export interface HRCalendarEvent {
  id: string;
  title: string;
  description: string | null;
  ownerId: string;
  ownerAuthUserId?: string | null;
  ownerEmployeeCode?: string | null;
  ownerName?: string | null;
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
  /** Meeting extras (meetingChairman, meetingFormat, attendees free-text…) — null khi BUSY_ONLY masked */
  metadata?: Record<string, unknown> | null;
  /** File/ảnh đính kèm — null/undefined nếu BE chưa hỗ trợ hoặc event không có. */
  attachments?: CalendarAttachmentDto[] | null;
  attachmentResolveStatus?: "OK" | "PENDING" | "PARTIAL_FAILED" | "FAILED" | "NONE" | null;
  participants: HRCalendarParticipant[];
  canEdit: boolean;
  canDelete: boolean;
  canViewFullDetails: boolean;
  isParticipant: boolean;
  createdAt: string;
  updatedAt: string;
}

export type HRCalendarMode = 'HR_LINKED' | 'NO_HR_PROFILE';

export interface HRCalendarCapabilities {
  canCreatePersonalEvent: boolean;
  canViewHrEvents: boolean;
  canViewDepartmentEvents: boolean;
  canRetryHrLink: boolean;
}

/**
 * Calendar event response with pagination.
 * `mode` is set when the backend returns a graceful fallback (e.g. HR profile not linked).
 * When absent, assume HR_LINKED for backward compatibility.
 */
export interface HRCalendarEventsResponse {
  mode?: HRCalendarMode;
  data: HRCalendarEvent[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  /** true = còn event chưa tải hết (chạm trần gom trang) → dữ liệu KHÔNG đầy đủ. */
  truncated?: boolean;
  capabilities?: HRCalendarCapabilities;
  warnings?: Array<{ code: string; message: string }>;
}

/**
 * Shareable join link for a MEETING event. Anyone with the raw token can add
 * themselves as a participant while the link is active — mirrors the group
 * chat invite-link feature. `token` is only ever non-null on the CREATE
 * response (raw token is never persisted server-side, so it can't be
 * recovered later — see FE__calendar-share-link contract).
 */
export interface HRCalendarShareLink {
  id: string;
  eventId: string;
  token: string | null;
  status: "ACTIVE" | "REVOKED";
  expiresAt: string | null;
  revokedAt: string | null;
  joinCount: number;
  createdAt: string;
}

export interface HRCalendarJoinByShareLinkResult {
  eventId: string;
  status: "joined" | "already_joined";
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
 *
 * Owner identity precedence:
 *  1. ownerAuthUserId — preferred; use the auth-domain UUID (externalAuthUserId from JWT).
 *     Backend resolves to the correct employee/HR user automatically.
 *  2. ownerId — legacy fallback; backend auto-detects whether it is an authUserId,
 *     employeeId, or HR userId and resolves it accordingly.
 *  3. Neither — returns the current authenticated user's own events.
 *
 * DO NOT pass `ownerId` equal to the auth user's UUID — use `ownerAuthUserId` instead.
 */
export interface ListHREventsParams {
  /** Explicit server-enforced data scope. Omit only for legacy callers; new callers must send it. */
  scope?: 'mine' | 'person' | 'unit';
  /** @deprecated Use ownerAuthUserId for explicit auth-domain filtering */
  ownerId?: string;
  /** Filter by auth user ID (externalAuthUserId / UUID from JWT) — preferred over ownerId */
  ownerAuthUserId?: string;
  from?: string;
  to?: string;
  type?: HRCalendarEventType;
  visibility?: HRCalendarVisibility;
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
   * - No owner params: returns current user's events
   * - ownerAuthUserId: filter by auth user UUID, backend resolves identity
   * - ownerId: legacy, backend auto-resolves (authUserId / employeeId / userId)
   */
  listEvents: async (params: ListHREventsParams = {}): Promise<HRCalendarEventsResponse> => {
    const searchParams = new URLSearchParams();
    if (params.scope) searchParams.append('scope', params.scope);
    if (params.ownerAuthUserId) searchParams.append("ownerAuthUserId", params.ownerAuthUserId);
    // Only append ownerId if ownerAuthUserId is not provided (backward compat)
    if (params.ownerId && !params.ownerAuthUserId) searchParams.append("ownerId", params.ownerId);
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
    // When user has no HR profile the backend returns:
    // { success, data: { mode: 'NO_HR_PROFILE', data: [], pagination, capabilities, warnings } }
    const body = response.data as {
      success?: boolean;
      data?: {
        mode?: HRCalendarMode;
        items?: HRCalendarEvent[];
        pagination?: Record<string, number | boolean>;
        capabilities?: HRCalendarCapabilities;
        warnings?: Array<{ code: string; message: string }>;
      };
    };
    const innerData = body?.data;
    const mode = innerData?.mode;
    const items: HRCalendarEvent[] = Array.isArray(innerData?.items)
      ? innerData!.items!
      : Array.isArray(innerData)
        ? (innerData as unknown as HRCalendarEvent[])
        : [];
    const pg = innerData?.pagination as Record<string, number | boolean> | undefined;
    return {
      mode,
      data: items,
      pagination: {
        page:       typeof pg?.page       === "number"  ? pg.page       : 1,
        pageSize:   typeof pg?.pageSize   === "number"  ? pg.pageSize   : 50,
        totalItems: typeof pg?.total      === "number"  ? pg.total      : 0,
        totalPages: typeof pg?.totalPages === "number"  ? pg.totalPages : 0,
        hasNextPage:  pg?.hasNextPage  === true,
        hasPrevPage:  pg?.hasPreviousPage === true,
      },
      capabilities: innerData?.capabilities,
      warnings: innerData?.warnings,
    };
  },

  /**
   * Lấy TOÀN BỘ event trong khoảng, gom đủ mọi trang.
   *
   * `listEvents` chỉ trả 1 trang — BE mặc định `pageSize = 20` (trần 100, xem
   * PaginationDto của hr-api). Lịch là màn hình theo KHOẢNG THỜI GIAN, không có
   * UI phân trang: gọi thẳng `listEvents` thì mọi event từ #21 trở đi biến mất
   * im lặng — API trả về nhưng lưới trống, không lỗi, không cách nào biết.
   *
   * Dùng pageSize 100 (trần) để giảm số vòng, rồi lặp tới khi hết `hasNextPage`.
   * `maxPages` là van an toàn, tránh vòng lặp vô hạn nếu BE trả pagination lỗi.
   *
   * Chạm `maxPages` mà BE vẫn báo còn trang → dữ liệu BỊ CẮT. Trường hợp đó phải
   * KÊU TO (log error + cờ `truncated`) chứ không im lặng: mất event âm thầm là
   * loại lỗi tốn nhiều giờ nhất để truy — nhìn từ UI y hệt "API không trả về".
   */
  listAllEvents: async (
    params: ListHREventsParams = {},
    maxPages = 20,
  ): Promise<HRCalendarEventsResponse> => {
    const pageSize = params.pageSize ?? 100;
    const first = await hrCalendarApi.listEvents({ ...params, page: 1, pageSize });
    // NO_HR_PROFILE (và mọi mode đặc biệt) → trả nguyên, không gom thêm.
    if (first.mode || !first.pagination.hasNextPage) return first;

    const all = [...first.data];
    let page = 1;
    let hasNext: boolean = first.pagination.hasNextPage;
    while (hasNext && page < maxPages) {
      page += 1;
      const next = await hrCalendarApi.listEvents({ ...params, page, pageSize });
      all.push(...next.data);
      hasNext = next.pagination.hasNextPage;
    }

    // Vẫn còn trang sau khi hết maxPages ⇒ đã cắt bớt event.
    const truncated = hasNext;
    if (truncated) {
      logger.error("calendar", "event_list_truncated", {
        loadedEvents: all.length,
        pagesFetched: page,
        maxPages,
        pageSize,
        totalReportedByServer: first.pagination.totalItems,
        from: params.from,
        to: params.to,
        scope: params.scope,
      });
    }

    return {
      ...first,
      data: all,
      truncated,
      pagination: { ...first.pagination, page, hasNextPage: hasNext },
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

  getAttachmentDownloadUrl: async (
    eventId: string,
    fileId: string,
  ): Promise<{
    fileId: string;
    url: string | null;
    downloadStatus: NonNullable<CalendarAttachmentDto["downloadStatus"]>;
  }> => {
    const response = await hrApiClient.get<{
      data: {
        fileId: string;
        url: string | null;
        downloadStatus: NonNullable<CalendarAttachmentDto["downloadStatus"]>;
      };
    }>(
      `/calendar/events/${encodeURIComponent(eventId)}/attachments/${encodeURIComponent(fileId)}/download-url`,
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
    eventType?: HRCalendarEventType;
    visibility?: HRCalendarVisibility;
    isAllDay?: boolean;
    location?: string;
    timezone?: string;
    /** Participant refs — backend resolve theo employee cuid / employeeCode / authUserId */
    participantIds?: string[];
    /** Tên người tham gia dạng free-text (không resolve được) — lưu vào metadata */
    attendees?: string[];
    meetingChairman?: string;
    /** Identity chủ trì (employee cuid / employeeCode / authUserId) — BE resolve
     *  để chủ trì có avatar thật + được cấp quyền sửa. Tên không mang identity. */
    meetingChairmanRef?: string;
    meetingFormat?: string;
    /** fileId đã upload xong qua chat-api (purpose calendar_attachment). BE lưu + trả lại trong `attachments`. */
    attachmentFileIds?: string[];
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
      eventType?: HRCalendarEventType;
      visibility?: HRCalendarVisibility;
      isAllDay?: boolean;
      location?: string;
      timezone?: string;
      /** Full desired participant set (employee cuid / employeeCode / authUserId); server reconciles. */
      participantIds?: string[];
      /** Tên người tham gia dạng free-text — merge vào metadata */
      attendees?: string[];
      meetingChairman?: string;
      /** Identity chủ trì (employee cuid / employeeCode / authUserId) — BE resolve
       *  để chủ trì có avatar thật + được cấp quyền sửa. */
      meetingChairmanRef?: string;
      meetingFormat?: string;
      /** Full desired set fileId (giống participantIds reconcile): gửi đủ để giữ file cũ + thêm file mới. Bỏ field = không đụng attachments. */
      attachmentFileIds?: string[];
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

  /**
   * Create (or reuse) a share link for a MEETING event. Only TEAM/UNIT/PUBLIC
   * visibility is allowed server-side — PRIVATE/BUSY_ONLY events reject with
   * 422 SHARE_LINK_NOT_ALLOWED_FOR_VISIBILITY (joining grants full detail
   * view, which would defeat those visibility choices if a link leaked).
   */
  createShareLink: async (eventId: string): Promise<HRCalendarShareLink> => {
    const response = await hrApiClient.post<{ data: HRCalendarShareLink }>(
      `/calendar/events/${eventId}/share-link`,
    );
    return response.data.data;
  },

  /** Revoke the event's active share link (if any). */
  revokeShareLink: async (eventId: string): Promise<void> => {
    await hrApiClient.delete(`/calendar/events/${eventId}/share-link`);
  },

  /**
   * Join an event via a share-link token — adds the current user as an
   * ACCEPTED participant. Requires an HR-linked account (EMPLOYEE_LINK_REQUIRED
   * otherwise); token itself never requires an existing invite.
   */
  joinByShareLink: async (
    token: string,
  ): Promise<HRCalendarJoinByShareLinkResult> => {
    const response = await hrApiClient.post<{
      data: HRCalendarJoinByShareLinkResult;
    }>("/calendar/join-by-share-link", { token });
    return response.data.data;
  },
};

export default hrCalendarApi;
