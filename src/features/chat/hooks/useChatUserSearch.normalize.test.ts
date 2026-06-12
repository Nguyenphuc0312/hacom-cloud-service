import { describe, expect, it } from "vitest";

import { normalizeSearchUser } from "./useChatUserSearch";

describe("normalizeSearchUser friendship contract", () => {
  it("forces accepted when isFriend=true and disables add friend", () => {
    expect(
      normalizeSearchUser({
        id: "u1",
        username: "alice",
        displayName: "Alice",
        isFriend: true,
        canAddFriend: true,
        friendshipStatus: "none",
      }),
    ).toEqual(
      expect.objectContaining({
        isFriend: true,
        canAddFriend: false,
        friendshipStatus: "accepted",
      }),
    );
  });

  it("does not allow add friend for pending search rows", () => {
    expect(
      normalizeSearchUser({
        id: "u1",
        username: "alice",
        displayName: "Alice",
        isFriend: false,
        canAddFriend: true,
        friendshipStatus: "pending",
      }),
    ).toEqual(
      expect.objectContaining({
        isFriend: false,
        canAddFriend: false,
        friendshipStatus: "pending",
      }),
    );
  });
});
