import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loadUserProfile: vi.fn() }));

vi.mock("./userBatchLoader", () => ({ loadUserProfile: mocks.loadUserProfile }));

import { enrichUserProfile, resetEnrichThrottle } from "./enrichUserProfile";
import { useEnrichedProfileStore } from "../stores/enrichedProfileStore";
import { useFriendshipStore } from "../stores/friendshipStore";

/** Register an alias the way friendshipStore does (the authoritative source). */
const setAlias = (userId: string, alias: string) => {
  useFriendshipStore.setState({
    friendByUserId: {
      ...useFriendshipStore.getState().friendByUserId,
      [userId]: { alias } as never,
    },
  });
  useEnrichedProfileStore.getState().setEnrichedName(userId, alias);
};

describe("enrichUserProfile vs contact alias", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEnrichedProfileStore.getState().clear();
    useFriendshipStore.setState({ friendByUserId: {} });
    resetEnrichThrottle();
  });

  it("does not overwrite a user-set alias with the real name", async () => {
    // Alias ("tên gợi nhớ") lands first, e.g. from fetchFriends / setLocalAlias.
    setAlias("u1", "Sếp Nam");

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

  // Regression: the old `isRealName` required a space or a non-ASCII character,
  // so one-word ASCII names were never cached. `@mention` tags in older messages
  // then kept the pre-rename text forever while the member list showed the new
  // name.
  it.each(["Kevin", "David", "Tom", "Lisa"])(
    "caches the one-word ASCII name %s",
    async (name) => {
      mocks.loadUserProfile.mockImplementation(async (id: string) =>
        id === "u3" ? { id, username: "HC987658", displayName: name } : null,
      );

      enrichUserProfile("u3");
      await vi.waitFor(() =>
        expect(useEnrichedProfileStore.getState().nameByUserId["u3"]).toBe(name),
      );
    },
  );

  it.each([
    ["an employee code", "HC888892"],
    ["a system username", "manual000001"],
  ])("never caches %s as a name", async (_label, machineValue) => {
    mocks.loadUserProfile.mockImplementation(async (id: string) =>
      id === "u4"
        ? { id, username: machineValue, displayName: machineValue }
        : null,
    );

    enrichUserProfile("u4");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useEnrichedProfileStore.getState().nameByUserId["u4"]).toBeUndefined();
  });

  it("never caches an email address as a name", async () => {
    mocks.loadUserProfile.mockImplementation(async (id: string) =>
      id === "u5"
        ? { id, username: "u5", displayName: "kevin@hacom.vn" }
        : null,
    );

    enrichUserProfile("u5");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useEnrichedProfileStore.getState().nameByUserId["u5"]).toBeUndefined();
  });

  it("prefers the self-chosen name over the HR name when caching", async () => {
    mocks.loadUserProfile.mockImplementation(async (id: string) =>
      id === "u6"
        ? {
            id,
            username: "HC987658",
            displayName: "Kevin QA 2",
            fullNameFromHr: "Kevin",
          }
        : null,
    );

    enrichUserProfile("u6");
    await vi.waitFor(() =>
      expect(useEnrichedProfileStore.getState().nameByUserId["u6"]).toBe(
        "Kevin QA 2",
      ),
    );
  });
});

describe("enrichUserProfile re-enrichment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEnrichedProfileStore.getState().clear();
    useFriendshipStore.setState({ friendByUserId: {} });
    resetEnrichThrottle();
  });

  it("picks up a rename that happens during the session", async () => {
    // Regression: the old guard ("already in nameByUserId ⇒ never again") froze
    // a name for the whole session, so @mention tags kept the pre-rename text
    // until a full reload.
    mocks.loadUserProfile.mockResolvedValueOnce({
      id: "u7",
      username: "HC987658",
      displayName: "Kevin",
    });
    enrichUserProfile("u7");
    await vi.waitFor(() =>
      expect(useEnrichedProfileStore.getState().nameByUserId["u7"]).toBe("Kevin"),
    );

    // The user renames themselves; the throttle window has elapsed.
    resetEnrichThrottle();
    mocks.loadUserProfile.mockResolvedValueOnce({
      id: "u7",
      username: "HC987658",
      displayName: "Kevin QA 2",
    });
    enrichUserProfile("u7");

    await vi.waitFor(() =>
      expect(useEnrichedProfileStore.getState().nameByUserId["u7"]).toBe(
        "Kevin QA 2",
      ),
    );
  });

  it("throttles repeated calls so render loops do not spam the loader", async () => {
    mocks.loadUserProfile.mockResolvedValue({
      id: "u8",
      username: "u8",
      displayName: "Trần Vũ Đại",
    });

    // A render effect calls this for every mentioned user on every re-render.
    for (let i = 0; i < 25; i++) enrichUserProfile("u8");
    await vi.waitFor(() =>
      expect(useEnrichedProfileStore.getState().nameByUserId["u8"]).toBe(
        "Trần Vũ Đại",
      ),
    );

    expect(mocks.loadUserProfile).toHaveBeenCalledTimes(1);
  });

  it("never lets a re-enrich overwrite the viewer's alias", async () => {
    // The old guard protected the alias only as a side effect of never running
    // twice. Now that re-enrich is allowed, the alias must be checked explicitly.
    setAlias("u9", "Sếp Nam");
    mocks.loadUserProfile.mockResolvedValue({
      id: "u9",
      username: "u9",
      displayName: "Nguyễn Thế Huy Hoàng",
    });

    enrichUserProfile("u9");
    await new Promise((resolve) => setTimeout(resolve, 0));
    resetEnrichThrottle();
    enrichUserProfile("u9");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useEnrichedProfileStore.getState().nameByUserId["u9"]).toBe("Sếp Nam");
  });
});
