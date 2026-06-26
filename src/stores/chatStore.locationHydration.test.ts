import { describe, expect, it } from "vitest";
import { MessageType } from "../types";
import { __normalizeMessageForTest } from "./chatStore";

const baseHistoryMessage = {
  id: "msg-location-1",
  conversationId: "conv-1",
  senderId: "user-1",
  type: MessageType.LOCATION,
  createdAt: "2026-06-26T02:30:05.000Z",
};

describe("chatStore location history hydration", () => {
  it("preserves canonical location payload from history messages", () => {
    const message = __normalizeMessageForTest({
      ...baseHistoryMessage,
      content: "",
      location: {
        latitude: 21.027763,
        longitude: 105.83416,
        accuracyM: 143,
        capturedAt: "2026-06-26T02:30:00.000Z",
      },
    });

    expect(message?.type).toBe(MessageType.LOCATION);
    expect(message?.content).toBe("");
    expect(message?.location).toEqual({
      latitude: 21.027763,
      longitude: 105.83416,
      accuracyM: 143,
      capturedAt: "2026-06-26T02:30:00.000Z",
    });
  });

  it("hydrates location payload from Mongo content.location shape", () => {
    const message = __normalizeMessageForTest({
      ...baseHistoryMessage,
      content: {
        location: {
          latitude: 21.027763,
          longitude: 105.83416,
          accuracy_m: 143,
          captured_at: "2026-06-26T02:30:00.000Z",
        },
        preview_text: "Location",
      },
    });

    expect(message?.type).toBe(MessageType.LOCATION);
    expect(message?.content).toBe("");
    expect(message?.location).toEqual({
      latitude: 21.027763,
      longitude: 105.83416,
      accuracyM: 143,
      capturedAt: "2026-06-26T02:30:00.000Z",
    });
  });

  it("does not turn missing location payload into timestamp text content", () => {
    const message = __normalizeMessageForTest({
      ...baseHistoryMessage,
      content: "",
    });

    expect(message?.type).toBe(MessageType.LOCATION);
    expect(message?.location).toBeUndefined();
    expect(message?.content).toBe("");
  });
});
