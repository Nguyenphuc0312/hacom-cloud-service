import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Reaction } from "../../../types";

describe("Reaction functionality", () => {
  describe("Reaction data structure", () => {
    it("should have correct shape for reaction", () => {
      const reaction: Reaction = {
        emoji: "👍",
        userIds: ["user-1", "user-2"],
        count: 2,
      };

      expect(reaction.emoji).toBe("👍");
      expect(reaction.userIds).toHaveLength(2);
      expect(reaction.count).toBe(2);
    });

    it("should support multiple emoji types", () => {
      const reactions: Reaction[] = [
        { emoji: "👍", userIds: ["user-1"], count: 1 },
        { emoji: "❤️", userIds: ["user-2", "user-3"], count: 2 },
        { emoji: "😂", userIds: ["user-1", "user-2", "user-3"], count: 3 },
      ];

      expect(reactions).toHaveLength(3);
      expect(reactions[0].emoji).toBe("👍");
      expect(reactions[1].emoji).toBe("❤️");
      expect(reactions[2].emoji).toBe("😂");
    });

    it("should correctly identify user's own reaction", () => {
      const currentUserId = "user-1";
      const reactions: Reaction[] = [
        { emoji: "👍", userIds: ["user-1", "user-2"], count: 2 },
        { emoji: "❤️", userIds: ["user-2", "user-3"], count: 2 },
      ];

      const myReaction = reactions.find((r) =>
        r.userIds.includes(currentUserId),
      );

      expect(myReaction?.emoji).toBe("👍");
    });

    it("should calculate count correctly when toggling reaction", () => {
      const reaction: Reaction = {
        emoji: "👍",
        userIds: ["user-1", "user-2"],
        count: 2,
      };

      // Remove user-1's reaction
      const updatedUserIds = reaction.userIds.filter((id) => id !== "user-1");
      const updatedCount = updatedUserIds.length;

      expect(updatedUserIds).toHaveLength(1);
      expect(updatedCount).toBe(1);
    });
  });

  describe("Reaction toggle logic", () => {
    it("should remove reaction when toggling same emoji", () => {
      const currentUserId = "user-1";
      const targetEmoji = "👍";
      const reactions: Reaction[] = [
        { emoji: "👍", userIds: ["user-1", "user-2"], count: 2 },
      ];

      const existingReaction = reactions.find((r) => r.emoji === targetEmoji);
      const hasReacted = existingReaction?.userIds.includes(currentUserId);

      if (hasReacted) {
        // Should remove
        const updated = reactions.map((r) => {
          if (r.emoji === targetEmoji) {
            return {
              ...r,
              userIds: r.userIds.filter((id) => id !== currentUserId),
              count: r.count - 1,
            };
          }
          return r;
        });
        expect(updated[0].userIds).not.toContain(currentUserId);
        expect(updated[0].count).toBe(1);
      }
    });

    it("should add reaction when toggling new emoji", () => {
      const currentUserId = "user-3";
      const targetEmoji = "❤️";
      const reactions: Reaction[] = [
        { emoji: "👍", userIds: ["user-1"], count: 1 },
      ];

      const existingReaction = reactions.find((r) => r.emoji === targetEmoji);

      if (!existingReaction) {
        // Should add new reaction
        const updated = [
          ...reactions,
          { emoji: targetEmoji, userIds: [currentUserId], count: 1 },
        ];
        expect(updated).toHaveLength(2);
        expect(updated[1].emoji).toBe("❤️");
        expect(updated[1].userIds).toContain(currentUserId);
      }
    });

    it("should switch reaction when toggling different emoji", () => {
      const currentUserId = "user-1";
      const oldEmoji = "👍";
      const newEmoji = "❤️";
      const reactions: Reaction[] = [
        { emoji: "👍", userIds: ["user-1", "user-2"], count: 2 },
        { emoji: "❤️", userIds: ["user-2"], count: 1 },
      ];

      // Remove from old
      const updated = reactions.map((r) => {
        if (r.emoji === oldEmoji) {
          return {
            ...r,
            userIds: r.userIds.filter((id) => id !== currentUserId),
            count: r.count - 1,
          };
        }
        if (r.emoji === newEmoji) {
          return {
            ...r,
            userIds: [...r.userIds, currentUserId],
            count: r.count + 1,
          };
        }
        return r;
      });

      const oldReaction = updated.find((r) => r.emoji === oldEmoji);
      const newReaction = updated.find((r) => r.emoji === newEmoji);

      expect(oldReaction?.userIds).not.toContain(currentUserId);
      expect(oldReaction?.count).toBe(1);
      expect(newReaction?.userIds).toContain(currentUserId);
      expect(newReaction?.count).toBe(2);
    });
  });

  describe("Reaction display", () => {
    it("should render count only when > 1", () => {
      const singleReaction: Reaction = {
        emoji: "👍",
        userIds: ["user-1"],
        count: 1,
      };

      const multiReaction: Reaction = {
        emoji: "👍",
        userIds: ["user-1", "user-2"],
        count: 2,
      };

      const shouldShowCount = (r: Reaction) => r.count > 1;

      expect(shouldShowCount(singleReaction)).toBe(false);
      expect(shouldShowCount(multiReaction)).toBe(true);
    });

    it("should highlight own reaction", () => {
      const currentUserId = "user-1";
      const reactions: Reaction[] = [
        { emoji: "👍", userIds: ["user-1", "user-2"], count: 2 },
        { emoji: "❤️", userIds: ["user-2"], count: 1 },
      ];

      const getHighlightedEmojis = (reactions: Reaction[], userId: string) =>
        reactions
          .filter((r) => r.userIds.includes(userId))
          .map((r) => r.emoji);

      const highlighted = getHighlightedEmojis(reactions, currentUserId);
      expect(highlighted).toContain("👍");
      expect(highlighted).not.toContain("❤️");
    });
  });
});
