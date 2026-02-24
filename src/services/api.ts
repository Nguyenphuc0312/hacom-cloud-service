/**
 * @fileoverview API Services
 * Tất cả các API calls
 */

import apiClient from "../lib/axios";
import type { ApiResponse } from "../lib/axios";
import type { User } from "../stores/authStore";
import type { Conversation, Message } from "../types";

// ============================================
// AUTH API
// ============================================

export const authApi = {
  login: async (email: string, password: string) => {
    const response = await apiClient.post<
      ApiResponse<{
        user: User;
        tokens: { accessToken: string; refreshToken: string };
      }>
    >("/auth/login", { email, password });
    return response.data;
  },

  register: async (data: {
    username: string;
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }) => {
    const response = await apiClient.post<
      ApiResponse<{
        user: User;
        tokens: { accessToken: string; refreshToken: string };
      }>
    >("/auth/register", data);
    return response.data;
  },

  logout: async () => {
    await apiClient.post("/auth/logout", undefined, {
      withCredentials: true,
    });
  },

  refreshToken: async (refreshToken?: string) => {
    const response = await apiClient.post<
      ApiResponse<{
        accessToken: string;
        refreshToken: string;
      }>
    >("/auth/refresh", refreshToken ? { refreshToken } : undefined, {
      withCredentials: true,
    });
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
};

// ============================================
// CONVERSATION API
// ============================================

export const conversationApi = {
  getConversations: async (page = 1, limit = 50) => {
    const response = await apiClient.get<
      ApiResponse<{
        conversations: Conversation[];
        total: number;
        hasMore: boolean;
      }>
    >(`/rooms?page=${page}&limit=${limit}`);
    return response.data;
  },

  getConversationById: async (conversationId: string) => {
    const response = await apiClient.get<ApiResponse<Conversation>>(
      `/rooms/${conversationId}`,
    );
    return response.data;
  },

  createPrivateConversation: async (userId: string) => {
    const response = await apiClient.post<ApiResponse<Conversation>>("/rooms", {
      type: "direct",
      members: [userId],
    });
    return response.data;
  },

  createGroupConversation: async (data: {
    name: string;
    memberIds: string[];
    avatar?: string;
    description?: string;
  }) => {
    const response = await apiClient.post<ApiResponse<Conversation>>("/rooms", {
      type: "group",
      name: data.name,
      members: data.memberIds,
      description: data.description,
    });
    return response.data;
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
    await apiClient.delete(`/rooms/${conversationId}`);
  },

  addMembers: async (conversationId: string, memberIds: string[]) => {
    // Backend expects single userId, so we add one by one
    const results = [];
    for (const userId of memberIds) {
      const response = await apiClient.post<ApiResponse<Conversation>>(
        `/rooms/${conversationId}/members`,
        { userId },
      );
      results.push(response.data);
    }
    return results[results.length - 1]; // Return last result
  },

  removeMember: async (conversationId: string, userId: string) => {
    const response = await apiClient.delete<ApiResponse<Conversation>>(
      `/rooms/${conversationId}/members/${userId}`,
    );
    return response.data;
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

  markAsRead: async (conversationId: string) => {
    await apiClient.post(`/rooms/${conversationId}/messages/read`);
  },
};

// ============================================
// MESSAGE API
// ============================================

export const messageApi = {
  getMessages: async (conversationId: string, page = 1, limit = 50) => {
    const response = await apiClient.get<
      ApiResponse<{
        messages: Message[];
        total: number;
        hasMore: boolean;
      }>
    >(`/rooms/${conversationId}/messages?page=${page}&limit=${limit}`);
    return response.data;
  },

  sendMessage: async (
    conversationId: string,
    data: {
      content: string;
      type?: Message["type"];
      replyToId?: string;
      attachments?: string[];
    },
  ) => {
    const response = await apiClient.post<ApiResponse<Message>>(
      `/rooms/${conversationId}/messages`,
      {
        content: data.content,
        type: data.type || "text",
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
};

// ============================================
// FILE API
// ============================================

export const fileApi = {
  uploadFile: async (file: File, onProgress?: (progress: number) => void) => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await apiClient.post<
      ApiResponse<{
        id: string;
        url: string;
        filename: string;
        originalName?: string;
        mimetype: string;
        size: number;
        uploadedBy?: string;
        createdAt?: string;
      }>
    >("/files/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total,
          );
          onProgress(progress);
        }
      },
    });

    return response.data;
  },

  uploadImage: async (file: File, onProgress?: (progress: number) => void) => {
    const formData = new FormData();
    formData.append("image", file);

    const response = await apiClient.post<
      ApiResponse<{
        id: string;
        url: string;
        filename: string;
        originalName?: string;
        mimetype?: string;
        size?: number;
        thumbnail?: string;
        width?: number;
        height?: number;
        uploadedBy?: string;
        createdAt?: string;
      }>
    >("/files/upload-image", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total,
          );
          onProgress(progress);
        }
      },
    });

    return response.data;
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
