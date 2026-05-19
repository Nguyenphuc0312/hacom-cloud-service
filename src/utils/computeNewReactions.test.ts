/**
 * Unit tests for computeNewReactions utility.
 */

import { describe, it, expect } from "vitest";
import { computeNewReactions } from "./computeNewReactions";

describe("computeNewReactions", () => {
  const userA = "user-a";
  const userB = "user-b";
  const userC = "user-c";

  describe("Case 1: User reacts for the first time", () => {
    it("should add reaction when no existing reactions", () => {
      const prev: import("@chat/shared-types").Reaction[] = [];
      const result = computeNewReactions(prev, userA, "❤️");

      expect(result.action).toBe("add");
      expect(result.reactions).toHaveLength(1);
      expect(result.reactions[0]).toEqual({
        emoji: "❤️",
        userIds: [userA],
        count: 1,
      });
    });

    it("should add new emoji when other reactions exist", () => {
      const prev: import("@chat/shared-types").Reaction[] = [
        { emoji: "👍", userIds: [userB], count: 1 },
      ];
      const result = computeNewReactions(prev, userA, "❤️");

      expect(result.action).toBe("add");
      expect(result.reactions).toHaveLength(2);
      expect(result.reactions).toContainEqual({
        emoji: "❤️",
        userIds: [userA],
        count: 1,
      });
    });
  });

  describe("Case 2: User taps same emoji (toggle off)", () => {
    it("should remove user from reaction when tapping same emoji", () => {
      const prev: import("@chat/shared-types").Reaction[] = [
        { emoji: "❤️", userIds: [userA, userB], count: 2 },
      ];
      const result = computeNewReactions(prev, userA, "❤️");

      expect(result.action).toBe("remove");
      expect(result.reactions).toHaveLength(1);
      expect(result.reactions[0]).toEqual({
        emoji: "❤️",
        userIds: [userB],
        count: 1,
      });
    });

    it("should remove entire group when last user taps same emoji", () => {
      const prev: import("@chat/shared-types").Reaction[] = [
        { emoji: "❤️", userIds: [userA], count: 1 },
      ];
      const result = computeNewReactions(prev, userA, "❤️");

      expect(result.action).toBe("remove");
      expect(result.reactions).toHaveLength(0);
    });

    it("should handle toggle off in group with multiple reactions", () => {
      const prev: import("@chat/shared-types").Reaction[] = [
        { emoji: "❤️", userIds: [userA], count: 1 },
        { emoji: "👍", userIds: [userB, userC], count: 2 },
      ];
      const result = computeNewReactions(prev, userA, "❤️");

      expect(result.action).toBe("remove");
      expect(result.reactions).toHaveLength(1);
      expect(result.reactions[0].emoji).toBe("👍");
      expect(result.reactions[0].count).toBe(2);
    });
  });

  describe("Case 3: User changes emoji (replace)", () => {
    it("should remove from old group and add to new group", () => {
      const prev: import("@chat/shared-types").Reaction[] = [
        { emoji: "👍", userIds: [userA], count: 1 },
      ];
      const result = computeNewReactions(prev, userA, "❤️");

      expect(result.action).toBe("add");
      expect(result.reactions).toHaveLength(1);
      expect(result.reactions[0]).toEqual({
        emoji: "❤️",
        userIds: [userA],
        count: 1,
      });
    });

    it("should merge into existing target group", () => {
      const prev: import("@chat/shared-types").Reaction[] = [
        { emoji: "👍", userIds: [userA], count: 1 },
        { emoji: "❤️", userIds: [userB], count: 1 },
      ];
      const result = computeNewReactions(prev, userA, "❤️");

      expect(result.action).toBe("add");
      expect(result.reactions).toHaveLength(1);
      expect(result.reactions[0]).toEqual({
        emoji: "❤️",
        userIds: [userB, userA],
        count: 2,
      });
    });

    it("should not duplicate user in target group", () => {
      const prev: import("@chat/shared-types").Reaction[] = [
        { emoji: "👍", userIds: [userA], count: 1 },
        { emoji: "❤️", userIds: [userA, userB], count: 2 },
      ];
      const result = computeNewReactions(prev, userA, "❤️");

      expect(result.action).toBe("add");
      expect(result.reactions).toHaveLength(1);
      expect(result.reactions[0].userIds).toEqual([userA, userB]);
      expect(result.reactions[0].count).toBe(2);
    });
  });

  describe("Case 4: Multiple users, one removes reaction", () => {
    it("should only affect the user who removed", () => {
      const prev: import("@chat/shared-types").Reaction[] = [
        { emoji: "❤️", userIds: [userA, userB, userC], count: 3 },
      ];
      const result = computeNewReactions(prev, userB, "❤️");

      expect(result.action).toBe("remove");
      expect(result.reactions).toHaveLength(1);
      expect(result.reactions[0].userIds).toEqual([userA, userC]);
      expect(result.reactions[0].count).toBe(2);
    });
  });

  describe("Case 5: Group count drops to 0", () => {
    it("should remove empty groups", () => {
      const prev: import("@chat/shared-types").Reaction[] = [
        { emoji: "❤️", userIds: [userA], count: 1 },
        { emoji: "👍", userIds: [userB], count: 1 },
      ];
      const result = computeNewReactions(prev, userA, "❤️");

      expect(result.action).toBe("remove");
      expect(result.reactions).toHaveLength(1);
      expect(result.reactions[0].emoji).toBe("👍");
    });

    it("should handle all groups becoming empty", () => {
      const prev: import("@chat/shared-types").Reaction[] = [
        { emoji: "❤️", userIds: [userA], count: 1 },
      ];
      const result = computeNewReactions(prev, userA, "❤️");

      expect(result.action).toBe("remove");
      expect(result.reactions).toHaveLength(0);
    });
  });

  describe("Sorting", () => {
    it("should sort by count descending", () => {
      const prev: import("@chat/shared-types").Reaction[] = [
        { emoji: "👍", userIds: [userA], count: 1 },
        { emoji: "❤️", userIds: [userA, userB, userC], count: 3 },
      ];
      // User A already has "👍", so adding "😂" replaces it
      // Result should be: ❤️ (3), 😂 (1)
      const result = computeNewReactions(prev, userA, "😂");

      expect(result.reactions[0].emoji).toBe("❤️");
      expect(result.reactions[0].count).toBe(3);
      expect(result.reactions[1].emoji).toBe("😂");
      expect(result.reactions[1].count).toBe(1);
    });

    it("should maintain sort order when reactions are added/removed", () => {
      const prev: import("@chat/shared-types").Reaction[] = [
        { emoji: "👍", userIds: [userA, userB], count: 2 },
        { emoji: "❤️", userIds: [userC], count: 1 },
      ];
      // User A taps ❤️, replacing 👍
      const result = computeNewReactions(prev, userA, "❤️");

      // ❤️ should now have count 2 (was 1 + userA)
      // 👍 should now have count 1 (was 2 - userA)
      expect(result.reactions[0].emoji).toBe("❤️");
      expect(result.reactions[0].count).toBe(2);
      expect(result.reactions[1].emoji).toBe("👍");
      expect(result.reactions[1].count).toBe(1);
    });
  });

  describe("Edge cases", () => {
    it("should handle empty userId gracefully", () => {
      const prev: import("@chat/shared-types").Reaction[] = [];
      const result = computeNewReactions(prev, "", "❤️");

      expect(result.reactions).toHaveLength(1);
      expect(result.reactions[0].userIds).toContain("");
    });

    it("should handle undefined reactions array", () => {
      const result = computeNewReactions([], userA, "❤️");

      expect(result.action).toBe("add");
      expect(result.reactions).toHaveLength(1);
    });

    it("should not modify original array", () => {
      const prev: import("@chat/shared-types").Reaction[] = [
        { emoji: "❤️", userIds: [userA], count: 1 },
      ];
      const original = [...prev];
      computeNewReactions(prev, userA, "❤️");

      expect(prev).toEqual(original);
    });
  });
});
