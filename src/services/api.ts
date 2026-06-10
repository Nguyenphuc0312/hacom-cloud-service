/**
 * @fileoverview API Services
 * Tất cả các API calls
 */

import apiClient, {
  authClient,
  authenticatedAuthClient,
} from "../lib/axios";
import axios from "axios";
import { ErrorCode, type ApiResponse } from "@hacom/chat-shared-types/core";
import type {
  LoginResponse,
  RefreshTokenResponse,
  RegisterResponseDto,
} from "@hacom/chat-shared-types/auth";
import type {
  CompleteUploadRequest,
  CompleteUploadResponse,
  CreateDirectConversationDto,
  CreateMessageResponse,
  FriendshipCapabilitiesDto,
  FriendshipPendingCountDto,
  FriendshipRelationDto,
  FriendshipStatusResponseDto,
  FriendshipWriteResponseDto,
  GetDownloadUrlResponse,
  MarkReadResponseData,
  ConversationReadStateDto,
  RoomMessagesResponse,
  UnreadFeedResponseDto,
  UploadSignedUrlRequest,
  UploadSignedUrlResponse,
} from "@hacom/chat-shared-types/chat";
import type { User } from "../stores/authStore";
import type { Attachment, Conversation, Message } from "../types";
import { RoomMemberRole } from "../types";
import {
  normalizeConversation,
  normalizeConversationsPayload,
} from "../lib/conversationAdapter";
import { ApiContractError, unwrapApiSuccess } from "../lib/apiContract";
import { AUTH_ENDPOINTS } from "../lib/authEndpoints";
import {
  getCsrfToken,
  isRefreshTokenCookieMode,
  isRememberMeEnabled,
  storeTokens,
  updateAccessToken,
} from "./tokenService";
import { isUuid } from "../utils/isUuid"; 
import { logger } from "../utils/logger"; 
import { createNormalizedURLSearchParams } from "../utils/unicodeNormalize"; 

const DIRECT_DM_TRACE_PREFIX = "direct_dm.request_trace";
const DIRECT_DM_PATH = "/conversations/direct";

const buildDirectDmTraceRequestId = (): string => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `direct-dm:${crypto.randomUUID()}`;
  }

  return `direct-dm:${Date.now()}:${Math.random().toString(36).slice(2)}`;
};

export const buildCreateDirectConversationPayload = (
  userId: string,
): CreateDirectConversationDto => {
  const peerUserId = typeof userId === "string" ? userId.trim() : "";

  if (!peerUserId) {
    throw new ApiContractError("peerUserId is required", {
      statusCode: 422,
      code: ErrorCode.VALIDATION_ERROR,
      details: [
        {
          field: "peerUserId",
          message: "peerUserId is required",
        },
      ],
    });
  }

  if (!isUuid(peerUserId)) {
    throw new ApiContractError("peerUserId must be a valid UUID", {
      statusCode: 422,
      code: ErrorCode.VALIDATION_ERROR,
      details: [
        {
          field: "peerUserId",
          message: "peerUserId must be a valid UUID",
        },
      ],
    });
  }

  return { peerUserId };
};

const LEGACY_INTERNAL_GROUP_AVATAR_PREFIXES = ["/uploads/", "/chat-files/"];

export type FileUploadPurpose =
  | "message_attachment"
  | "user_avatar"
  | "group_avatar";

export interface ReserveFileUploadPayload { 
  uploadId?: string;
  purpose: FileUploadPurpose; 
  conversationId?: string; 
  groupId?: string; 
  filename: string; 
  mimeType: string; 
  sizeBytes: number; 
} 

type ReserveFileUploadRequest = Omit<UploadSignedUrlRequest, "conversationId"> & {
  uploadId?: string;
  purpose: FileUploadPurpose;
  conversationId?: string;
  groupId?: string;
};

interface UploadToSignedUrlOptions {
  method?: string;
  headers?: Record<string, string>;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}

const normalizeGroupAvatarUrlForRequest = ( 
  avatarUrl?: string | null, 
): string | undefined => { 
  if (typeof avatarUrl !== "string") {
    return undefined;
  }

  const trimmed = avatarUrl.trim();
  if (!trimmed) {
    return undefined;
  }

  if (
    LEGACY_INTERNAL_GROUP_AVATAR_PREFIXES.some((prefix) =>
      trimmed.startsWith(prefix),
    )
  ) {
    return trimmed;
  }

  try {
    const browserOrigin =
      typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost";
    const resolved = new URL(trimmed, browserOrigin);
    const apiBaseOrigin = apiClient.defaults.baseURL
      ? new URL(apiClient.defaults.baseURL, browserOrigin).origin
      : null;
    const allowedOrigins = new Set([browserOrigin, apiBaseOrigin].filter(Boolean));

    if (
      (resolved.protocol === "http:" || resolved.protocol === "https:") &&
      allowedOrigins.has(resolved.origin) &&
      LEGACY_INTERNAL_GROUP_AVATAR_PREFIXES.some((prefix) =>
        resolved.pathname.startsWith(prefix),
      )
    ) {
      return trimmed;
    }
  } catch {
    return undefined;
  }

  return undefined;
};

type EmailOtpChallengePurpose = "signup";

export interface RegisterVerificationChallengeContext {
  challengeId?: string | null;
  expiresAt?: string | null;
  resendAvailableAt?: string | null;
  ttlSeconds?: number;
  purpose?: EmailOtpChallengePurpose;
}

export interface RegisterResponseWithVerificationContext extends RegisterResponseDto {
  challengeId?: string | null;
  expiresAt?: string | null;
  resendAvailableAt?: string | null;
  ttlSeconds?: number;
  purpose?: EmailOtpChallengePurpose;
  emailVerificationChallenge?: RegisterVerificationChallengeContext | null;
}

export interface EmailOtpChallengeResponse {
  challengeId: string | null;
  expiresAt: string | null;
  resendAvailableAt: string | null;
  ttlSeconds: number;
  maskedEmail: string;
  sent: boolean;
  verified?: boolean;
}

export interface ConfirmEmailOtpChallengeResponse {
  verified: true;
  status: string;
  alreadyVerified?: boolean;
}

export interface ActivationOtpResponse {
  sent: boolean;
  maskedEmail?: string | null;
  resendAvailableAt?: string | null;
  nextAction?: "VERIFY_OTP" | "SET_PASSWORD";
}

