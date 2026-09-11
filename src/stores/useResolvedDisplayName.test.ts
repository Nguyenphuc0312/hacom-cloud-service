import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("../services/api", () => ({
  FRIENDS_PAGE_SIZE: 20,
  friendshipApi: { getFriends: vi.fn() },
}));

vi.mock("../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { useResolvedDisplayName } from "./useResolvedDisplayName";
import { useEnrichedProfileStore } from "./enrichedProfileStore";
import { useFriendshipStore } from "./friendshipStore";
import type { FriendRecord } from "./friendshipStore";

const friend = (id: string, alias: string | null) =>
  ({ id, alias }) as FriendRecord;

describe("useResolvedDisplayName", () => {
  beforeEach(() => {
    useEnrichedProfileStore.getState().clear();
    useFriendshipStore.setState({ friendByUserId: {} });
  });

  it("prefers the alias over the enriched real name", () => {
    // Đây là ca hỏng thật: enrichUserProfile ghi TÊN THẬT vào cùng map mà alias
    // dùng, nên nếu chỉ đọc nameByUserId thì tên thật sẽ đè mất tên gợi nhớ.
    useEnrichedProfileStore.getState().setEnrichedName("u1", "Nguyễn Thế Huy Hoàng");
    useFriendshipStore.setState({ friendByUserId: { u1: friend("u1", "Sếp Hoàng") } });

    const { result } = renderHook(() => useResolvedDisplayName("u1", "fallback"));
    expect(result.current).toBe("Sếp Hoàng");
  });

  it("falls back to the enriched name when no alias is set", () => {
    useEnrichedProfileStore.getState().setEnrichedName("u2", "Trần Vũ Đại");
    useFriendshipStore.setState({ friendByUserId: { u2: friend("u2", null) } });

    const { result } = renderHook(() => useResolvedDisplayName("u2", "fallback"));
    expect(result.current).toBe("Trần Vũ Đại");
  });

  it("uses the unique friend name when the mention ID differs from the friendship ID", () => {
    useFriendshipStore.setState({
      friendByUserId: {
        friendId: { ...friend("friendId", "Nguyễn Minh Quang"), displayName: "VPTCT-Nguyễn Minh Quang" },
      },
    });

    const { result } = renderHook(() =>
      useResolvedDisplayName("message-mention-id", "VPTCT-Nguyễn Minh Quang"),
    );
    expect(result.current).toBe("Nguyễn Minh Quang");
  });

  it("falls back to the caller's name when the user is unknown", () => {
    const { result } = renderHook(() => useResolvedDisplayName("u3", "Người lạ"));
    expect(result.current).toBe("Người lạ");
  });

  it("returns the fallback when userId is undefined", () => {
    const { result } = renderHook(() =>
      useResolvedDisplayName(undefined, "Người lạ"),
    );
    expect(result.current).toBe("Người lạ");
  });
});
