import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiClientMock, authClientMock } = vi.hoisted(() => ({
  apiClientMock: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    request: vi.fn(),
  },
  authClientMock: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    request: vi.fn(),
  },
}));

vi.mock("../lib/axios", () => ({
  default: apiClientMock,
  authClient: authClientMock,
}));

import { contactApi, conversationApi, messageApi } from "./api";

describe("api contract", () => {
  beforeEach(() => {
    apiClientMock.get.mockReset();
    apiClientMock.post.mockReset();
  });

  it("searchMessages sends canonical conversationId query parameter", async () => {
    apiClientMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { messages: [], total: 0, page: 1, limit: 20 },
      },
    });

    await messageApi.searchMessages({
      q: "hello",
      conversationId: "conv-1",
      page: 2,
      limit: 20,
    });

    expect(apiClientMock.get).toHaveBeenCalledWith(
      expect.stringContaining("/messages/search?q=hello&conversationId=conv-1&page=2&limit=20"),
      expect.any(Object),
    );
  });

  it("shareContact posts canonical conversationId only", async () => {
    apiClientMock.post.mockResolvedValue({
      data: {
        success: true,
        data: null,
      },
    });

    await contactApi.shareContact({
      contactUserId: "user-b",
      conversationId: "conv-2",
    });

    expect(apiClientMock.post).toHaveBeenCalledWith("/contacts/share", {
      contactUserId: "user-b",
      conversationId: "conv-2",
    });
  });

  it("createPrivateConversation posts canonical peerUserId only", async () => {
    apiClientMock.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: "conv-1",
          type: "direct",
        },
      },
    });

    await conversationApi.createPrivateConversation("user-b");

    expect(apiClientMock.post).toHaveBeenCalledWith("/conversations/direct", {
      peerUserId: "user-b",
    });
  });

  it("createGroupConversation posts canonical /groups payload only", async () => {
    apiClientMock.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: "conv-2",
          type: "group",
        },
      },
    });

    await conversationApi.createGroupConversation({
      name: "Team Alpha",
      memberIds: ["user-a", "user-b"],
      avatar: "https://cdn.example.com/a.png",
      description: "desc",
    });

    expect(apiClientMock.post).toHaveBeenCalledWith("/groups", {
      type: "basic_group",
      title: "Team Alpha",
      memberIds: ["user-a", "user-b"],
      avatarUrl: "https://cdn.example.com/a.png",
      description: "desc",
    });
  });

  it("markAsRead posts lastVisibleMessageId only", async () => {
    apiClientMock.post.mockResolvedValue({
      data: {
        success: true,
        data: null,
      },
    });

    await conversationApi.markAsRead("conv-3", "msg-9");

    expect(apiClientMock.post).toHaveBeenCalledWith(
      "/conversations/conv-3/messages/read",
      {
        lastVisibleMessageId: "msg-9",
      },
    );
  });

  it("getMessages sends canonical beforeId cursor without timestamp aliases", async () => {
    apiClientMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { messages: [] },
        meta: { pagination: { limit: 20, hasNext: false, hasPrev: true } },
      },
    });

    await messageApi.getMessages("conv-9", {
      before: "2026-04-20T10:00:00.000Z",
      beforeId: "msg-42",
      limit: 20,
    });

    expect(apiClientMock.get).toHaveBeenCalledWith(
      "/conversations/conv-9/messages?limit=20&beforeId=msg-42",
    );
  });
});
