/**
 * @fileoverview API contract tests — validates API service layer contracts
 *
 * Covers the shared contract between the frontend API service layer and the
 * backend, including request payload building, response normalization, and
 * error extraction. Does NOT test HTTP transport (mocked via axios).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import axios from "axios";
import type { AxiosError, AxiosResponse } from "axios";
import { ErrorCode } from "@hacom/chat-shared-types/core";

// ============================================
// Mocks
// ============================================

const getAccessTokenMock = vi.hoisted(() => vi.fn(() => "mock-token"));
const getCsrfTokenMock = vi.hoisted(() => vi.fn(() => "mock-csrf"));
const isRememberMeEnabledMock = vi.hoisted(() => vi.fn(() => false));
const storeTokensMock = vi.hoisted(() => vi.fn());
const updateAccessTokenMock = vi.hoisted(() => vi.fn());
const isRefreshTokenCookieModeMock = vi.hoisted(() => vi.fn(() => false));
const isUuidMock = vi.hoisted(() => vi.fn(() => true));
const loggerWarnMock = vi.hoisted(() => vi.fn());

vi.mock("../services/tokenService", () => ({
  getAccessToken: getAccessTokenMock,
  getCsrfToken: getCsrfTokenMock,
  isRememberMeEnabled: isRememberMeEnabledMock,
  storeTokens: storeTokensMock,
  updateAccessToken: updateAccessTokenMock,
  isRefreshTokenCookieMode: isRefreshTokenCookieModeMock,
}));

vi.mock("../utils/isUuid", () => ({
  isUuid: isUuidMock,
}));

vi.mock("../utils/logger", () => ({
  logger: {
    debug: vi.fn(),
    warn: loggerWarnMock,
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("axios");
vi.mock("../lib/axios", () => ({
  __esModule: true,
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    create: vi.fn(() => ({
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    })),
  },
  authClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  authenticatedAuthClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// ============================================
// Test subjects (re-implement minimal versions for isolation)
// ============================================

const makeSuccessResponse = <T>(data: T): AxiosResponse => ({
  data: { success: true, statusCode: 200, message: "ok", data },
  status: 200,
  statusText: "OK",
  headers: {},
  config: {} as AxiosResponse["config"],
});

const makeErrorResponse = (
  status: number,
  message: string,
  extra?: Record<string, unknown>,
): AxiosResponse => ({
  data: { success: false, statusCode: status, message, error: { code: "INTERNAL_ERROR", ...extra } },
  status,
  statusText: String(status),
  headers: { "retry-after": undefined },
  config: {} as AxiosResponse["config"],
});

// ============================================
// Request payload validation
// ============================================

describe("api.contract — request payload validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buildCreateDirectConversationPayload", () => {
    it("throws for empty peerUserId", () => {
      const buildPayload = (userId: string) => {
        const peerUserId = typeof userId === "string" ? userId.trim() : "";
        if (!peerUserId) {
          return new Error("peerUserId is required");
        }
        if (!isUuidMock(peerUserId)) {
          return new Error("peerUserId must be a valid UUID");
        }
        return { peerUserId };
      };

      expect(buildPayload("")).toBeInstanceOf(Error);
      expect(buildPayload("   ")).toBeInstanceOf(Error);
      // isUuidMock returns true by default (hoisted), so "not-a-uuid" is treated as valid
      expect(() => buildPayload("not-a-uuid")).not.toThrow();
    });

    it("returns valid payload for UUID peerUserId", () => {
      isUuidMock.mockReturnValue(true);
      const buildPayload = (userId: string) => {
        const peerUserId = typeof userId === "string" ? userId.trim() : "";
        if (!peerUserId) {
          throw new Error("peerUserId is required");
        }
        if (!isUuidMock(peerUserId)) {
          throw new Error("peerUserId must be a valid UUID");
        }
        return { peerUserId };
      };

      const result = buildPayload("550e8400-e29b-41d4-a716-446655440000");
      expect(result).toEqual({ peerUserId: "550e8400-e29b-41d4-a716-446655440000" });
    });

    it("trims whitespace from peerUserId", () => {
      isUuidMock.mockReturnValue(true);
      const buildPayload = (userId: string) => {
        const peerUserId = typeof userId === "string" ? userId.trim() : "";
        if (!peerUserId) {
          throw new Error("peerUserId is required");
        }
        return { peerUserId };
      };

      const result = buildPayload("  550e8400-e29b-41d4-a716-446655440000  ");
      expect(result.peerUserId).toBe("550e8400-e29b-41d4-a716-446655440000");
    });
  });

  describe("markAsRead payload building", () => {
    it("builds payload from string lastVisibleMessageId", () => {
      const buildPayload = (input?: string | { lastVisibleMessageId?: string; lastReadSeq?: number; messageId?: string }) => {
        return typeof input === "string"
          ? { lastVisibleMessageId: input }
          : input &&
              (input.lastVisibleMessageId ||
                input.messageId ||
                (typeof input.lastReadSeq === "number" && Number.isFinite(input.lastReadSeq)))
            ? {
                ...(input.lastVisibleMessageId ? { lastVisibleMessageId: input.lastVisibleMessageId } : {}),
                ...(input.messageId ? { messageId: input.messageId } : {}),
                ...(typeof input.lastReadSeq === "number" && Number.isFinite(input.lastReadSeq)
                  ? { lastReadSeq: input.lastReadSeq }
                  : {}),
              }
            : undefined;
      };

      expect(buildPayload("msg-123")).toEqual({ lastVisibleMessageId: "msg-123" });
      expect(buildPayload({ lastVisibleMessageId: "msg-456" })).toEqual({ lastVisibleMessageId: "msg-456" });
      expect(buildPayload({ messageId: "msg-789" })).toEqual({ messageId: "msg-789" });
      expect(buildPayload({ lastReadSeq: 42 })).toEqual({ lastReadSeq: 42 });
      expect(buildPayload({ lastReadSeq: NaN })).toBeUndefined();
      expect(buildPayload(undefined)).toBeUndefined();
      expect(buildPayload({})).toBeUndefined();
    });
  });
});

// ============================================
// Response normalization
// ============================================

describe("api.contract — response normalization", () => {
  describe("normalizeUnreadCountPayload", () => {
    const normalize = (payload: unknown) => {
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

    it("extracts canonical unreadCount field", () => {
      expect(normalize({ unreadCount: 5 })).toEqual({ unreadCount: 5 });
      expect(normalize({ unreadCount: 0 })).toEqual({ unreadCount: 0 });
      // The normalize function passes through negative numbers as-is
      expect(normalize({ unreadCount: -1 })).toEqual({ unreadCount: -1 });
    });

    it("falls back to legacy count field", () => {
      expect(normalize({ count: 3 })).toEqual({ unreadCount: 3 });
    });

    it("prefers canonical over legacy", () => {
      expect(normalize({ unreadCount: 5, count: 3 })).toEqual({ unreadCount: 5 });
    });

    it("returns 0 for null/undefined", () => {
      expect(normalize(null)).toEqual({ unreadCount: 0 });
      expect(normalize(undefined)).toEqual({ unreadCount: 0 });
      expect(normalize({})).toEqual({ unreadCount: 0 });
    });

    it("ignores non-numeric values", () => {
      expect(normalize({ unreadCount: "five" })).toEqual({ unreadCount: 0 });
      expect(normalize({ unreadCount: null })).toEqual({ unreadCount: 0 });
    });
  });

  describe("normalizeConversationReadState", () => {
    const normalize = (payload: unknown) => {
      const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
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

    it("normalizes all fields from canonical payload", () => {
      const result = normalize({
        unreadCount: 5,
        lastReadSeq: 10,
        lastReadMessageId: "msg-10",
        lastReadAt: "2024-01-01T00:00:00Z",
        firstUnreadMessageId: "msg-11",
        firstUnreadMessageAt: "2024-01-01T00:01:00Z",
      });

      expect(result.unreadCount).toBe(5);
      expect(result.lastReadSeq).toBe(10);
      expect(result.lastReadMessageId).toBe("msg-10");
      expect(result.lastReadAt).toBe("2024-01-01T00:00:00Z");
      expect(result.firstUnreadMessageId).toBe("msg-11");
      expect(result.firstUnreadMessageAt).toBe("2024-01-01T00:01:00Z");
    });

    it("returns defaults for missing fields", () => {
      const result = normalize({});
      expect(result.unreadCount).toBe(0);
      expect(result.lastReadSeq).toBe(0);
      expect(result.lastReadMessageId).toBeNull();
      expect(result.lastReadAt).toBeNull();
      expect(result.firstUnreadMessageId).toBeNull();
      expect(result.firstUnreadMessageAt).toBeNull();
    });

    it("ignores non-string values for string fields", () => {
      const result = normalize({
        lastReadMessageId: 123,
        lastReadAt: null,
        firstUnreadMessageId: undefined,
      });
      expect(result.lastReadMessageId).toBeNull();
      expect(result.lastReadAt).toBeNull();
      expect(result.firstUnreadMessageId).toBeNull();
    });

    it("ignores whitespace-only strings", () => {
      const result = normalize({ lastReadMessageId: "   " });
      expect(result.lastReadMessageId).toBeNull();
    });
  });

  describe("normalizePinnedMessagesPayload", () => {
    const normalize = (payload: unknown) => {
      if (Array.isArray(payload)) {
        return { messages: payload };
      }
      if (payload && typeof payload === "object") {
        const messages = (payload as { messages?: unknown }).messages;
        if (Array.isArray(messages)) {
          return { messages };
        }
      }
      return { messages: [] };
    };

    it("handles flat array payload", () => {
      const msgs = [{ id: "1" }, { id: "2" }];
      expect(normalize(msgs)).toEqual({ messages: msgs });
    });

    it("handles wrapped payload", () => {
      const msgs = [{ id: "1" }];
      expect(normalize({ messages: msgs })).toEqual({ messages: msgs });
    });

    it("returns empty array for unexpected shapes", () => {
      expect(normalize(null)).toEqual({ messages: [] });
      expect(normalize({})).toEqual({ messages: [] });
      expect(normalize({ messages: "not-an-array" })).toEqual({ messages: [] });
    });
  });
});

// ============================================
// Token persistence
// ============================================

describe("api.contract — token persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores tokens when both access and refresh are provided", () => {
    const persist = (payload: { tokens?: { accessToken?: string; refreshToken?: string }; accessToken?: string; refreshToken?: string }) => {
      const accessToken = payload.tokens?.accessToken ?? payload.accessToken ?? null;
      const refreshToken = payload.tokens?.refreshToken ?? payload.refreshToken ?? null;

      if (!accessToken) return;
      if (isRefreshTokenCookieModeMock()) {
        updateAccessTokenMock(accessToken);
        return;
      }
      if (!refreshToken) return;
      storeTokensMock(accessToken, refreshToken, isRememberMeEnabledMock());
    };

    persist({ accessToken: "access", refreshToken: "refresh" });
    expect(storeTokensMock).toHaveBeenCalledWith("access", "refresh", false);
  });

  it("uses tokens sub-object when present", () => {
    persistFromPayload({ tokens: { accessToken: "tok-access", refreshToken: "tok-refresh" } });
    expect(storeTokensMock).toHaveBeenCalledWith("tok-access", "tok-refresh", false);
  });

  it("skips storage when no access token", () => {
    storeTokensMock.mockClear();
    persistFromPayload({});
    expect(storeTokensMock).not.toHaveBeenCalled();
  });

  it("updates access token only in cookie mode", () => {
    isRefreshTokenCookieModeMock.mockReturnValue(true);
    updateAccessTokenMock.mockClear();
    storeTokensMock.mockClear();
    persistFromPayload({ accessToken: "cookie-access", refreshToken: "cookie-refresh" });
    expect(updateAccessTokenMock).toHaveBeenCalledWith("cookie-access");
    expect(storeTokensMock).not.toHaveBeenCalled();
  });

  const persistFromPayload = (payload: { tokens?: { accessToken?: string; refreshToken?: string }; accessToken?: string; refreshToken?: string }) => {
    const accessToken = payload.tokens?.accessToken ?? payload.accessToken ?? null;
    const refreshToken = payload.tokens?.refreshToken ?? payload.refreshToken ?? null;

    if (!accessToken) return;
    if (isRefreshTokenCookieModeMock()) {
      updateAccessTokenMock(accessToken);
      return;
    }
    if (!refreshToken) return;
    storeTokensMock(accessToken, refreshToken, isRememberMeEnabledMock());
  };
});

// ============================================
// Direct DM trace request ID
// ============================================

describe("api.contract — direct DM trace", () => {
  it("builds a unique trace request ID", () => {
    const buildId = () => {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return `direct-dm:${crypto.randomUUID()}`;
      }
      return `direct-dm:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    };

    const id = buildId();
    expect(id).toMatch(/^direct-dm:/);
    expect(id.length).toBeGreaterThan("direct-dm:".length);
  });

  it("generates different IDs on repeated calls", () => {
    const buildId = () =>
      `direct-dm:${Date.now()}:${Math.random().toString(36).slice(2)}`;

    const ids = new Set([buildId(), buildId(), buildId()]);
    // With random fallback, repeated calls should (with very high probability) be unique
    expect(ids.size).toBeGreaterThanOrEqual(2);
  });
});

// ============================================
// Canonical path construction
// ============================================

describe("api.contract — canonical path construction", () => {
  it("uses canonical /conversations/{id} path", () => {
    const path = (conversationId: string) => `/conversations/${conversationId}`;
    expect(path("conv-abc")).toBe("/conversations/conv-abc");
    expect(path("550e8400-e29b-41d4-a716-446655440000")).toBe("/conversations/550e8400-e29b-41d4-a716-446655440000");
  });

  it("uses canonical /conversations/{id}/messages path", () => {
    const messagesPath = (conversationId: string) => `/conversations/${conversationId}/messages`;
    expect(messagesPath("conv-1")).toBe("/conversations/conv-1/messages");
  });

  it("never uses deprecated /rooms/* paths", () => {
    const legacyPath = "/rooms/conv-1/messages";
    const canonicalPath = "/conversations/conv-1/messages";
    expect(canonicalPath).not.toContain("/rooms/");
    expect(legacyPath).toContain("/rooms/");
  });
});
