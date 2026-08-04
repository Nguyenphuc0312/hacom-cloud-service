/**
 * @fileoverview conversationIdentity tests
 *
 * Validates the resolveConversationId and resolveConversationIds utilities
 * that normalize legacy roomId aliases to canonical conversationId.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  resolveConversationId,
  resolveConversationIds,
  resetConversationIdentityWarningsForTest,
} from "./conversationIdentity";

// Silence DEV-mode warnings during tests
const originalEnv = import.meta.env;
const mockEnv = { ...originalEnv, DEV: false };

describe("conversationIdentity", () => {
  beforeEach(() => {
    resetConversationIdentityWarningsForTest();
    Object.defineProperty(import.meta, "env", {
      value: mockEnv,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(import.meta, "env", {
      value: originalEnv,
      writable: true,
      configurable: true,
    });
  });

  // ============================================
  // resolveConversationId
  // ============================================

  describe("resolveConversationId", () => {
    it("returns conversationId when it is a non-empty string", () => {
      expect(resolveConversationId({ conversationId: "conv-123" })).toBe("conv-123");
      expect(resolveConversationId({ conversationId: "550e8400-e29b-41d4-a716-446655440000" })).toBe(
        "550e8400-e29b-41d4-a716-446655440000",
      );
    });

    it("returns null for null/undefined payload", () => {
      expect(resolveConversationId(null)).toBeNull();
      expect(resolveConversationId(undefined)).toBeNull();
    });

    it("returns null for non-object primitives", () => {
      expect(resolveConversationId("string")).toBeNull();
      expect(resolveConversationId(123)).toBeNull();
      expect(resolveConversationId(true)).toBeNull();
      expect(resolveConversationId([])).toBeNull();
    });

    it("prefers conversationId over id / _id", () => {
      const result = resolveConversationId({
        conversationId: "canonical",
        id: "entity-id",
        _id: "mongo-id",
      });
      expect(result).toBe("canonical");
    });

    it("returns fallbackConversationId when provided and no canonical fields", () => {
      expect(
        resolveConversationId(
          { unrelated: "data" },
          { fallbackConversationId: "fallback" },
        ),
      ).toBe("fallback");
      expect(
        resolveConversationId({ unrelated: "data" }, { fallbackConversationId: null }),
      ).toBeNull();
    });

    it("returns fallbackConversationId when conversationId is empty", () => {
      expect(
        resolveConversationId(
          { conversationId: "" },
          { fallbackConversationId: "fallback" },
        ),
      ).toBe("fallback");
      expect(
        resolveConversationId(
          { conversationId: "   " },
          { fallbackConversationId: "fallback" },
        ),
      ).toBe("fallback");
    });

    describe("with includeEntityId", () => {
      it("falls back to id field when includeEntityId is true", () => {
        const result = resolveConversationId(
          { id: "entity-456" },
          { includeEntityId: true },
        );
        expect(result).toBe("entity-456");
      });

      it("falls back to _id field when includeEntityId is true", () => {
        const result = resolveConversationId(
          { _id: "mongo-789" },
          { includeEntityId: true },
        );
        expect(result).toBe("mongo-789");
      });

      it("id takes precedence over _id when includeEntityId is true", () => {
        const result = resolveConversationId(
          { id: "entity-1", _id: "mongo-2" },
          { includeEntityId: true },
        );
        expect(result).toBe("entity-1");
      });

      it("id/_id are NOT consulted without includeEntityId", () => {
        expect(resolveConversationId({ id: "entity-1" })).toBeNull();
        expect(resolveConversationId({ _id: "mongo-1" })).toBeNull();
      });

      it("conversationId still takes precedence when includeEntityId is true", () => {
        const result = resolveConversationId(
          { conversationId: "primary", id: "secondary" },
          { includeEntityId: true },
        );
        expect(result).toBe("primary");
      });
    });

    describe("with nestedKeys", () => {
      it("searches nested objects for conversationId", () => {
        const result = resolveConversationId(
          { data: { conversationId: "nested-conv" } },
          { nestedKeys: ["data"] },
        );
        expect(result).toBe("nested-conv");
      });

      it("returns fallback when nested object has no conversationId", () => {
        const result = resolveConversationId(
          { data: { unrelated: "value" } },
          { nestedKeys: ["data"], fallbackConversationId: "fallback" },
        );
        expect(result).toBe("fallback");
      });

      it("skips non-object nested values", () => {
        const result = resolveConversationId(
          { data: "not an object" },
          { nestedKeys: ["data"] },
        );
        expect(result).toBeNull();
      });

      it("searches multiple nestedKeys in order", () => {
        const result = resolveConversationId(
          { meta: { unrelated: true }, payload: { conversationId: "found-in-payload" } },
          { nestedKeys: ["meta", "payload"] },
        );
        expect(result).toBe("found-in-payload");
      });

      it("nested conversationId is overridden by top-level conversationId", () => {
        const result = resolveConversationId(
          { conversationId: "top-level", payload: { conversationId: "nested" } },
          { nestedKeys: ["payload"] },
        );
        expect(result).toBe("top-level");
      });
    });

    describe("legacy roomId normalization", () => {
      it("falls back to roomId when no conversationId exists", () => {
        expect(resolveConversationId({ roomId: "legacy-room" })).toBe("legacy-room");
      });

      it("falls back to room_id (snake_case)", () => {
        expect(resolveConversationId({ room_id: "legacy-room-id" })).toBe(
          "legacy-room-id",
        );
      });

      it("falls back to room alias field", () => {
        expect(resolveConversationId({ room: "legacy-room-alias" })).toBe(
          "legacy-room-alias",
        );
      });

      it("prefers roomId over room_id when both exist", () => {
        const result = resolveConversationId({
          roomId: "room-id-preferred",
          room_id: "room-id-alt",
        });
        expect(result).toBe("room-id-preferred");
      });

      it("conversationId takes precedence over all legacy fields", () => {
        const result = resolveConversationId({
          conversationId: "canonical",
          roomId: "legacy",
          room_id: "legacy-alt",
          room: "legacy-alias",
        });
        expect(result).toBe("canonical");
      });

      it("normalizes nested legacy fields via nestedKeys", () => {
        const result = resolveConversationId(
          { message: { roomId: "nested-legacy-room" } },
          { nestedKeys: ["message"] },
        );
        expect(result).toBe("nested-legacy-room");
      });

      it("nested conversationId takes precedence over nested roomId", () => {
        const result = resolveConversationId(
          { message: { conversationId: "nested-canonical", roomId: "nested-legacy" } },
          { nestedKeys: ["message"] },
        );
        expect(result).toBe("nested-canonical");
      });
    });
  });

  // ============================================
  // resolveConversationIds (array)
  // ============================================

  describe("resolveConversationIds", () => {
    it("returns canonical conversationIds array", () => {
      expect(resolveConversationIds({ conversationIds: ["c1", "c2"] })).toEqual([
        "c1",
        "c2",
      ]);
    });

    it("filters non-string values from conversationIds", () => {
      expect(
        resolveConversationIds({
          conversationIds: ["c1", null, undefined, 123, "c2", ""],
        }),
      ).toEqual(["c1", "c2"]);
    });

    it("returns empty array for empty conversationIds", () => {
      expect(resolveConversationIds({ conversationIds: [] })).toEqual([]);
    });

    it("falls back to legacy roomIds field", () => {
      expect(resolveConversationIds({ roomIds: ["r1", "r2"] })).toEqual(["r1", "r2"]);
    });

    it("falls back to legacy rooms field", () => {
      expect(resolveConversationIds({ rooms: ["room1", "room2"] })).toEqual([
        "room1",
        "room2",
      ]);
    });

    it("prefers conversationIds over roomIds", () => {
      expect(
        resolveConversationIds({
          conversationIds: ["canonical-1"],
          roomIds: ["legacy-1"],
        }),
      ).toEqual(["canonical-1"]);
    });

    it("prefers roomIds over rooms", () => {
      expect(
        resolveConversationIds({ roomIds: ["rooms-1"], rooms: ["rooms-alt"] }),
      ).toEqual(["rooms-1"]);
    });

    it("returns empty array when no matching fields", () => {
      expect(resolveConversationIds({})).toEqual([]);
    });

    it("returns empty array for null/undefined payload", () => {
      expect(resolveConversationIds(null)).toEqual([]);
      expect(resolveConversationIds(undefined)).toEqual([]);
    });

    it("returns empty array when conversationIds is not an array", () => {
      expect(resolveConversationIds({ conversationIds: "not-an-array" })).toEqual([]);
      expect(resolveConversationIds({ conversationIds: { not: "array" } })).toEqual([]);
    });

    it("filters non-string values from legacy arrays too", () => {
      expect(
        resolveConversationIds({ roomIds: ["r1", null, "r2", undefined, 42] }),
      ).toEqual(["r1", "r2"]);
    });

    it("returns empty array when both legacy fields are non-arrays", () => {
      expect(resolveConversationIds({ roomIds: "string", rooms: null })).toEqual([]);
    });
  });

  // ============================================
  // Integration: conversationIdentity normalization chain
  // ============================================

  describe("normalization chain", () => {
    it("normalizes WebSocket event payload (canonical shape)", () => {
      const event = {
        conversationId: "ws-event-conv",
        message: { id: "msg-1", content: "hello" },
      };
      const convId = resolveConversationId(event, {
        source: "useWebSocket.payload",
        nestedKeys: ["message"],
      });
      expect(convId).toBe("ws-event-conv");
    });

    it("normalizes WebSocket event payload (legacy roomId shape)", () => {
      const event = {
        roomId: "ws-legacy-room",
        message: { id: "msg-1" },
      };
      const convId = resolveConversationId(event, {
        source: "useWebSocket.payload",
        nestedKeys: ["message"],
      });
      expect(convId).toBe("ws-legacy-room");
    });

    it("normalizes collection event with multiple IDs", () => {
      const event = {
        conversationIds: ["conv-1", "conv-2", "conv-3"],
      };
      expect(resolveConversationIds(event)).toEqual(["conv-1", "conv-2", "conv-3"]);
    });

    it("normalizes conversation list with mixed canonical/legacy IDs", () => {
      const conversations = [
        { id: "entity-1" },
        { conversationId: "canonical-2" },
        { roomId: "legacy-3" },
      ];

      const normalized = conversations.map((conv) =>
        resolveConversationId(conv, { includeEntityId: true }),
      );

      expect(normalized).toEqual(["entity-1", "canonical-2", "legacy-3"]);
    });
  });

  // ============================================
  // Edge cases
  // ============================================

  describe("edge cases", () => {
    it("handles deeply nested conversationId (only top-level keys are searched)", () => {
      // resolveConversationId only looks at top-level fields + first level of nestedKeys.
      // Deeply nested (level3) is NOT searched — this is the actual behavior.
      const result = resolveConversationId(
        { level1: { level2: { level3: { conversationId: "deep" } } } },
        { nestedKeys: ["level1"] },
      );
      // level1 is an object but has no conversationId — so result is null
      expect(result).toBeNull();
    });

    it("returns first found conversationId from multiple nestedKeys", () => {
      const result = resolveConversationId(
        { meta: { conversationId: "found-in-meta" }, payload: { conversationId: "found-in-payload" } },
        { nestedKeys: ["meta", "payload"] },
      );
      expect(result).toBe("found-in-meta");
    });

    it("handles empty object", () => {
      expect(resolveConversationId({})).toBeNull();
    });

    it("handles object with only null values", () => {
      expect(resolveConversationId({ a: null, b: null })).toBeNull();
    });

    it("handles array as payload (returns null)", () => {
      expect(resolveConversationId([])).toBeNull();
      expect(resolveConversationId(["item1", "item2"])).toBeNull();
    });
  });
});
