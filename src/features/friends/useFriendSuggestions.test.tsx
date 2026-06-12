import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FriendSuggestionDto } from "@hacom/chat-shared-types/chat";

import { useFriendSuggestions } from "./useFriendSuggestions";
import { friendshipApi } from "../../services/api";

vi.mock("../../services/api", () => ({
  FRIEND_SUGGESTIONS_PAGE_SIZE: 20,
  friendshipApi: {
    getSuggestions: vi.fn(),
  },
}));

const getSuggestionsMock = vi.mocked(friendshipApi.getSuggestions);

const buildSuggestion = (id: string): FriendSuggestionDto => ({
  id,
  username: `user-${id}`,
  displayName: `User ${id}`,
  fullName: `User ${id}`,
  avatarUrl: null,
  status: "online",
  employeeCode: null,
  departmentName: "Phòng Kế toán",
  unitCode: "DV001",
  unitName: "Đơn vị A",
  title: null,
  isFriend: false,
  canAddFriend: true,
  friendshipStatus: "none",
  capabilities: {
    canSendRequest: true,
    canAccept: false,
    canDecline: false,
    canCancel: false,
    canUnfriend: false,
    canBlock: true,
    canUnblock: false,
    canMessage: false,
  },
  suggestion: {
    source: "same_group",
    score: 95,
    reasons: [{ type: "same_group", label: "Cùng nhóm Dự án ERP" }],
    mutualGroupsCount: 1,
    mutualGroupNames: ["Dự án ERP"],
    sameDepartment: true,
    sameUnit: true,
  },
});

const buildPage = (
  items: FriendSuggestionDto[],
  meta: { page: number; hasNext: boolean; total: number },
) => ({
  success: true as const,
  statusCode: 200,
  message: "ok",
  data: items,
  meta: {
    page: meta.page,
    limit: 20,
    total: meta.total,
    totalPages: Math.ceil(meta.total / 20),
    hasNext: meta.hasNext,
    hasPrev: meta.page > 1,
  },
});

describe("useFriendSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads page 1 on mount and exposes pagination state", async () => {
    getSuggestionsMock.mockResolvedValue(
      buildPage([buildSuggestion("a"), buildSuggestion("b")], {
        page: 1,
        hasNext: true,
        total: 22,
      }),
    );

    const { result } = renderHook(() => useFriendSuggestions());

    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    expect(result.current.suggestions.map((item) => item.id)).toEqual([
      "a",
      "b",
    ]);
    expect(result.current.hasNext).toBe(true);
    expect(result.current.total).toBe(22);
    expect(result.current.error).toBeNull();
    expect(getSuggestionsMock).toHaveBeenCalledTimes(1);
    expect(getSuggestionsMock).toHaveBeenCalledWith(
      1,
      20,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("does not fetch while disabled", async () => {
    const { result } = renderHook(() =>
      useFriendSuggestions({ enabled: false }),
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(getSuggestionsMock).not.toHaveBeenCalled();
    expect(result.current.suggestions).toEqual([]);
  });

  it("appends the next page without duplicating ids", async () => {
    getSuggestionsMock
      .mockResolvedValueOnce(
        buildPage([buildSuggestion("a"), buildSuggestion("b")], {
          page: 1,
          hasNext: true,
          total: 3,
        }),
      )
      .mockResolvedValueOnce(
        buildPage([buildSuggestion("b"), buildSuggestion("c")], {
          page: 2,
          hasNext: false,
          total: 3,
        }),
      );

    const { result } = renderHook(() => useFriendSuggestions());
    await waitFor(() => expect(result.current.hasLoaded).toBe(true));

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.suggestions.map((item) => item.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(result.current.hasNext).toBe(false);
  });

  it("ignores loadMore when hasNext is false", async () => {
    getSuggestionsMock.mockResolvedValue(
      buildPage([buildSuggestion("a")], { page: 1, hasNext: false, total: 1 }),
    );

    const { result } = renderHook(() => useFriendSuggestions());
    await waitFor(() => expect(result.current.hasLoaded).toBe(true));

    await act(async () => {
      await result.current.loadMore();
    });

    expect(getSuggestionsMock).toHaveBeenCalledTimes(1);
  });

  it("does not fire parallel requests when loadMore is called twice", async () => {
    let resolveSecond: ((value: unknown) => void) | null = null;

    getSuggestionsMock
      .mockResolvedValueOnce(
        buildPage([buildSuggestion("a")], { page: 1, hasNext: true, total: 21 }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }) as never,
      );

    const { result } = renderHook(() => useFriendSuggestions());
    await waitFor(() => expect(result.current.hasLoaded).toBe(true));

    let first: Promise<void> | null = null;
    act(() => {
      first = result.current.loadMore();
      void result.current.loadMore();
    });

    await act(async () => {
      resolveSecond?.(
        buildPage([buildSuggestion("b")], { page: 2, hasNext: false, total: 21 }),
      );
      await first;
    });

    expect(getSuggestionsMock).toHaveBeenCalledTimes(2);
    expect(result.current.suggestions.map((item) => item.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("surfaces an initial load error and recovers on reload", async () => {
    getSuggestionsMock
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(
        buildPage([buildSuggestion("a")], { page: 1, hasNext: false, total: 1 }),
      );

    const { result } = renderHook(() => useFriendSuggestions());
    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    expect(result.current.error).not.toBeNull();
    expect(result.current.suggestions).toEqual([]);

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.suggestions.map((item) => item.id)).toEqual(["a"]);
  });

  it("keeps loaded items and sets loadMoreError when the next page fails", async () => {
    getSuggestionsMock
      .mockResolvedValueOnce(
        buildPage([buildSuggestion("a")], { page: 1, hasNext: true, total: 21 }),
      )
      .mockRejectedValueOnce(new Error("boom"));

    const { result } = renderHook(() => useFriendSuggestions());
    await waitFor(() => expect(result.current.hasLoaded).toBe(true));

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.loadMoreError).not.toBeNull();
    expect(result.current.suggestions.map((item) => item.id)).toEqual(["a"]);
    expect(result.current.error).toBeNull();
  });

  it("removes a suggestion locally by user id", async () => {
    getSuggestionsMock.mockResolvedValue(
      buildPage([buildSuggestion("a"), buildSuggestion("b")], {
        page: 1,
        hasNext: false,
        total: 2,
      }),
    );

    const { result } = renderHook(() => useFriendSuggestions());
    await waitFor(() => expect(result.current.hasLoaded).toBe(true));

    act(() => {
      result.current.removeSuggestion("a");
    });

    expect(result.current.suggestions.map((item) => item.id)).toEqual(["b"]);
  });
});