export interface ActivationVerifyResponse {
  user?: User;
  accessToken?: string;
  refreshToken?: string;
  tokens?: {
    accessToken?: string;
    refreshToken?: string;
  };
  nextAction?: "VERIFY_OTP" | "SET_PASSWORD";
  requiresPasswordSetup?: boolean;
  verificationProof?: string | null;
}

interface ChangePasswordResponseData {
  accessToken?: string;
  refreshToken?: string;
  tokens?: {
    accessToken?: string;
    refreshToken?: string;
  };
  mustChangePassword?: boolean;
  nextAction?: string;
}

const canonicalConversationPath = (conversationId: string): string =>
  `/conversations/${conversationId}`;

const canonicalConversationMessagesPath = (conversationId: string): string =>
  `${canonicalConversationPath(conversationId)}/messages`;

const normalizeUnreadCountPayload = (
  payload: unknown,
): { unreadCount: number } => {
  if (payload && typeof payload === "object") {
    const unread = (payload as { unreadCount?: unknown }).unreadCount;
    if (typeof unread === "number" && Number.isFinite(unread)) {
      return { unreadCount: unread };
    }

    const legacyCount = (payload as { count?: unknown }).count;
    if (typeof legacyCount === "number" && Number.isFinite(legacyCount)) {
      return { unreadCount: legacyCount };
    }
  }

  return { unreadCount: 0 };
};

const normalizeConversationReadState = (
  payload: unknown,
): ConversationReadStateDto => {
  const record =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const asFiniteNumber = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  const asStringValue = (value: unknown): string | null =>
    typeof value === "string" && value.trim().length > 0 ? value : null;

  return {
    unreadCount: asFiniteNumber(record.unreadCount) ?? 0,
    lastReadSeq: asFiniteNumber(record.lastReadSeq) ?? 0,
    lastReadMessageId: asStringValue(record.lastReadMessageId),
    lastReadAt: asStringValue(record.lastReadAt),
    firstUnreadMessageId: asStringValue(record.firstUnreadMessageId),
    firstUnreadMessageAt: asStringValue(record.firstUnreadMessageAt),
  };
};

const normalizePinnedMessagesPayload = (
  payload: unknown,
): { messages: Message[] } => {
  if (Array.isArray(payload)) {
    return { messages: payload as Message[] };
  }

  if (payload && typeof payload === "object") {
    const messages = (payload as { messages?: unknown }).messages;
    if (Array.isArray(messages)) {
      return { messages: messages as Message[] };
    }
  }

  return { messages: [] };
};

const persistAuthTokensFromPayload = (
  payload: ChangePasswordResponseData,
): void => {
  const accessToken =
    payload.tokens?.accessToken ?? payload.accessToken ?? null;
  const refreshToken =
    payload.tokens?.refreshToken ?? payload.refreshToken ?? null;

  if (!accessToken) {
    return;
  }

  if (isRefreshTokenCookieMode()) {
    updateAccessToken(accessToken);
    return;
  }

  if (!refreshToken) {
    return;
  }

  storeTokens(accessToken, refreshToken, isRememberMeEnabled());
};

// ============================================
// AUTH API
// ============================================
// Auth endpoints are resolved through authClient using canonical
// AUTH_BASE_URL (/api/v1/auth by default).

export const authApi = {
  login: async (
    email: string,
    password: string,
    rememberMe = false,
  ) => {
    const response = await authClient.post<ApiResponse<LoginResponse>>(
      AUTH_ENDPOINTS.login,
      { email, password, rememberMe },
    );
    return response.data;
  },

  requestActivationOtp: async (data: { activationTicket: string }) => {
    const response = await authClient.post<ApiResponse<ActivationOtpResponse>>(
      AUTH_ENDPOINTS.activationRequest,
      data,
    );
    return response.data;
  },

  resendActivationOtp: async (data: { activationTicket: string }) => {
    const response = await authClient.post<ApiResponse<ActivationOtpResponse>>(
      AUTH_ENDPOINTS.activationResend,
      data,
    );
    return response.data;
  },

  verifyActivationOtp: async (data: {
    activationTicket: string;
    otp?: string;
    password?: string;
    confirmPassword?: string;
    verificationProof?: string;
  }) => {
    const response = await authClient.post<
      ApiResponse<ActivationVerifyResponse>
    >(AUTH_ENDPOINTS.activationVerify, data);
    return response.data;
  },

  register: async (data: { email: string; password: string }) => {
    const response = await authClient.post<
      ApiResponse<RegisterResponseWithVerificationContext>
    >(AUTH_ENDPOINTS.register, data);
    return response.data;
  },

  requestEmailOtpChallenge: async (data: {
    email: string;
    userId?: string;
    purpose?: EmailOtpChallengePurpose;
  }) => {
    const response = await authClient.post<
      ApiResponse<EmailOtpChallengeResponse>
    >(AUTH_ENDPOINTS.requestEmailOtpChallenge, data);
    return response.data;
  },

  confirmEmailOtpChallenge: async (data: {
    challengeId: string;
    otp: string;
    purpose?: EmailOtpChallengePurpose;
  }) => {
    const response = await authClient.post<
      ApiResponse<ConfirmEmailOtpChallengeResponse>
    >(AUTH_ENDPOINTS.confirmEmailOtpChallenge, data);
    return response.data;
  },

  resendEmailOtpChallenge: async (data: {
    challengeId: string;
    purpose?: EmailOtpChallengePurpose;
  }) => {
    const response = await authClient.post<
      ApiResponse<EmailOtpChallengeResponse>
    >(AUTH_ENDPOINTS.resendEmailOtpChallenge, data);
    return response.data;
  },

  logout: async () => {
    const csrfToken = isRefreshTokenCookieMode() ? getCsrfToken() : undefined;
    await authClient.post(AUTH_ENDPOINTS.logout, undefined, {
      withCredentials: isRefreshTokenCookieMode(),
      headers: csrfToken ? { "X-CSRF-Token": csrfToken } : undefined,
    });
  },

  refreshToken: async (refreshToken?: string) => {
    const csrfToken = isRefreshTokenCookieMode() ? getCsrfToken() : undefined;
    const response = await authClient.post<ApiResponse<RefreshTokenResponse>>(
      AUTH_ENDPOINTS.refresh,
      refreshToken ? { refreshToken } : undefined,
      {
        withCredentials: isRefreshTokenCookieMode(),
        headers: csrfToken ? { "X-CSRF-Token": csrfToken } : undefined,
      },
    );
    return response.data;
  },

  forgotPassword: async (email: string) => {
    const response = await authClient.post<ApiResponse<{ message: string }>>(
      AUTH_ENDPOINTS.forgotPassword,
      { email },
    );
    return response.data;
  },

  resetPassword: async (
    token: string,
    newPassword: string,
    confirmPassword: string,
  ) => {
    const response = await authClient.post<ApiResponse<{ message: string }>>(
      AUTH_ENDPOINTS.resetPassword,
      { token, newPassword, confirmPassword },
    );
    return response.data;
  },

  changePassword: async (data: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
    logoutOtherDevices?: boolean;
  }) => {
    const response = await authenticatedAuthClient.post<
      ApiResponse<ChangePasswordResponseData>
    >(
      AUTH_ENDPOINTS.changePassword,
      data,
    );
    persistAuthTokensFromPayload(unwrapApiSuccess(response.data));
    return response.data;
  },
};

