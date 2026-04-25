import { describe, expect, it, vi } from "vitest";
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

import { buildCreateDirectConversationPayload } from "./api";

const DIRECT_USER_ID = "0f3112fc-b70c-446a-a873-f85f1a4ea6f6";

describe("buildCreateDirectConversationPayload", () => {
  it("returns canonical peerUserId payloads for valid UUIDs", () => {
    expect(buildCreateDirectConversationPayload(` ${DIRECT_USER_ID} `)).toEqual({
      peerUserId: DIRECT_USER_ID,
    });
  });

  it("throws for empty input before any request can be sent", () => {
    expect(() => buildCreateDirectConversationPayload("   ")).toThrow(
      expect.objectContaining({
        name: "ApiContractError",
        statusCode: 422,
        code: ErrorCode.VALIDATION_ERROR,
        message: "peerUserId is required",
      }),
    );
  });

  it("throws for non-UUID input before any request can be sent", () => {
    expect(() => buildCreateDirectConversationPayload("legacy-user-id")).toThrow(
      expect.objectContaining({
        name: "ApiContractError",
        statusCode: 422,
        code: ErrorCode.VALIDATION_ERROR,
        message: "peerUserId must be a valid UUID",
      }),
    );
  });
});
