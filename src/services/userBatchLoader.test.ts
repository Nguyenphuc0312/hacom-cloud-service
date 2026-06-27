import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock the API layer so the loader never hits the network.
const getUsersByIds = vi.fn();
const getUserById = vi.fn();
vi.mock("./api", () => ({
  userApi: {
    getUsersByIds: (ids: string[]) => getUsersByIds(ids),
    getUserById: (id: string) => getUserById(id),
  },
}));

import {
  loadUserProfile,
  loadUserProfiles,
  primeUserProfileCache,
  getCachedUserProfileSummary,
  invalidateUserProfileSummary,
  __resetUserBatchLoaderForTests,
} from "./userBatchLoader";

const summary = (id: string) => ({ id, displayName: `User ${id}` });

describe("userBatchLoader", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getUsersByIds.mockReset();
    getUserById.mockReset();
    __resetUserBatchLoaderForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces many loadUserProfile calls in one window into a single request", async () => {
    getUsersByIds.mockResolvedValue({ a: summary("a"), b: summary("b"), c: summary("c") });

    const p1 = loadUserProfile("a");
    const p2 = loadUserProfile("b");
    const p3 = loadUserProfile("c");

    await vi.advanceTimersByTimeAsync(70);
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(getUsersByIds).toHaveBeenCalledTimes(1);
    expect(getUsersByIds).toHaveBeenCalledWith(["a", "b", "c"]);
    expect(r1).toEqual(summary("a"));
    expect(r2).toEqual(summary("b"));
    expect(r3).toEqual(summary("c"));
  });

  it("dedupes concurrent calls for the same id (shared promise, one request)", async () => {
    getUsersByIds.mockResolvedValue({ a: summary("a") });

    const p1 = loadUserProfile("a");
    const p2 = loadUserProfile("a");

    await vi.advanceTimersByTimeAsync(70);
    await Promise.all([p1, p2]);

    expect(getUsersByIds).toHaveBeenCalledTimes(1);
    expect(getUsersByIds.mock.calls[0][0]).toEqual(["a"]);
  });

  it("serves fresh ids from cache without a second request", async () => {
    getUsersByIds.mockResolvedValue({ a: summary("a") });

    const first = loadUserProfile("a");
    await vi.advanceTimersByTimeAsync(70);
    await first;

    const second = await loadUserProfile("a");
    expect(second).toEqual(summary("a"));
    expect(getUsersByIds).toHaveBeenCalledTimes(1);
    expect(getCachedUserProfileSummary("a")).toEqual(summary("a"));
  });

  it("resolves null for an unresolved id (partial failure) without failing others", async () => {
    getUsersByIds.mockResolvedValue({ a: summary("a"), b: null });

    const pa = loadUserProfile("a");
    const pb = loadUserProfile("b");
    await vi.advanceTimersByTimeAsync(70);

    expect(await pa).toEqual(summary("a"));
    expect(await pb).toBeNull();
  });

  it("loadUserProfiles resolves a full map with a single request", async () => {
    getUsersByIds.mockResolvedValue({ x: summary("x"), y: summary("y") });

    const promise = loadUserProfiles(["x", "y", "x"]);
    await vi.advanceTimersByTimeAsync(70);
    const map = await promise;

    expect(getUsersByIds).toHaveBeenCalledTimes(1);
    expect(map).toEqual({ x: summary("x"), y: summary("y") });
  });

  it("does not negative-cache a transient batch failure (next call retries)", async () => {
    // First flush rejects; fallback (DEV) also fails -> promise resolves null,
    // and the id must NOT be cached so a later call tries again.
    getUsersByIds.mockRejectedValueOnce(new Error("network"));
    getUserById.mockRejectedValue(new Error("network"));

    const map1 = await (async () => {
      const p = loadUserProfiles(["z"]);
      await vi.advanceTimersByTimeAsync(70);
      return p;
    })();
    expect(map1.z).toBeNull();
    expect(getCachedUserProfileSummary("z")).toBeUndefined();

    // Now succeed.
    getUsersByIds.mockResolvedValueOnce({ z: summary("z") });
    const p2 = loadUserProfile("z");
    await vi.advanceTimersByTimeAsync(70);
    expect(await p2).toEqual(summary("z"));
  });

  it("primeUserProfileCache seeds the cache so no request is made", async () => {
    primeUserProfileCache({ seeded: summary("seeded") });

    const result = await loadUserProfile("seeded");
    expect(result).toEqual(summary("seeded"));
    expect(getUsersByIds).not.toHaveBeenCalled();
  });

  it("invalidates one cached summary so a profile update can rebuild from /users/batch", async () => {
    primeUserProfileCache({ changed: summary("changed") });
    expect(await loadUserProfile("changed")).toEqual(summary("changed"));

    invalidateUserProfileSummary("changed");
    getUsersByIds.mockResolvedValueOnce({
      changed: {
        ...summary("changed"),
        department: "New Dept",
        position: "New Title",
        employmentStatus: "ACTIVE",
      },
    });

    const result = loadUserProfile("changed");
    await vi.advanceTimersByTimeAsync(70);

    expect(await result).toMatchObject({
      id: "changed",
      department: "New Dept",
      position: "New Title",
      employmentStatus: "ACTIVE",
    });
    expect(getUsersByIds).toHaveBeenCalledWith(["changed"]);
  });

  it("chunks > MAX_FLUSH_BATCH (50) ids into multiple batches", async () => {
    getUsersByIds.mockImplementation(async (ids: string[]) =>
      Object.fromEntries(ids.map((id) => [id, summary(id)])),
    );

    const ids = Array.from({ length: 120 }, (_, i) => `u${i}`);
    const promise = loadUserProfiles(ids);
    await vi.advanceTimersByTimeAsync(70);
    const map = await promise;

    // 120 ids -> slices of 50/50/20 -> 3 batch requests.
    expect(getUsersByIds).toHaveBeenCalledTimes(3);
    expect(Object.keys(map)).toHaveLength(120);
  });

  it("on 429 honors Retry-After (cooldown cache) and never falls back per-id", async () => {
    getUsersByIds.mockRejectedValueOnce({
      response: { status: 429, headers: { "retry-after": "1" } },
    });

    const p = loadUserProfile("r");
    await vi.advanceTimersByTimeAsync(70);
    expect(await p).toBeNull();

    // No per-id storm.
    expect(getUserById).not.toHaveBeenCalled();
    // Cooldown is cached (null is a cache HIT, not undefined) so re-renders during
    // the window do not re-queue a request.
    expect(getCachedUserProfileSummary("r")).toBeNull();

    const p2 = await loadUserProfile("r");
    expect(p2).toBeNull();
    expect(getUsersByIds).toHaveBeenCalledTimes(1);
  });
});