// ============================================
// USER API
// ============================================

export const userApi = {
  getProfile: async () => {
    const response = await apiClient.get<ApiResponse<User>>("/users/profile");
    return response.data;
  },

  syncProfile: async () => {
    const response = await apiClient.post<ApiResponse<User>>("/users/profile/sync");
    return response.data;
  },

  updateProfile: async (data: Partial<User>) => {
    const response = await apiClient.put<ApiResponse<User>>(
      "/users/profile",
      data,
    );
    return response.data;
  },

  patchProfile: async (data: Partial<User>) => {
    try {
      const response = await apiClient.patch<ApiResponse<User>>(
        "/users/profile",
        data,
      );
      return response.data;
    } catch (error) {
      if (!axios.isAxiosError(error) || error.response?.status !== 404) {
        throw error;
      }

      // Backward-compatible fallback for legacy profile update contract.
      const response = await apiClient.put<ApiResponse<User>>(
        "/users/profile",
        data,
      );
      return response.data;
    }
  },

  attachAvatar: async (payload: { fileId?: string; uploadId?: string }) => { 
    const response = await apiClient.post<ApiResponse<User>>(
      "/users/avatar/attach",
      payload,
    );
    return response.data;
  },

  updateStatus: async (status: User["status"]) => {
    const response = await apiClient.put<ApiResponse<User>>("/users/status", {
      status,
    });
    return response.data;
  },

  searchUsers: async (
    query: string,
    page = 1,
    limit = 20,
    options?: { signal?: AbortSignal; includeSelf?: boolean },
  ) => {
    const searchParams = createNormalizedURLSearchParams({
      q: query,
      page: String(page),
      limit: String(limit),
      ...(options?.includeSelf && { includeSelf: "true" }),
    });
    const response = await apiClient.get<ApiResponse<User[]>>(
      `/users/search?${searchParams.toString()}`,
      { signal: options?.signal },
    );
    return response.data;
  },

  getUserById: async (userId: string) => {
    const response = await apiClient.get<ApiResponse<User>>(`/users/${userId}`);
    return response.data;
  },

  checkUsername: async (username: string) => {
    const response = await apiClient.get<ApiResponse<{ available: boolean }>>(
      `/users/check-username/${encodeURIComponent(username)}`,
    );
    return response.data;
  },

  updateUsername: async (username: string) => {
    const response = await apiClient.put<ApiResponse<User>>("/users/username", {
      username,
    });
    return response.data;
  },

  deleteAccount: async (password: string, confirmation = "DELETE") => {
    const response = await apiClient.delete<ApiResponse<void>>(
      "/users/account",
      { data: { password, confirmation } },
    );
    return response.data;
  },
};

// ============================================
// CONVERSATION API
// ============================================

