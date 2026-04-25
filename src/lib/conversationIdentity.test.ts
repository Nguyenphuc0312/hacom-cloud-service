import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  resetConversationIdentityWarningsForTest,
  resolveConversationId,
  resolveConversationIds,
} from "./conversationIdentity";

describe("conversationIdentity", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

  beforeEach(() => {
    warnSpy.mockClear();
    resetConversationIdentityWarningsForTest();
  });

  afterEach(() => {
    resetConversationIdentityWarningsForTest();
  });

  it("prefers canonical conversationId when both canonical and legacy aliases exist", () => {
    expect(
      resolveConversationId(
        {
          conversationId: "conv-1",
          roomId: "legacy-room-1",
        },
        { source: "test.payload" },
      ),
    ).toBe("conv-1");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("normalizes legacy roomId at the boundary and warns once in dev", () => {
    expect(
      resolveConversationId(
        {
          roomId: "conv-legacy",
        },
        { source: "test.legacy" },
      ),
    ).toBe("conv-legacy");
    expect(
      resolveConversationId(
        {
          roomId: "conv-legacy",
        },
        { source: "test.legacy" },
      ),
    ).toBe("conv-legacy");

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("resolves nested message payloads using canonical conversationId first", () => {
    expect(
      resolveConversationId(
        {
          message: {
            conversationId: "nested-conv-1",
          },
        },
        { source: "test.nested", nestedKeys: ["message"] },
      ),
    ).toBe("nested-conv-1");
  });

  it("normalizes legacy roomIds collections at the boundary and warns once in dev", () => {
    expect(
      resolveConversationIds(
        {
          roomIds: ["conv-legacy-1", "conv-legacy-2"],
        },
        { source: "test.legacy-collection" },
      ),
    ).toEqual(["conv-legacy-1", "conv-legacy-2"]);
    expect(
      resolveConversationIds(
        {
          roomIds: ["conv-legacy-1", "conv-legacy-2"],
        },
        { source: "test.legacy-collection" },
      ),
    ).toEqual(["conv-legacy-1", "conv-legacy-2"]);

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("does not treat a generic entity id as a conversation id unless explicitly allowed", () => {
    expect(
      resolveConversationId(
        {
          id: "message-entity-id",
        },
        { source: "test.entity-id" },
      ),
    ).toBeNull();

    expect(
      resolveConversationId(
        {
          id: "conversation-entity-id",
        },
        { source: "test.entity-id", includeEntityId: true },
      ),
    ).toBe("conversation-entity-id");
  });
});
