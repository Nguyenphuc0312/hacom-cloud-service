import { describe, expect, it, beforeEach } from "vitest";
import { useEnrichedProfileStore } from "./enrichedProfileStore";

describe("enrichedProfileStore cache bounds", () => {
  beforeEach(() => {
    useEnrichedProfileStore.getState().clear();
  });

  it("caps enriched names with LRU eviction", () => {
    for (let index = 0; index < 405; index += 1) {
      useEnrichedProfileStore
        .getState()
        .setEnrichedName(`user-${index}`, `User ${index}`);
    }

    const state = useEnrichedProfileStore.getState();
    expect(Object.keys(state.nameByUserId)).toHaveLength(400);
    expect(state.nameByUserId["user-0"]).toBeUndefined();
    expect(state.nameByUserId["user-404"]).toBe("User 404");
  });

  it("clears names, avatars and LRU metadata", () => {
    useEnrichedProfileStore.getState().setEnrichedName("user-1", "User One");
    useEnrichedProfileStore.getState().setEnrichedAvatar("user-1", "/a/1.png");

    useEnrichedProfileStore.getState().clear();

    expect(useEnrichedProfileStore.getState().nameByUserId).toEqual({});
    expect(useEnrichedProfileStore.getState().avatarByUserId).toEqual({});
    expect(useEnrichedProfileStore.getState().lruUserIds).toEqual([]);
  });

  it("stores an avatar independently of the name", () => {
    useEnrichedProfileStore.getState().setEnrichedAvatar("user-1", "/a/1.png");

    expect(useEnrichedProfileStore.getState().getEnrichedAvatar("user-1")).toBe(
      "/a/1.png",
    );
    expect(useEnrichedProfileStore.getState().nameByUserId["user-1"]).toBeUndefined();
  });

  it("ignores an empty avatar url", () => {
    useEnrichedProfileStore.getState().setEnrichedAvatar("user-1", "");

    expect(useEnrichedProfileStore.getState().avatarByUserId).toEqual({});
    expect(useEnrichedProfileStore.getState().lruUserIds).toEqual([]);
  });

  it("evicts a user's name and avatar together", () => {
    useEnrichedProfileStore.getState().setEnrichedName("user-0", "User 0");
    useEnrichedProfileStore.getState().setEnrichedAvatar("user-0", "/a/0.png");

    // Fill past the cap so user-0 (the LRU head) falls off.
    for (let index = 1; index <= 400; index += 1) {
      useEnrichedProfileStore
        .getState()
        .setEnrichedName(`user-${index}`, `User ${index}`);
    }

    const state = useEnrichedProfileStore.getState();
    expect(state.nameByUserId["user-0"]).toBeUndefined();
    expect(state.avatarByUserId["user-0"]).toBeUndefined();
  });

  it("keeps an entry alive when only its avatar is refreshed", () => {
    useEnrichedProfileStore.getState().setEnrichedName("user-0", "User 0");
    for (let index = 1; index < 400; index += 1) {
      useEnrichedProfileStore
        .getState()
        .setEnrichedName(`user-${index}`, `User ${index}`);
    }

    // Touching user-0 via the avatar setter must move it off the LRU head, so
    // the next insert evicts user-1 instead.
    useEnrichedProfileStore.getState().setEnrichedAvatar("user-0", "/a/0.png");
    useEnrichedProfileStore.getState().setEnrichedName("user-400", "User 400");

    const state = useEnrichedProfileStore.getState();
    expect(state.nameByUserId["user-0"]).toBe("User 0");
    expect(state.avatarByUserId["user-0"]).toBe("/a/0.png");
    expect(state.nameByUserId["user-1"]).toBeUndefined();
  });
});