export const conversationApi = {
  getConversations: async (
    page = 1,
    limit = 50,
    options?: { updatedAfter?: string },
  ) => {
    const query = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (options?.updatedAfter) {
      query.set("updatedAfter", options.updatedAfter);
    }
    const response = await apiClient.get<ApiResponse<unknown>>(
      `/conversations?${query.toString()}`,
    );

    if (!response.data.success) {
      return response.data as ApiResponse<Conversation[]>;
    }

    return {
      ...response.data,
      data: normalizeConversationsPayload(response.data.data),
    };
  },

  getUnreadSummary: async () => {
    const response = await apiClient.get<
      ApiResponse<{
        totalUnreadCount: number;
        conversations: Array<{
          conversationId: string;
          unreadCount: number;
          lastReadSeq: number;
          lastReadMessageId: string | null;
          lastReadAt: string | null;
        }>;
      }>
    >("/conversations/unread-summary");
    return response.data;
  },

  getGroupInviteInbox: async (status?: "pending" | "accepted" | "declined") => {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    const response = await apiClient.get<ApiResponse<unknown[]>>(
      `/conversations/group-invites${query}`,
    );
    return response.data;
  },

  getConversationById: async (conversationId: string) => {
    const response = await apiClient.get<ApiResponse<unknown>>(
      `/conversations/${conversationId}`,
    );

    if (!response.data.success) {
      return response.data as ApiResponse<Conversation>;
    }

    const normalized = normalizeConversation(response.data.data);
    return {
      ...response.data,
      data: (normalized ??
        (response.data.data as Conversation)) as Conversation,
    };
  },

  createPrivateConversation: async (userId: string) => {
    const requestId = buildDirectDmTraceRequestId();
    const payload = buildCreateDirectConversationPayload(userId);

    logger.debug("direct_dm", DIRECT_DM_TRACE_PREFIX, {
      requestId,
      method: "POST",
      url: DIRECT_DM_PATH,
      rawInputUserId: userId,
      payload,
      diagnostics:
        typeof window !== "undefined"
          ? window.__CHAT_WEB_DIAGNOSTICS__
          : undefined,
    });

    const response = await apiClient.post<ApiResponse<unknown>>(
      DIRECT_DM_PATH,
      payload,
      {
        headers: {
          "X-Request-Id": requestId,
        },
      },
    );

    if (!response.data.success) {
      return response.data as ApiResponse<Conversation>;
    }

    const normalized = normalizeConversation(response.data.data);
    return {
      ...response.data,
      data: (normalized ??
        (response.data.data as Conversation)) as Conversation,
    };
  },

  createGroupConversation: async (data: { 
    name: string; 
    memberIds: string[]; 
    avatar?: string; 
    avatarFileId?: string;
    description?: string; 
  }) => { 
    const avatarUrl = normalizeGroupAvatarUrlForRequest(data.avatar); 
    const response = await apiClient.post<ApiResponse<unknown>>("/groups", { 
      type: "basic_group", 
      title: data.name, 
      memberIds: data.memberIds, 
      description: data.description, 
      ...(avatarUrl ? { avatarUrl } : {}), 
      ...(data.avatarFileId ? { avatarFileId: data.avatarFileId } : {}),
    }); 

    if (!response.data.success) {
      return response.data as ApiResponse<Conversation>;
    }

    const normalized = normalizeConversation(response.data.data);
    return {
      ...response.data,
      data: (normalized ??
        (response.data.data as Conversation)) as Conversation,
    };
  },

  updateConversation: async (
    conversationId: string,
    data: Partial<Conversation>,
  ) => {
    const response = await apiClient.patch<ApiResponse<Conversation>>(
      canonicalConversationPath(conversationId),
      data,
    );
    return response.data;
  },

  deleteConversation: async (conversationId: string) => {
    await apiClient.delete(`/conversations/${conversationId}`);
  },

  addMembers: async (conversationId: string, memberIds: string[]) => {
    // Backend expects a single userId per request, so add sequentially.
    for (const userId of memberIds) {
      await apiClient.post<ApiResponse<unknown>>(
        `${canonicalConversationPath(conversationId)}/members`,
        { userId },
      );
    }

    // API returns RoomMember for add-member. Refresh room to get full Conversation shape.
    return conversationApi.getConversationById(conversationId);
  },

  inviteToGroup: async (conversationId: string, inviteeId: string) => {
    const response = await apiClient.post<ApiResponse<unknown>>(
      `${canonicalConversationPath(conversationId)}/invites`,
      { inviteeId },
    );
    return response.data;
  },

  acceptGroupInvite: async (conversationId: string, inviteId: string) => {
    const response = await apiClient.post<ApiResponse<unknown>>(
      `${canonicalConversationPath(conversationId)}/invites/${inviteId}/accept`,
    );
    return response.data;
  },

  declineGroupInvite: async (conversationId: string, inviteId: string) => {
    const response = await apiClient.post<ApiResponse<unknown>>(
      `${canonicalConversationPath(conversationId)}/invites/${inviteId}/decline`,
    );
    return response.data;
  },

  removeMember: async (conversationId: string, userId: string) => {
    await apiClient.delete(
      `${canonicalConversationPath(conversationId)}/members/${userId}`,
    );
  },

  removeMembers: async (conversationId: string, memberIds: string[]) => {
    // Backend expects path param, so we remove one by one
    for (const userId of memberIds) {
      await apiClient.delete(
        `${canonicalConversationPath(conversationId)}/members/${userId}`,
      );
    }
  },

  leaveConversation: async (conversationId: string) => {
    await apiClient.post(`${canonicalConversationPath(conversationId)}/leave`);
  },

  getMembers: async (conversationId: string, page = 1, limit = 100) => {
    const response = await apiClient.get<ApiResponse<unknown>>(
      `${canonicalConversationPath(conversationId)}/members?page=${page}&limit=${limit}`,
    );
    return response.data;
  },

  updateMemberRole: async (
    conversationId: string,
    userId: string,
    role: RoomMemberRole.ADMIN | RoomMemberRole.MEMBER | "owner",
  ) => {
    const response = await apiClient.patch<ApiResponse<unknown>>(
      `${canonicalConversationPath(conversationId)}/members/${userId}/role`,
      { role },
    );
    return response.data;
  },

  markAsRead: async (
    conversationId: string,
    input?:
      | string
      | {
          lastVisibleMessageId?: string;
          lastReadSeq?: number;
          messageId?: string;
        },
  ): Promise<MarkReadResponseData> => {
    const payload =
      typeof input === "string"
        ? { lastVisibleMessageId: input }
        : input &&
            (input.lastVisibleMessageId ||
              input.messageId ||
              (typeof input.lastReadSeq === "number" &&
                Number.isFinite(input.lastReadSeq)))
          ? {
              ...(input.lastVisibleMessageId
                ? { lastVisibleMessageId: input.lastVisibleMessageId }
                : {}),
              ...(input.messageId ? { messageId: input.messageId } : {}),
              ...(typeof input.lastReadSeq === "number" &&
              Number.isFinite(input.lastReadSeq)
                ? { lastReadSeq: input.lastReadSeq }
                : {}),
            }
          : undefined;
    const response = await apiClient.post<ApiResponse<MarkReadResponseData>>(
      `${canonicalConversationMessagesPath(conversationId)}/read`,
      payload,
    );
    return unwrapApiSuccess(response.data);
  },

  getUnreadCount: async (conversationId: string) => {
    const response = await apiClient.get<ApiResponse<unknown>>(
      `${canonicalConversationMessagesPath(conversationId)}/unread`,
    );
    const payload = unwrapApiSuccess(response.data);

    return {
      ...response.data,
      data: normalizeUnreadCountPayload(payload),
    };
  },

  getUnreadFeed: async (conversationId: string, limit = 20) => {
    const response = await apiClient.get<ApiResponse<UnreadFeedResponseDto>>(
      `${canonicalConversationMessagesPath(conversationId)}/unread-feed?limit=${limit}`,
    );
    const payload = unwrapApiSuccess(response.data) as unknown as Record<
      string,
      unknown
    >;
    const rawMessages = Array.isArray(payload.messages) ? payload.messages : [];

    return {
      ...response.data,
      data: {
        messages: rawMessages as unknown as Message[],
        readState: normalizeConversationReadState(payload.readState),
        limit:
          typeof payload.limit === "number" && Number.isFinite(payload.limit)
            ? payload.limit
            : limit,
        hasMore: payload.hasMore === true,
      },
    };
  },
};

// ============================================
// GROUP API (Telegram-like)
// ============================================

