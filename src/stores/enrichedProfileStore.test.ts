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

  it("clears names and LRU metadata", () => {
    useEnrichedProfileStore.getState().setEnrichedName("user-1", "User One");

    useEnrichedProfileStore.getState().clear();

    expect(useEnrichedProfileStore.getState().nameByUserId).toEqual({});
    expect(useEnrichedProfileStore.getState().lruUserIds).toEqual([]);
  });
});
