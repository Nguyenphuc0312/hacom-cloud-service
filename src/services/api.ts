/**
 * @fileoverview API Services
 * Tất cả các API calls
 */

import apiClient from "../lib/axios";
import axios from "axios";
import type {
  ApiResponse,
  AuthResponseDto,
  CompleteUploadResponse,
  CreateMessageResponse,
  GetDownloadUrlResponse,
  LoginResponse,
  RefreshTokenResponse,
  RoomMessagesResponse,
  UploadSignedUrlResponse,
} from "@hacom/chat-shared-types";
import type { User } from "../stores/authStore";
import type { Attachment, Conversation, Message } from "../types";
import { RoomMemberRole } from "../types";
import {
  normalizeConversation,
  normalizeConversationsPayload,
} from "../lib/conversationAdapter";
import { unwrapApiSuccess } from "../lib/apiContract";

// ============================================
// AUTH API
// ============================================

export const authApi = {
  login: async (email: string, password: string) => {
    const response = await apiClient.post<ApiResponse<LoginResponse>>(
      "/auth/login",
      { email, password },
    );
    return response.data;
  },

  register: async (data: {
    username: string;
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }) => {
    const response = await apiClient.post<ApiResponse<AuthResponseDto>>(
      "/auth/register",
      data,
    );
    return response.data;
  },

  logout: async () => {
    await apiClient.post("/auth/logout", undefined, {
      withCredentials: true,
    });
  },

  refreshToken: async (refreshToken?: string) => {
    const response = await apiClient.post<ApiResponse<RefreshTokenResponse>>(
      "/auth/refresh",
      refreshToken ? { refreshToken } : undefined,
      {
        withCredentials: true,
      },
    );
    return response.data;
  },

  forgotPassword: async (email: string) => {
    const response = await apiClient.post<ApiResponse<{ message: string }>>(
      "/auth/forgot-password",
      { email },
    );
    return response.data;
  },

  resetPassword: async (token: string, password: string) => {
    const response = await apiClient.post<ApiResponse<{ message: string }>>(
      "/auth/reset-password",
      { token, password },
    );
    return response.data;
  },

  changePassword: async (data: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) => {
    const response = await apiClient.post<ApiResponse<{ message: string }>>(
      "/auth/change-password",
      data,
    );
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

  updateProfile: async (data: Partial<User>) => {
    const response = await apiClient.put<ApiResponse<User>>(
      "/users/profile",
      data,
    );
    return response.data;
  },

  updateAvatar: async (file: File) => {
    const formData = new FormData();
    formData.append("avatar", file);
    const response = await apiClient.put<ApiResponse<{ avatar: string }>>(
      "/users/avatar",
      formData,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    return response.data;
  },

  updateStatus: async (status: User["status"]) => {
    const response = await apiClient.put<ApiResponse<User>>("/users/status", {
      status,
    });
    return response.data;
  },

  searchUsers: async (query: string, page = 1, limit = 20) => {
    const response = await apiClient.get<ApiResponse<User[]>>(
      `/users/search?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`,
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
  getConversations: async (page = 1, limit = 50) => {
    const response = await apiClient.get<ApiResponse<unknown>>(
      `/conversations?page=${page}&limit=${limit}`,
    );

    if (!response.data.success) {
      return response.data as ApiResponse<Conversation[]>;
    }

    return {
      ...response.data,
      data: normalizeConversationsPayload(response.data.data),
    };
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
    const response = await apiClient.post<ApiResponse<unknown>>(
      "/conversations/direct",
      {
        userId,
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
    description?: string;
  }) => {
    const response = await apiClient.post<ApiResponse<unknown>>(
      "/conversations/group",
      {
        name: data.name,
        memberIds: data.memberIds,
        description: data.description,
        avatar: data.avatar,
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

  updateConversation: async (
    conversationId: string,
    data: Partial<Conversation>,
  ) => {
    const response = await apiClient.patch<ApiResponse<Conversation>>(
      `/rooms/${conversationId}`,
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
        `/rooms/${conversationId}/members`,
        { userId },
      );
    }

    // API returns RoomMember for add-member. Refresh room to get full Conversation shape.
    return conversationApi.getConversationById(conversationId);
  },

  removeMember: async (conversationId: string, userId: string) => {
    await apiClient.delete(`/rooms/${conversationId}/members/${userId}`);
  },

  removeMembers: async (conversationId: string, memberIds: string[]) => {
    // Backend expects path param, so we remove one by one
    for (const userId of memberIds) {
      await apiClient.delete(`/rooms/${conversationId}/members/${userId}`);
    }
  },

  leaveConversation: async (conversationId: string) => {
    await apiClient.post(`/rooms/${conversationId}/leave`);
  },

  getMembers: async (conversationId: string, page = 1, limit = 100) => {
    const response = await apiClient.get<ApiResponse<unknown>>(
      `/rooms/${conversationId}/members?page=${page}&limit=${limit}`,
    );
    return response.data;
  },

  updateMemberRole: async (
    conversationId: string,
    userId: string,
    role: RoomMemberRole | "owner",
  ) => {
    const response = await apiClient.patch<ApiResponse<unknown>>(
      `/rooms/${conversationId}/members/${userId}/role`,
      { role },
    );
    return response.data;
  },

  markAsRead: async (conversationId: string) => {
    await apiClient.post(`/rooms/${conversationId}/messages/read`);
  },

  getUnreadCount: async (conversationId: string) => {
    const response = await apiClient.get<ApiResponse<{ unreadCount: number }>>(
      `/rooms/${conversationId}/messages/unread`,
    );
    return response.data;
  },
};

// ============================================
// MESSAGE API
// ============================================

export const messageApi = {
  getMessages: async (
    conversationId: string,
    pageOrOptions:
      | number
      | {
          page?: number;
          limit?: number;
          before?: string;
          after?: string;
        } = 1,
    limit = 50,
  ) => {
    const options =
      typeof pageOrOptions === "number"
        ? { page: pageOrOptions, limit }
        : pageOrOptions;
    const query = new URLSearchParams({
      limit: String(
        typeof options.limit === "number" && Number.isFinite(options.limit)
          ? Math.max(1, Math.floor(options.limit))
          : 50,
      ),
    });

    if (options.before) query.set("before", options.before);
    if (options.after) query.set("after", options.after);
    if (!options.before && !options.after) {
      query.set(
        "page",
        String(
          typeof options.page === "number" && Number.isFinite(options.page)
            ? Math.max(1, Math.floor(options.page))
            : 1,
        ),
      );
    }

    const response = await apiClient.get<ApiResponse<RoomMessagesResponse>>(
      `/rooms/${conversationId}/messages?${query.toString()}`,
    );
    return response.data;
  },

  sendMessage: async (
    conversationId: string,
    data: {
      content: string;
      type?: Message["type"];
      replyToId?: string;
      senderName?: string;
      senderAvatar?: string;
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
    const response = await apiClient.post<ApiResponse<CreateMessageResponse>>(
      `/rooms/${conversationId}/messages`,
      {
        content: data.content,
        type: data.type || "text",
        senderName: data.senderName,
        senderAvatar: data.senderAvatar,
        replyTo: data.replyToId,
        attachments: data.attachments,
      },
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

  deleteMessage: async (messageId: string) => {
    await apiClient.delete(`/messages/${messageId}`);
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
    roomId?: string;
    type?: string;
    page?: number;
    limit?: number;
  }) => {
    const query = new URLSearchParams();
    query.set("q", params.q);
    if (params.roomId) query.set("roomId", params.roomId);
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
    >(`/messages/search?${query.toString()}`);
    return response.data;
  },

  getMessageById: async (messageId: string) => {
    const response = await apiClient.get<ApiResponse<Message>>(
      `/messages/${messageId}`,
    );
    return response.data;
  },

  getPinnedMessages: async (roomId: string) => {
    const response = await apiClient.get<ApiResponse<{ messages: Message[] }>>(
      `/rooms/${roomId}/messages/pinned`,
    );
    return response.data;
  },
};

// ============================================
// FILE API
// ============================================

export const fileApi = {
  requestUploadUrl: async (payload: {
    conversationId: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
  }) => {
    const response = await apiClient.post<ApiResponse<UploadSignedUrlResponse>>(
      "/files/upload-url",
      payload,
    );
    return response.data;
  },

  completeUpload: async (payload: {
    uploadId: string;
    conversationId: string;
    objectKey: string;
  }) => {
    const response = await apiClient.post<ApiResponse<CompleteUploadResponse>>(
      "/files/complete",
      payload,
    );
    return response.data;
  },

  getDownloadUrl: async (params: {
    conversationId: string;
    objectKey?: string;
    attachmentId?: string;
  }) => {
    const response = await apiClient.get<ApiResponse<GetDownloadUrlResponse>>(
      "/files/download-url",
      { params },
    );
    return response.data;
  },

  uploadFile: async (
    conversationId: string,
    file: File,
    onProgress?: (progress: number) => void,
    signal?: AbortSignal,
  ) => {
    const mimeType = file.type || "application/octet-stream";
    const signed = await fileApi.requestUploadUrl({
      conversationId,
      fileName: file.name,
      mimeType,
      fileSize: file.size,
    });
    const signedData = unwrapApiSuccess(signed);

    await axios.put(signedData.uploadUrl, file, {
      headers: { "Content-Type": mimeType },
      signal,
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total,
          );
          onProgress(progress);
        }
      },
    });

    return fileApi.completeUpload({
      uploadId: signedData.uploadId,
      conversationId,
      objectKey: signedData.objectKey,
    });
  },

  uploadImage: async (
    conversationId: string,
    file: File,
    onProgress?: (progress: number) => void,
    signal?: AbortSignal,
  ) => {
    return fileApi.uploadFile(conversationId, file, onProgress, signal);
  },

  toAttachment: (payload: CompleteUploadResponse): Attachment => {
    return payload.attachment as Attachment;
  },

  deleteFile: async (fileId: string) => {
    await apiClient.delete(`/files/${fileId}`);
  },
};

// ============================================
// FRIENDSHIP API
// ============================================

export const friendshipApi = {
  getFriends: async () => {
    const response = await apiClient.get<
      ApiResponse<{
        friends: User[];
        total: number;
      }>
    >("/friends");
    return response.data;
  },

  getPendingRequests: async () => {
    const response = await apiClient.get<
      ApiResponse<{
        requests: Array<{ id: string; sender: User; createdAt: string }>;
      }>
    >("/friends/requests/received");
    return response.data;
  },

  sendFriendRequest: async (userId: string) => {
    const response = await apiClient.post<ApiResponse<{ message: string }>>(
      "/friends/requests",
      { userId },
    );
    return response.data;
  },

  acceptFriendRequest: async (requestId: string) => {
    const response = await apiClient.post<ApiResponse<{ message: string }>>(
      `/friends/requests/${requestId}/accept`,
    );
    return response.data;
  },

  rejectFriendRequest: async (requestId: string) => {
    const response = await apiClient.post<ApiResponse<{ message: string }>>(
      `/friends/requests/${requestId}/decline`,
    );
    return response.data;
  },

  removeFriend: async (friendshipId: string) => {
    await apiClient.delete(`/friends/${friendshipId}`);
  },

  getSentRequests: async () => {
    const response = await apiClient.get<
      ApiResponse<{
        requests: Array<{ id: string; receiver: User; createdAt: string }>;
      }>
    >("/friends/requests/sent");
    return response.data;
  },

  cancelFriendRequest: async (requestId: string) => {
    await apiClient.delete(`/friends/requests/${requestId}`);
  },

  getPendingCount: async () => {
    const response = await apiClient.get<ApiResponse<{ count: number }>>(
      "/friends/requests/count",
    );
    return response.data;
  },

  blockUser: async (userId: string) => {
    const response = await apiClient.post<ApiResponse<{ message: string }>>(
      "/friends/block",
      { userId },
    );
    return response.data;
  },

  unblockUser: async (userId: string) => {
    await apiClient.delete(`/friends/unblock/${userId}`);
  },

  getBlockedUsers: async () => {
    const response =
      await apiClient.get<ApiResponse<{ users: User[]; total: number }>>(
        "/friends/blocked",
      );
    return response.data;
  },

  getFriendshipStatus: async (userId: string) => {
    const response = await apiClient.get<
      ApiResponse<{
        status: "none" | "pending" | "accepted" | "declined" | "blocked";
        friendship?: { id: string };
      }>
    >(`/friends/status/${userId}`);
    return response.data;
  },
};

// Export all APIs
export default {
  auth: authApi,
  user: userApi,
  conversation: conversationApi,
  message: messageApi,
  file: fileApi,
  friendship: friendshipApi,
};
