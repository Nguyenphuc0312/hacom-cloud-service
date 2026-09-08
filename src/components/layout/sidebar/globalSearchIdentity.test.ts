import { describe, expect, it, vi } from "vitest";

import type { Conversation } from "../../../types";
import { getSearchConversationDisplayName } from "./globalSearchIdentity";

const directConversation = {
  id: "direct-1",
  type: "direct",
  participants: [
    { id: "me", username: "me", displayName: "Tôi" },
    {
      id: "friend",
      username: "friend",
      displayName: "Nguyễn Minh Quang",
    },
  ],
} as unknown as Conversation;

describe("getSearchConversationDisplayName", () => {
  it("uses the local friend alias for a direct conversation", () => {
    expect(
      getSearchConversationDisplayName(directConversation, "me", (userId) =>
        userId === "friend" ? "  VPTCT-Nguyễn Minh Quang  " : undefined,
      ),
    ).toBe("VPTCT-Nguyễn Minh Quang");
  });

  it("falls back to the participant name when no alias is available", () => {
    expect(
      getSearchConversationDisplayName(
        directConversation,
        "me",
        () => undefined,
      ),
    ).toBe("Nguyễn Minh Quang");
  });

  it("keeps a group name instead of applying a participant alias", () => {
    const resolvePreferredName = vi.fn(() => "Tên gợi nhớ không hợp lệ");
    const groupConversation = {
      id: "group-1",
      type: "group",
      name: "Đội IT - VP TCT",
      participants: directConversation.participants,
    } as unknown as Conversation;

    expect(
      getSearchConversationDisplayName(
        groupConversation,
        "me",
        resolvePreferredName,
      ),
    ).toBe("Đội IT - VP TCT");
    expect(resolvePreferredName).not.toHaveBeenCalled();
  });
});
