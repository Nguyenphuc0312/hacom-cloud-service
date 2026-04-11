import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiGetMock } = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
}));

vi.mock("../lib/axios", () => {
  const noop = vi.fn();
  return {
    __esModule: true,
    default: {
      get: apiGetMock,
      post: noop,
      put: noop,
      patch: noop,
      delete: noop,
    },
    authClient: {
      get: noop,
      post: noop,
      put: noop,
      patch: noop,
      delete: noop,
    },
  };
});

import { conversationApi, messageApi } from "./api";

describe("messageApi contract normalization", () => {
  beforeEach(() => {
    apiGetMock.mockReset();
  });

  it("normalizes unread payload to canonical unreadCount", async () => {
    apiGetMock.mockResolvedValueOnce({
      data: {
        success: true,
        data: { count: 7 },
      },
    });

    const response = await conversationApi.getUnreadCount("room-1");

    expect(response.data).toEqual({ unreadCount: 7 });
  });

  it("normalizes pinned payload to canonical messages wrapper", async () => {
    apiGetMock.mockResolvedValueOnce({
      data: {
        success: true,
        data: [{ id: "m-1", content: "hello" }],
      },
    });

    const response = await messageApi.getPinnedMessages("room-1");

    expect(response.data).toEqual({
      messages: [{ id: "m-1", content: "hello" }],
    });
  });
});
