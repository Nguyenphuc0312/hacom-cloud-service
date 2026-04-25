import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorCode } from "@hacom/chat-shared-types/core";

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

const DIRECT_USER_ID = "0f3112fc-b70c-446a-a873-f85f1a4ea6f6";
const ACTOR_USER_ID = "41b29701-9b96-4a50-97c1-04ed835bf2c6";

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

    await conversationApi.createPrivateConversation(` ${DIRECT_USER_ID} `);

    expect(apiClientMock.post).toHaveBeenCalledWith(
      "/conversations/direct",
      {
        peerUserId: DIRECT_USER_ID,
      },
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Request-Id": expect.stringMatching(/^direct-dm:/),
        }),
      }),
    );
    expect(apiClientMock.post.mock.calls[0][1]).not.toHaveProperty("userId");
  });

  it("createPrivateConversation rejects malformed peerUserId values before sending the request", async () => {
    await expect(conversationApi.createPrivateConversation(ACTOR_USER_ID.slice(0, 8))).rejects.toMatchObject({
      name: "ApiContractError",
      statusCode: 422,
      code: ErrorCode.VALIDATION_ERROR,
      message: "peerUserId must be a valid UUID",
    });

    expect(apiClientMock.post).not.toHaveBeenCalled();
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
      expect.objectContaining({ signal: undefined }),
    );
  });

  it("getMessages omits page for cursorless recent-window requests", async () => {
    apiClientMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { messages: [] },
        meta: { pagination: { limit: 40, hasNext: false, hasPrev: true } },
      },
    });

    await messageApi.getMessages("conv-10", {
      limit: 40,
    });

    expect(apiClientMock.get).toHaveBeenCalledWith(
      "/conversations/conv-10/messages?limit=40",
      expect.objectContaining({ signal: undefined }),
    );
  });

  it("getMessages forwards AbortSignal for cancellable room switches", async () => {
    apiClientMock.get.mockResolvedValue({
      data: {
        success: true,
        data: { messages: [] },
        meta: { hasNext: false, hasPrev: true, returnedWindow: "latest" },
      },
    });

    const abortController = new AbortController();

    await messageApi.getMessages("conv-11", {
      limit: 25,
      signal: abortController.signal,
    });

    expect(apiClientMock.get).toHaveBeenCalledWith(
      "/conversations/conv-11/messages?limit=25",
      expect.objectContaining({ signal: abortController.signal }),
    );
  });
});
