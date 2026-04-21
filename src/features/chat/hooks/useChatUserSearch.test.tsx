import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserStatus } from "../../../types";
import { searchUsersUseCase } from "../usecases/searchUsers";
import {
  buildUserSearchSecondaryText,
  isDirectConversationEligible,
  isGroupMemberEligible,
  normalizeSearchUser,
  useChatUserSearch,
} from "./useChatUserSearch";

vi.mock("../usecases/searchUsers", () => ({
  searchUsersUseCase: vi.fn(),
}));

vi.mock("../../../hooks", () => ({
  useDebounce: <T,>(value: T) => value,
}));

const searchUsersUseCaseMock = vi.mocked(searchUsersUseCase);

describe("useChatUserSearch helpers", () => {
  beforeEach(() => {
    searchUsersUseCaseMock.mockReset();
  });

  it("normalizes search users with employee code and friendship status", () => {
    const user = normalizeSearchUser({
      id: "user-1",
      username: "alice",
      fullNameFromHR: "Alice Nguyen",
      employeeCode: "EMP001",
      avatarUrl: "https://example.com/a.png",
      status: UserStatus.ONLINE,
      isFriend: true,
      canAddFriend: false,
      friendshipStatus: "accepted",
    });

    expect(user).toEqual({
      id: "user-1",
      username: "alice",
      displayName: "Alice Nguyen",
      avatarUrl: "https://example.com/a.png",
      status: UserStatus.ONLINE,
      employeeCode: "EMP001",
      isFriend: true,
      canAddFriend: false,
      friendshipStatus: "accepted",
    });
    expect(buildUserSearchSecondaryText(user!)).toBe("@alice / EMP001");
    expect(isDirectConversationEligible(user!)).toBe(true);
    expect(isGroupMemberEligible(user!)).toBe(true);
  });

  it("falls back to non-friend eligibility defaults when friendship fields are missing", () => {
    const user = normalizeSearchUser({
      id: "user-2",
      username: "outsider",
      displayName: "Outsider",
    });

    expect(user).toMatchObject({
      id: "user-2",
      username: "outsider",
      displayName: "Outsider",
      friendshipStatus: "none",
      isFriend: false,
      canAddFriend: true,
    });
    expect(isDirectConversationEligible(user!)).toBe(false);
    expect(isGroupMemberEligible(user!)).toBe(false);
  });

  it("normalizes snake_case friendship fields from search responses", () => {
    const user = normalizeSearchUser({
      id: "user-3",
      username: "linh",
      display_name: "Linh Tran",
      avatar_url: "https://example.com/linh.png",
      employee_code: "EMP003",
      is_friend: true,
      can_add_friend: false,
      friendship_status: "accepted",
    });

    expect(user).toEqual({
      id: "user-3",
      username: "linh",
      displayName: "Linh Tran",
      avatarUrl: "https://example.com/linh.png",
      status: UserStatus.OFFLINE,
      employeeCode: "EMP003",
      isFriend: true,
      canAddFriend: false,
      friendshipStatus: "accepted",
    });
    expect(isGroupMemberEligible(user!)).toBe(true);
  });

  it("debounces search, unwraps rows, and excludes configured user ids", async () => {
    searchUsersUseCaseMock.mockResolvedValue({
      success: true,
      data: [
        {
          id: "user-1",
          username: "alice",
          displayName: "Alice",
          isFriend: true,
          friendshipStatus: "accepted",
        },
        {
          id: "user-2",
          username: "bob",
          displayName: "Bob",
          isFriend: false,
          friendshipStatus: "none",
        },
      ],
    } as never);

    const { result } = renderHook(() =>
      useChatUserSearch(" alice ", {
        enabled: true,
        excludeUserIds: ["user-2"],
      }),
    );

    await waitFor(() => {
      expect(searchUsersUseCaseMock).toHaveBeenCalledTimes(1);
      expect(searchUsersUseCaseMock).toHaveBeenCalledWith(
        "alice",
        1,
        20,
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.results).toHaveLength(1);

    expect(result.current.results[0]).toMatchObject({
      id: "user-1",
      username: "alice",
      displayName: "Alice",
    });
  });
});
