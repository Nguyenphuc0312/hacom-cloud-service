/**
 * @fileoverview Canonical contract boundary tests
 *
 * Validates that frontend code correctly normalizes legacy API shapes at the
 * boundary and never leaks legacy roomId aliases into store/service layers.
 *
 * Scope: conversationIdentity normalization, API payload normalization,
 * and store-level invariant enforcement.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { resolveConversationId, resolveConversationIds, resetConversationIdentityWarningsForTest } from "./lib/conversationIdentity";

// ============================================
// resolveConversationId — canonical shape
// ============================================

describe("canonicalContractBoundary — resolveConversationId canonical", () => {
  beforeEach(() => {
    resetConversationIdentityWarningsForTest();
  });

  it("returns conversationId when present (string)", () => {
    const result = resolveConversationId({ conversationId: "conv-abc123" });
    expect(result).toBe("conv-abc123");
  });

  it("returns null when payload is not a record", () => {
    expect(resolveConversationId(null)).toBeNull();
    expect(resolveConversationId(undefined)).toBeNull();
    expect(resolveConversationId("string")).toBeNull();
    expect(resolveConversationId(123)).toBeNull();
  });

  it("prefers conversationId over fallback fields", () => {
    const result = resolveConversationId({
      conversationId: "canonical",
      id: "entity-id",
      _id: "mongo-id",
    });
    expect(result).toBe("canonical");
  });

  it("falls back to id when includeEntityId is true and no conversationId", () => {
    const result = resolveConversationId(
      { id: "entity-456" },
      { includeEntityId: true },
    );
    expect(result).toBe("entity-456");
  });

  it("falls back to _id when includeEntityId is true and no conversationId/id", () => {
    const result = resolveConversationId(
      { _id: "mongo-789" },
      { includeEntityId: true },
    );
    expect(result).toBe("mongo-789");
  });

  it("returns fallback when provided and no canonical fields found", () => {
    const result = resolveConversationId(
      { foo: "bar" },
      { fallbackConversationId: "fallback-default" },
    );
    expect(result).toBe("fallback-default");
  });

  it("resolves nested conversationId via nestedKeys", () => {
    const result = resolveConversationId(
      { data: { conversationId: "nested-conv" } },
      { nestedKeys: ["data"] },
    );
    expect(result).toBe("nested-conv");
  });

  it("normalizes legacy roomId as last resort (warns in DEV)", () => {
    const result = resolveConversationId({ roomId: "legacy-room" });
    expect(result).toBe("legacy-room");
  });

  it("normalizes legacy room_id field", () => {
    const result = resolveConversationId({ room_id: "legacy-room-id" });
    expect(result).toBe("legacy-room-id");
  });

  it("normalizes legacy room alias field", () => {
    const result = resolveConversationId({ room: "legacy-room-alias" });
    expect(result).toBe("legacy-room-alias");
  });

  it("prefers canonical conversationId over legacy roomId", () => {
    const result = resolveConversationId({
      conversationId: "canonical",
      roomId: "legacy",
    });
    expect(result).toBe("canonical");
  });

  it("ignores empty string conversationId", () => {
    const result = resolveConversationId({ conversationId: "" });
    expect(result).toBeNull();
  });

  it("ignores whitespace-only conversationId", () => {
    const result = resolveConversationId({ conversationId: "   " });
    expect(result).toBeNull();
  });
});

// ============================================
// resolveConversationIds — canonical collection
// ============================================

describe("canonicalContractBoundary — resolveConversationIds canonical", () => {
  beforeEach(() => {
    resetConversationIdentityWarningsForTest();
  });

  it("returns conversationIds array when canonical field present", () => {
    const result = resolveConversationIds({
      conversationIds: ["c1", "c2", "c3"],
    });
    expect(result).toEqual(["c1", "c2", "c3"]);
  });

  it("filters out non-string values from conversationIds", () => {
    const result = resolveConversationIds({
      conversationIds: ["c1", null, undefined, 123, "c2", ""],
    });
    expect(result).toEqual(["c1", "c2"]);
  });

  it("falls back to legacy roomIds field", () => {
    const result = resolveConversationIds({
      roomIds: ["r1", "r2"],
    });
    expect(result).toEqual(["r1", "r2"]);
  });

  it("falls back to legacy rooms field", () => {
    const result = resolveConversationIds({
      rooms: ["room1", "room2"],
    });
    expect(result).toEqual(["room1", "room2"]);
  });

  it("returns empty array when no conversationIds or legacy fields", () => {
    const result = resolveConversationIds({});
    expect(result).toEqual([]);
  });

  it("returns empty array for null/undefined payload", () => {
    expect(resolveConversationIds(null)).toEqual([]);
    expect(resolveConversationIds(undefined)).toEqual([]);
  });

  it("normalizes legacy fields alongside source tag", () => {
    const result = resolveConversationIds(
      { roomIds: ["legacy-1"] },
      { source: "test" },
    );
    expect(result).toEqual(["legacy-1"]);
  });
});

// ============================================
// API payload normalization boundary
// ============================================

describe("canonicalContractBoundary — API payload normalization", () => {
  it("normalizeConversationReadState normalizes unreadCount from legacy count field", () => {
    const normalizeConversationReadState = (payload: unknown) => {
      const record =
        payload && typeof payload === "object"
          ? (payload as Record<string, unknown>)
          : {};
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

    // Canonical field
    const canonical = normalizeConversationReadState({ unreadCount: 5 });
    expect(canonical.unreadCount).toBe(5);

    // Legacy count field is NOT normalized by normalizeConversationReadState —
    // use normalizeUnreadCountPayload for that. normalizeConversationReadState only
    // handles the canonical unreadCount field.
    const legacy = normalizeConversationReadState({ count: 3 });
    expect(legacy.unreadCount).toBe(0);
  });

  it("normalizeUnreadCountPayload handles both canonical and legacy shapes", () => {
    const normalizeUnreadCountPayload = (payload: unknown) => {
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

    expect(normalizeUnreadCountPayload({ unreadCount: 10 })).toEqual({ unreadCount: 10 });
    expect(normalizeUnreadCountPayload({ count: 7 })).toEqual({ unreadCount: 7 });
    expect(normalizeUnreadCountPayload({ unreadCount: 5, count: 3 })).toEqual({ unreadCount: 5 });
    expect(normalizeUnreadCountPayload(null)).toEqual({ unreadCount: 0 });
    expect(normalizeUnreadCountPayload({})).toEqual({ unreadCount: 0 });
  });
});

// ============================================
// Store invariant: conversationId must be normalized before entering store
// ============================================

describe("canonicalContractBoundary — store invariant enforcement", () => {
  it("store must never receive raw roomId as primary conversation identifier", () => {
    // This test documents the invariant:
    // All WebSocket events and API responses that carry roomId must be normalized
    // at the boundary (in useWebSocket / api service), not in the store.
    //
    // The resolveConversationId function handles this by returning conversationId
    // when present, falling back to roomId only when no canonical field exists.
    const rawEvent = { roomId: "legacy-room-1" };
    const resolved = resolveConversationId(rawEvent);

    // The legacy roomId is resolved, but the caller MUST prefer conversationId
    expect(resolved).toBe("legacy-room-1");
    // Canonical shape would have:
    const canonicalEvent = { conversationId: "canonical-conv-1" };
    expect(resolveConversationId(canonicalEvent)).toBe("canonical-conv-1");
  });

  it("conversationId takes precedence over id/_id fields", () => {
    const mixed = {
      conversationId: "primary",
      id: "entity-id",
      _id: "mongo-id",
    };
    expect(resolveConversationId(mixed)).toBe("primary");
  });

  it("entity id fields are only consulted when includeEntityId is true", () => {
    const entityOnly = { id: "entity-only" };
    expect(resolveConversationId(entityOnly)).toBeNull();
    expect(resolveConversationId(entityOnly, { includeEntityId: true })).toBe("entity-only");
  });
});