export const groupApi = {
  createGroup: async (payload: {
    type: "basic_group";
    title: string;
    description?: string;
    avatarUrl?: string;
    avatarFileId?: string;
    memberIds?: string[];
  }) => {
    const avatarUrl = normalizeGroupAvatarUrlForRequest(payload.avatarUrl);
    const response = await apiClient.post<ApiResponse<unknown>>(
      "/groups",
      {
        ...payload,
        ...(avatarUrl ? { avatarUrl } : { avatarUrl: undefined }),
      },
    );
    return response.data;
  },

  updateSettings: async (
    groupId: string,
    payload: Record<string, unknown> & {
      avatarUrl?: string;
      avatarFileId?: string;
    },
  ) => {
    const avatarUrl = normalizeGroupAvatarUrlForRequest(
      typeof payload.avatarUrl === "string" ? payload.avatarUrl : undefined,
    );
    const response = await apiClient.patch<ApiResponse<unknown>>(
      `/groups/${groupId}/settings`,
      {
        ...payload,
        ...(typeof payload.avatarUrl === "undefined"
          ? {}
          : avatarUrl
            ? { avatarUrl }
            : { avatarUrl: undefined }),
      },
    );
    return response.data;
  },

  attachAvatar: async (
    groupId: string,
    payload: { fileId?: string; uploadId?: string },
  ) => {
    const response = await apiClient.put<ApiResponse<unknown>>(
      `/groups/${groupId}/avatar`,
      payload,
    );
    return response.data;
  },

  createInviteLink: async (
    groupId: string,
    payload: { name?: string; expireAt?: string; usageLimit?: number },
  ) => {
    const response = await apiClient.post<ApiResponse<unknown>>(
      `/groups/${groupId}/invite-links`,
      payload,
    );
    return response.data;
  },

  getInviteLinks: async (groupId: string) => {
    const response = await apiClient.get<ApiResponse<unknown[]>>(
      `/groups/${groupId}/invite-links`,
    );
    return response.data;
  },

  revokeInviteLink: async (groupId: string, linkId: string) => {
    await apiClient.delete(`/groups/${groupId}/invite-links/${linkId}`);
  },

  joinByLink: async (token: string) => {
    const response = await apiClient.post<ApiResponse<unknown>>(
      "/groups/join-by-link",
      { token },
    );
    return response.data;
  },

  sendJoinRequest: async (groupId: string, note?: string) => {
    const response = await apiClient.post<ApiResponse<unknown>>(
      `/groups/${groupId}/join-requests`,
      { note },
    );
    return response.data;
  },

  getJoinRequests: async (
    groupId: string,
    status?: "pending" | "approved" | "rejected" | "canceled",
  ) => {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    const response = await apiClient.get<ApiResponse<unknown[]>>(
      `/groups/${groupId}/join-requests${query}`,
    );
    return response.data;
  },

  resolveJoinRequest: async (
    groupId: string,
    requestId: string,
    status: "approved" | "rejected",
  ) => {
    const response = await apiClient.post<ApiResponse<unknown>>(
      `/groups/${groupId}/join-requests/${requestId}/resolve`,
      { status },
    );
    return response.data;
  },

  addMember: async (groupId: string, userId: string) => {
    const response = await apiClient.post<ApiResponse<unknown>>(
      `/groups/${groupId}/members`,
      { userId },
    );
    return response.data;
  },

  removeMember: async (groupId: string, userId: string) => {
    await apiClient.delete(`/groups/${groupId}/members/${userId}`);
  },

  updateMemberRole: async (
    groupId: string,
    userId: string,
    role: "admin" | "member",
  ) => {
    const response = await apiClient.patch<ApiResponse<unknown>>(
      `/groups/${groupId}/members/${userId}/role`,
      { role },
    );
    return response.data;
  },

  restrictMember: async (groupId: string, userId: string, seconds: number) => {
    const response = await apiClient.post<ApiResponse<unknown>>(
      `/groups/${groupId}/members/${userId}/restrict`,
      { seconds },
    );
    return response.data;
  },

  banMember: async (groupId: string, userId: string) => {
    const response = await apiClient.post<ApiResponse<unknown>>(
      `/groups/${groupId}/members/${userId}/ban`,
    );
    return response.data;
  },

  unbanMember: async (groupId: string, userId: string) => {
    const response = await apiClient.delete<ApiResponse<unknown>>(
      `/groups/${groupId}/members/${userId}/ban`,
    );
    return response.data;
  },

  pinMessage: async (groupId: string, messageId: string) => {
    const response = await apiClient.post<ApiResponse<unknown>>(
      `/groups/${groupId}/pins`,
      { messageId },
    );
    return response.data;
  },

  unpinMessage: async (groupId: string, messageId: string) => {
    await apiClient.delete(`/groups/${groupId}/pins/${messageId}`);
  },

  transferOwnership: async (groupId: string, newOwnerId: string) => {
    await apiClient.post(`/groups/${groupId}/transfer-ownership`, {
      newOwnerId,
    });
  },

  getMembers: async (groupId: string, page = 1, limit = 50) => {
    const response = await apiClient.get<ApiResponse<unknown>>(
      `/groups/${groupId}/members?page=${page}&limit=${limit}`,
    );
    return response.data;
  },

  getSettings: async (groupId: string) => {
    const response = await apiClient.get<ApiResponse<unknown>>(
      `/groups/${groupId}/settings`,
    );
    return response.data;
  },

  leaveGroup: async (groupId: string) => {
    await apiClient.post(`/groups/${groupId}/leave`);
  },

  deleteGroup: async (groupId: string) => {
    await apiClient.delete(`/groups/${groupId}`);
  },

  // Group Invitation API
  getGroupInvites: async (status?: 'pending' | 'accepted' | 'declined') => {
    const query = status ? `?status=${status}` : '';
    const response = await apiClient.get<ApiResponse<unknown>>(
      `/conversations/group-invites${query}`,
    );
    return response.data;
  },

  acceptGroupInvite: async (inviteId: string) => {
    const response = await apiClient.post<ApiResponse<unknown>>(
      `/conversations/group-invites/${inviteId}/accept`,
    );
    return response.data;
  },

  declineGroupInvite: async (inviteId: string) => {
    await apiClient.post(`/conversations/group-invites/${inviteId}/decline`);
  },
};

// ============================================
// MESSAGE API
// ============================================

