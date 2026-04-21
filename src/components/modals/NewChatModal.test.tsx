import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewChatModal } from "./NewChatModal";

const useChatUserSearchMock = vi.fn();

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) =>
        (options?.defaultValue as string) || key,
    }),
  };
});

vi.mock("../../features/chat/hooks/useChatUserSearch", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../features/chat/hooks/useChatUserSearch")>();
  return {
    ...actual,
    useChatUserSearch: (...args: unknown[]) => useChatUserSearchMock(...args),
  };
});

vi.mock("../../features/chat/usecases/sendFriendRequest", () => ({
  sendFriendRequestUseCase: vi.fn(),
}));

describe("NewChatModal", () => {
  beforeEach(() => {
    useChatUserSearchMock.mockReset();
    useChatUserSearchMock.mockReturnValue({
      results: [
        {
          id: "user-1",
          username: "alice",
          displayName: "Alice Nguyen",
          avatarUrl: null,
          status: "online",
          employeeCode: "EMP001",
          departmentName: "Engineering",
          unitCode: "ENG",
          isFriend: true,
          canAddFriend: false,
          friendshipStatus: "accepted",
        },
      ],
      isLoading: false,
      errorMessage: null,
      debouncedQuery: "",
    });
  });

  it("keeps a stable desktop width and lets group selection toggle from the trailing control", () => {
    render(
      <NewChatModal
        isOpen
        onClose={vi.fn()}
        onStartChat={vi.fn().mockResolvedValue(undefined)}
        onCreateGroup={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByRole("dialog")).toHaveClass("max-w-[42rem]");

    fireEvent.click(
      screen.getByRole("button", {
        name: "profile:newChatModal.createGroup",
      }),
    );

    const selectButton = screen.getByRole("button", {
      name: "Select member",
    });
    fireEvent.click(selectButton);

    expect(
      screen.getByRole("button", {
        name: "Remove member",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Alice Nguyen").length).toBeGreaterThan(1);
    expect(screen.getByText("@alice / EMP001 / Engineering / ENG")).toBeInTheDocument();
  });
});
