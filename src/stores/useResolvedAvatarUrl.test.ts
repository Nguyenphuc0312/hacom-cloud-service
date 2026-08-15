import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ getFriends: vi.fn() }));

vi.mock("../services/api", () => ({
  FRIENDS_PAGE_SIZE: 20,
  friendshipApi: { getFriends: mocks.getFriends },
}));

vi.mock("../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { useResolvedAvatarUrl } from "./useResolvedDisplayName";
import { useEnrichedProfileStore } from "./enrichedProfileStore";
import { useFriendshipStore } from "./friendshipStore";

const USER = "user-1";

/**
 * Khoá lại thứ tự ưu tiên avatar: `enriched → bạn bè → fallback`.
 *
 * Vì sao NGƯỢC với tên: `fallback` ở list "Người gửi" là `senderAvatarUrl` lấy
 * từ `sender_snapshot` của message — chữ ký presigned ĐÔNG CỨNG lúc gửi tin,
 * hết hạn sau 15 phút và không bao giờ được ký lại. Đo trên máy thật (nhóm
 * "Core Hacom"): cả 4 sender đều có url, cả 4 đều trả 403; url từ
 * `POST /users/batch` cùng lúc đó trả 200. Đảo lại thứ tự này là tái hiện đúng
 * bug avatar không hiện.
 */
describe("useResolvedAvatarUrl priority", () => {
  beforeEach(() => {
    useEnrichedProfileStore.getState().clear();
    useFriendshipStore.setState({ friendByUserId: {} });
  });

  const seedFriendAvatar = (avatar: string) => {
    useFriendshipStore.setState({
      friendByUserId: {
        [USER]: { id: USER, avatar } as never,
      },
    });
  };

  it("prefers the freshly signed enriched url over the item snapshot", () => {
    useEnrichedProfileStore.getState().setEnrichedAvatar(USER, "/fresh.png");

    const { result } = renderHook(() =>
      useResolvedAvatarUrl(USER, "/stale-snapshot.png"),
    );

    expect(result.current).toBe("/fresh.png");
  });

  it("prefers the friend record over the item snapshot", () => {
    seedFriendAvatar("/friend.png");

    const { result } = renderHook(() =>
      useResolvedAvatarUrl(USER, "/stale-snapshot.png"),
    );

    expect(result.current).toBe("/friend.png");
  });

  it("falls back to the item snapshot when nothing fresher exists", () => {
    const { result } = renderHook(() =>
      useResolvedAvatarUrl(USER, "/stale-snapshot.png"),
    );

    expect(result.current).toBe("/stale-snapshot.png");
  });

  it("ignores an enriched url past the presign TTL", () => {
    vi.useFakeTimers();
    try {
      useEnrichedProfileStore.getState().setEnrichedAvatar(USER, "/fresh.png");
      vi.advanceTimersByTime(15 * 60 * 1000);

      const { result } = renderHook(() => useResolvedAvatarUrl(USER, null));

      expect(result.current).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns null when there is no avatar anywhere", () => {
    const { result } = renderHook(() => useResolvedAvatarUrl(USER, null));

    expect(result.current).toBeNull();
  });

  it("treats a blank snapshot url as absent", () => {
    const { result } = renderHook(() => useResolvedAvatarUrl(USER, "   "));

    expect(result.current).toBeNull();
  });
});
