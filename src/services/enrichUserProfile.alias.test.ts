import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loadUserProfile: vi.fn() }));

vi.mock("./userBatchLoader", () => ({ loadUserProfile: mocks.loadUserProfile }));

import { enrichUserProfile } from "./enrichUserProfile";
import { useEnrichedProfileStore } from "../stores/enrichedProfileStore";

describe("enrichUserProfile vs contact alias", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEnrichedProfileStore.getState().clear();
  });

  it("does not overwrite a user-set alias with the real name", async () => {
    // Alias ("tên gợi nhớ") lands first, e.g. from fetchFriends / setLocalAlias.
    useEnrichedProfileStore.getState().setEnrichedName("u1", "Sếp Nam");

    mocks.loadUserProfile.mockImplementation(async (id: string) =>
      id === "u1"
        ? { id, username: id, displayName: "Nguyễn Thế Huy Hoàng", avatarUrl: null }
        : null,
    );

    enrichUserProfile("u1");
    // Cho microtask của loadUserProfile chạy xong rồi mới kiểm tra.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useEnrichedProfileStore.getState().nameByUserId["u1"]).toBe("Sếp Nam");
  });

  it("still fills in the real name when no alias is set", async () => {
    mocks.loadUserProfile.mockImplementation(async (id: string) =>
      id === "u2"
        ? { id, username: id, displayName: "Trần Vũ Đại", avatarUrl: null }
        : null,
    );

    enrichUserProfile("u2");
    await vi.waitFor(() =>
      expect(useEnrichedProfileStore.getState().nameByUserId["u2"]).toBe(
        "Trần Vũ Đại",
      ),
    );
  });
});