export const messageApi = {
  getMessages: async (
    conversationId: string,
    options: {
      limit?: number;
      /** @deprecated Legacy timestamp hint. Do not send as public HTTP contract. */
      before?: string;
      /** @deprecated Legacy timestamp hint. Do not send as public HTTP contract. */
      after?: string;
      beforeId?: string;
      afterId?: string;
      beforeSeq?: number;
      afterSeq?: number;
      signal?: AbortSignal;
    } = {},
  ) => {
    const query = new URLSearchParams({
      limit: String(
        typeof options.limit === "number" && Number.isFinite(options.limit)
          ? Math.max(1, Math.floor(options.limit))
          : 50,
      ),
    });

    if (options.beforeId) query.set("beforeId", options.beforeId);
    if (options.afterId) query.set("afterId", options.afterId);
    if (
      typeof options.beforeSeq === "number" &&
      Number.isFinite(options.beforeSeq)
    ) {
      query.set("beforeSeq", String(Math.floor(options.beforeSeq)));
    }
    if (
      typeof options.afterSeq === "number" &&
      Number.isFinite(options.afterSeq)
    ) {
      query.set("afterSeq", String(Math.floor(options.afterSeq)));
    }

    const response = await apiClient.get<ApiResponse<RoomMessagesResponse>>(
      `${canonicalConversationMessagesPath(conversationId)}?${query.toString()}`,
      {
        signal: options.signal,
      },
    );
    return response.data;
  },

  sendMessage: async ( 
    conversationId: string, 
    data: {
      content: string;
      contentFormat?: 'plain_text' | 'rich_text';
      contentJson?: Record<string, unknown>;
      plainText?: string;
      type?: Message["type"];
      replyToId?: string;
      senderName?: string;
      senderAvatar?: string;
      clientMessageId?: string;
      tempId?: string;
      localId?: string;
      mentions?: string[];
      attachments?: Array<{
        id: string;
        type: Message["type"] | string;
        objectKey?: string;
        url?: string;
        downloadUrl?: string;
        expiresAt?: string;
        fileName: string;
        mimeType: string;
        fileSize: number;
        width?: number;
        height?: number;
        duration?: number;
        thumbnailUrl?: string;
      }>;
    }, 
  ) => { 
    const normalizedAttachments = data.attachments?.map((attachment) => ({
      id: attachment.id,
      type: attachment.type,
    }));
    const body: Record<string, unknown> = { 
      content: data.content, 
      type: data.type || "text", 
      replyTo: data.replyToId, 
      clientMessageId: data.clientMessageId, 
      tempId: data.tempId, 
      localId: data.localId, 
      attachments: normalizedAttachments, 
    }; 
    if (data.contentFormat) body.contentFormat = data.contentFormat;
    if (data.contentJson) body.contentJson = data.contentJson;
    if (data.plainText) body.plainText = data.plainText;
    if (data.mentions?.length) body.mentions = data.mentions;

    const response = await apiClient.post<ApiResponse<CreateMessageResponse>>(
      canonicalConversationMessagesPath(conversationId),
      body,
    );
    return response.data;
  },

  editMessage: async (messageId: string, content: string) => {
    const response = await apiClient.patch<ApiResponse<Message>>(
      `/messages/${messageId}`,
      { content },
    );
    return response.data;
  },

  deleteMessage: async (
    messageId: string,
    options?: { mode?: "FOR_ME" | "FOR_EVERYONE" },
  ) => {
    await apiClient.delete(`/messages/${messageId}`, {
      data: options?.mode ? { mode: options.mode } : undefined,
    });
  },

  getMessageEditHistory: async (messageId: string) => {
    const response = await apiClient.get<{
      success: boolean;
      data: {
        history: Array<{
          version: number;
          previousContent: string;
          newContent: string;
          editedBy: string;
          editedAt: string;
        }>;
      };
    }>(`/messages/${messageId}/edit-history`);
    return response.data.data.history;
  },

  pinMessage: async (messageId: string) => {
    const response = await apiClient.post<ApiResponse<Message>>(
      `/messages/${messageId}/pin`,
    );
    return response.data;
  },

  unpinMessage: async (messageId: string) => {
    // Backend uses toggle endpoint for both pin/unpin
    const response = await apiClient.post<ApiResponse<Message>>(
      `/messages/${messageId}/pin`,
    );
    return response.data;
  },

  addReaction: async (messageId: string, emoji: string) => {
    const response = await apiClient.post<ApiResponse<Message>>(
      `/messages/${messageId}/reactions`,
      { emoji },
    );
    return response.data;
  },

  removeReaction: async (messageId: string, emoji: string) => {
    const response = await apiClient.delete<ApiResponse<Message>>(
      `/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
    );
    return response.data;
  },

  searchMessages: async (params: {
    q: string;
    conversationId?: string;
    type?: string;
    page?: number;
    limit?: number;
    signal?: AbortSignal;
  }) => {
    const query = new URLSearchParams();
    query.set("q", params.q);
    if (params.conversationId) {
      query.set("conversationId", params.conversationId);
    }
    if (params.type) query.set("type", params.type);
    if (params.page) query.set("page", String(params.page));
    if (params.limit) query.set("limit", String(params.limit));
    const response = await apiClient.get<
      ApiResponse<{
        messages: Message[];
        total: number;
        page: number;
        limit: number;
      }>
    >(`/messages/search?${query.toString()}`, {
      signal: params.signal,
    });
    return response.data;
  },

  forwardMessages: async (items: Array<{ sourceMessageId: string; targetConversationId: string }>) => {
    const response = await apiClient.post<ApiResponse<{ messages: Message[] }>>(
      `/messages/forward`,
      { items },
    );
    return response.data;
  },

  getMessageById: async (messageId: string) => {
    const response = await apiClient.get<ApiResponse<Message>>(
      `/messages/${messageId}`,
    );
    return response.data;
  },

  getPinnedMessages: async (conversationId: string) => {
    const response = await apiClient.get<ApiResponse<unknown>>(
      `${canonicalConversationMessagesPath(conversationId)}/pinned`,
    );
    const payload = unwrapApiSuccess(response.data);

    return {
      ...response.data,
      data: normalizePinnedMessagesPayload(payload),
    };
  },
};

// ============================================
// FILE API
// ============================================

export const fileApi = { 
  reserveFileUpload: async (payload: ReserveFileUploadPayload) => { 
    const response = await apiClient.post<ApiResponse<UploadSignedUrlResponse>>( 
      "/files/upload-url", 
      {
        ...(payload.uploadId ? { uploadId: payload.uploadId } : {}),
        purpose: payload.purpose,
        ...(payload.conversationId ? { conversationId: payload.conversationId } : {}),
        ...(payload.groupId ? { groupId: payload.groupId } : {}),
        fileName: payload.filename,
        mimeType: payload.mimeType,
        fileSize: payload.sizeBytes,
      } satisfies ReserveFileUploadRequest,
    ); 
    return response.data; 
  }, 

  requestUploadUrl: async (payload: {
    conversationId: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
  }) => {
    return fileApi.reserveFileUpload({
      purpose: "message_attachment",
      conversationId: payload.conversationId,
      filename: payload.fileName,
      mimeType: payload.mimeType,
      sizeBytes: payload.fileSize,
    });
  },

  completeFileUpload: async (payload: CompleteUploadRequest) => {
    const response = await apiClient.post<ApiResponse<CompleteUploadResponse>>(
      "/files/complete",
      payload satisfies CompleteUploadRequest,
    );
    return response.data;
  },

  completeUpload: async (payload: {
    uploadId: string;
    conversationId?: string;
    objectKey?: string;
    checksum?: string;
  }) => {
    return fileApi.completeFileUpload({
      uploadId: payload.uploadId,
      conversationId: payload.conversationId || "",
      objectKey: payload.objectKey || "",
    });
  },

  getDownloadUrl: async (params: { 
    conversationId: string; 
    objectKey?: string; 
    attachmentId?: string; 
    signal?: AbortSignal; 
  }) => {
    const response = await apiClient.get<ApiResponse<GetDownloadUrlResponse>>(
      "/files/download-url",
      {
        params: {
          conversationId: params.conversationId,
          ...(params.objectKey ? { objectKey: params.objectKey } : {}),
          ...(params.attachmentId ? { attachmentId: params.attachmentId } : {}),
        },
        signal: params.signal,
      },
    ); 
    return response.data;
  },

  batchThumbnailUrls: async (params: {
    conversationId: string;
    fileIds: string[];
    signal?: AbortSignal;
  }) => {
    const response = await apiClient.post<
      ApiResponse<{
        items: Array<{
          fileId: string;
          url: string | null;
          expiresAt: string | null;
          /** See ThumbnailUrlItem.status for semantics. */
          status: 'ready' | 'processing' | 'queued' | 'not_previewable' | 'failed' | 'fallback_original' | 'not_found' | 'forbidden' | 'error';
          /** Only present when status = ready. */
          variant?: 'thumbnail' | 'preview' | 'original';
          width?: number | null;
          height?: number | null;
          mimeType?: string;
          fallbackReason?: string | null;
          /** False = terminal state; client MUST NOT retry automatically. */
          isRetryable: boolean;
          /** Milliseconds before next allowed retry. Null when isRetryable = false. */
          retryAfterMs: number | null;
          /** Suggested client cache TTL in milliseconds. */
          cacheTtlMs: number | null;
        }>
      }>
    >(
      "/files/batch-thumbnail-urls",
      { conversationId: params.conversationId, fileIds: params.fileIds },
      { signal: params.signal },
    );
    return response.data;
  },

  /**
   * Phase 02: Get preview URL for lightbox/modal display
   * Priority: preview > thumbnail > original
   */
  getPreviewUrl: async (params: {
    conversationId: string;
    attachmentId: string;
    signal?: AbortSignal;
  }) => {
    const response = await apiClient.get<ApiResponse<{
      url: string;
      expiresAt: string;
      variant: 'preview' | 'original';
      width?: number;
      height?: number;
    }>>(
      "/files/preview-url",
      {
        params: {
          conversationId: params.conversationId,
          attachmentId: params.attachmentId,
        },
        signal: params.signal,
      },
    );
    return response.data;
  },

  uploadToSignedUrl: async (
    url: string,
    file: File,
    options: UploadToSignedUrlOptions = {},
  ) => {
    await axios.request({
      url,
      method: options.method || "PUT",
      data: file,
      headers: options.headers,
      signal: options.signal,
      onUploadProgress: (progressEvent) => {
        if (!options.onProgress || !progressEvent.total) {
          return;
        }

        options.onProgress(
          Math.round((progressEvent.loaded * 100) / progressEvent.total),
        ); 
      }, 
    }); 
  }, 

  toAttachment: (payload: CompleteUploadResponse): Attachment => { 
    return payload.attachment as Attachment; 
  }, 

  listUnattachedUploads: async (params: {
    conversationId: string;
    limit?: number;
    signal?: AbortSignal;
  }) => {
    const response = await apiClient.get<
      ApiResponse<{
        items: Array<{
          uploadId: string;
          fileId: string;
          purpose: FileUploadPurpose;
          conversationId?: string | null;
          groupId?: string | null;
          filename: string;
          mimeType: string;
          sizeBytes: number;
          createdAt: string;
          expiresAt?: string;
          width?: number;
          height?: number;
          duration?: number;
          thumbnailUrl?: string;
        }>;
      }>
    >("/files/unattached", {
      params: {
        conversationId: params.conversationId,
        ...(typeof params.limit === "number" ? { limit: params.limit } : {}),
      },
      signal: params.signal,
    });
    return response.data;
  },

  abandonUpload: async (
    uploadId: string,
    options: { reason?: string; signal?: AbortSignal } = {},
  ) => {
    const response = await apiClient.delete<ApiResponse<{ uploadId: string }>>(
      `/files/uploads/${uploadId}`,
      {
        params: options.reason ? { reason: options.reason } : undefined,
        signal: options.signal,
      },
    );
    return response.data;
  },
 
  deleteFile: async (fileId: string) => { 
    await apiClient.delete(`/files/${fileId}`); 
  }, 
}; 

// ============================================
// CONTACT API
// ============================================

export const contactApi = {
  shareContact: async (payload: {
    contactUserId: string;
    conversationId: string;
  }) => {
    const response = await apiClient.post<ApiResponse<unknown>>(
      "/contacts/share",
      {
        contactUserId: payload.contactUserId,
        conversationId: payload.conversationId,
      },
    );
    return response.data;
  },

  getContactCard: async (userId: string) => {
    const response = await apiClient.get<ApiResponse<unknown>>(
      `/contacts/${userId}`,
    );
    return response.data;
  },
};

export interface FriendQrPayloadDto {
  shareCode: string;
  deepLink: string;
  updatedAt: string;
}

export interface FriendDiscoveryProfileDto {
  id: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  bio?: string | null;
}

export interface FriendDiscoveryRelationshipDto {
  context: "self" | "other";
  friendship: FriendshipRelationDto | null;
}

export interface FriendDiscoveryResolvedDto {
  profile: FriendDiscoveryProfileDto;
  relationship: FriendDiscoveryRelationshipDto;
  capabilities: FriendshipCapabilitiesDto;
  source: "qr";
}

export const friendQrApi = {
  getMyFriendQr: async () => {
    const response =
      await apiClient.get<ApiResponse<FriendQrPayloadDto>>("/me/friend-qr");
    return response.data;
  },

  resetMyFriendQr: async () => {
    const response = await apiClient.post<ApiResponse<FriendQrPayloadDto>>(
      "/me/friend-qr/reset",
    );
    return response.data;
  },

  resolveCode: async (shareCode: string) => {
    const response = await apiClient.post<
      ApiResponse<FriendDiscoveryResolvedDto>
    >("/friend-discovery/resolve-code", {
      shareCode,
    });
    return response.data;
  },
};

// ============================================
// FRIENDSHIP API
// ============================================

export const friendshipApi = {
  getFriends: async () => {
    const response = await apiClient.get<
      ApiResponse<{
        data: FriendshipRelationDto[];
        pagination: {
          page: number;
          limit: number;
          total: number;
          totalPages: number;
          hasNext: boolean;
          hasPrev: boolean;
        };
      }>
    >("/friends");
    return response.data;
  },

  getPendingRequests: async () => {
    const response = await apiClient.get<
      ApiResponse<{
        data: FriendshipRelationDto[];
        pagination: {
          page: number;
          limit: number;
          total: number;
          totalPages: number;
          hasNext: boolean;
          hasPrev: boolean;
        };
      }>
    >("/friends/requests/received");
    return response.data;
  },

  sendFriendRequest: async (userId: string) => {
    const response = await apiClient.post<
      ApiResponse<FriendshipWriteResponseDto>
    >("/friends/requests", { userId });
    return response.data;
  },

  acceptFriendRequest: async (requestId: string) => {
    const response = await apiClient.post<
      ApiResponse<FriendshipWriteResponseDto>
    >(`/friends/requests/${requestId}/accept`);
    return response.data;
  },

  rejectFriendRequest: async (requestId: string) => {
    const response = await apiClient.post<
      ApiResponse<FriendshipWriteResponseDto>
    >(`/friends/requests/${requestId}/decline`);
    return response.data;
  },

  removeFriend: async (friendshipId: string) => {
    const response = await apiClient.delete<
      ApiResponse<FriendshipWriteResponseDto>
    >(`/friends/${friendshipId}`);
    return response.data;
  },

  getSentRequests: async () => {
    const response = await apiClient.get<
      ApiResponse<{
        data: FriendshipRelationDto[];
        pagination: {
          page: number;
          limit: number;
          total: number;
          totalPages: number;
          hasNext: boolean;
          hasPrev: boolean;
        };
      }>
    >("/friends/requests/sent");
    return response.data;
  },

  cancelFriendRequest: async (requestId: string) => {
    const response = await apiClient.delete<
      ApiResponse<FriendshipWriteResponseDto>
    >(`/friends/requests/${requestId}`);
    return response.data;
  },

  getPendingCount: async () => {
    const response = await apiClient.get<
      ApiResponse<FriendshipPendingCountDto>
    >("/friends/requests/count");
    return response.data;
  },

  getFriendshipStatus: async (userId: string) => {
    const response = await apiClient.get<
      ApiResponse<FriendshipStatusResponseDto>
    >(`/friends/status/${userId}`);
    return response.data;
  },
};

// Export all APIs
// ============================================
// CONVERSATION RESOURCES API
// ============================================

export interface ConversationResourcesMemberPreview {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface ConversationResourcesMediaItem {
  messageId: string;
  fileId: string;
  messageType: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  thumbnailUrl: string | null;
  senderId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  createdAt: string;
}

export interface ConversationResourcesFileItem {
  messageId: string;
  fileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  senderId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  createdAt: string;
}

export interface ConversationResourcesLinkItem {
  messageId: string;
  url: string;
  domain: string;
  senderId: string;
  senderName: string;
  createdAt: string;
}

export interface ConversationSidebarSummary {
  conversationId: string;
  members: { total: number; preview: ConversationResourcesMemberPreview[] };
  media: { total: number; preview: ConversationResourcesMediaItem[] };
  files: { total: number; preview: ConversationResourcesFileItem[] };
  links: { total: number; preview: ConversationResourcesLinkItem[] };
}

export interface ConversationResourcesPaginatedResult<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; hasNext: boolean };
}

export const conversationResourcesApi = {
  getSidebarSummary: async (conversationId: string) => {
    const response = await apiClient.get<ApiResponse<ConversationSidebarSummary>>(
      `/conversations/${conversationId}/sidebar-summary`,
    );
    return response.data;
  },

  getMedia: async (
    conversationId: string,
    page = 1,
    limit = 20,
    type?: string,
  ) => {
    const query = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (type) query.set('type', type);
    const response = await apiClient.get<
      ApiResponse<ConversationResourcesPaginatedResult<ConversationResourcesMediaItem>>
    >(`/conversations/${conversationId}/media?${query}`);
    return response.data;
  },

  getFiles: async (
    conversationId: string,
    page = 1,
    limit = 20,
    q?: string,
  ) => {
    const query = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (q) query.set('q', q);
    const response = await apiClient.get<
      ApiResponse<ConversationResourcesPaginatedResult<ConversationResourcesFileItem>>
    >(`/conversations/${conversationId}/files?${query}`);
    return response.data;
  },

  getLinks: async (
    conversationId: string,
    page = 1,
    limit = 20,
  ) => {
    const query = new URLSearchParams({ page: String(page), limit: String(limit) });
    const response = await apiClient.get<
      ApiResponse<ConversationResourcesPaginatedResult<ConversationResourcesLinkItem>>
    >(`/conversations/${conversationId}/links?${query}`);
    return response.data;
  },
};

export default {
  auth: authApi,
  user: userApi,
  conversation: conversationApi,
  message: messageApi,
  file: fileApi,
  contact: contactApi,
  friendship: friendshipApi,
  friendQr: friendQrApi,
  group: groupApi,
  conversationResources: conversationResourcesApi,
};
