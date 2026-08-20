import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserProfile } from "./UserProfile";

const mocks = vi.hoisted(() => ({
  setAlias: vi.fn(),
  setLocalAlias: vi.fn(),
  refreshDirectory: vi.fn(),
  refreshProfile: vi.fn().mockResolvedValue(undefined),
  sendMessage: vi.fn(),
  navigate: vi.fn(),
}));

const relationship = (userId: string) => ({
  kind: "friend" as const,
  friendshipId: `friendship-${userId}`,
  capabilities: {
    canSendRequest: false,
    canAccept: false,
    canDecline: false,
    canCancel: false,
    canUnfriend: true,
    canBlock: true,
    canUnblock: false,
    canMessage: true,
  },
});

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: vi.fn() },
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "friends:alias.editTitle": "Đặt tên gợi nhớ",
        "friends:alias.placeholder": "Nhập tên gợi nhớ...",
        "friends:alias.saveFailed": "Không thể lưu tên gợi nhớ",
        "common:actions.save": "Lưu",
        "common:actions.cancel": "Hủy",
        "common:actions.close": "Đóng",
      })[key] ?? key,
  }),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("../../stores", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: null, refreshProfile: mocks.refreshProfile }),
  useChatStore: (selector: (state: unknown) => unknown) =>
    selector({
      conversationById: {},
      conversations: [],
      updateConversation: vi.fn(),
      addConversation: vi.fn(),
      removeConversation: vi.fn(),
      selectConversation: vi.fn(),
    }),
  usePresenceStore: (selector: (state: unknown) => unknown) =>
    selector({ presenceMap: {} }),
  resolveLivePresenceStatus: () => "offline",
}));

vi.mock("../../stores/friendshipStore", () => {
  const useFriendshipStore = (selector: (state: unknown) => unknown) =>
    selector({ friendByUserId: {} });
  useFriendshipStore.getState = () => ({ setLocalAlias: mocks.setLocalAlias });
  return { useFriendshipStore };
});

vi.mock("../../features/profile/useMyProfile", () => ({
  useMyProfile: () => ({ displayName: "" }),
}));

vi.mock("../../features/api/chatApi", () => ({
  useGetUserProfileQuery: () => ({ data: undefined, isLoading: false }),
  useSendMessageMutation: () => [mocks.sendMessage],
}));

vi.mock("../../hooks/useFriendship", () => ({
  useFriendship: () => ({
    refreshDirectory: mocks.refreshDirectory,
    getRelationshipState: (userId: string) => relationship(userId),
    sendFriendRequest: vi.fn(),
    acceptFriendRequest: vi.fn(),
    rejectFriendRequest: vi.fn(),
    cancelFriendRequest: vi.fn(),
    removeFriend: vi.fn(),
  }),
}));

vi.mock("../../hooks/usePresence", () => ({ usePresence: vi.fn() }));

vi.mock("../../services/api", () => ({
  conversationApi: {},
  contactApi: {},
  fileApi: {},
  groupApi: {},
  messageApi: { searchMessages: vi.fn().mockResolvedValue({}) },
  userApi: {},
  friendshipApi: { setAlias: mocks.setAlias },
}));

vi.mock("../../services/enrichUserProfile", () => ({
  enrichUserProfile: vi.fn(),
}));

vi.mock("../../features/chat/hooks/useChatUserSearch", () => ({
  useChatUserSearch: () => ({
    results: [],
    isLoading: false,
    errorMessage: null,
    debouncedQuery: "",
  }),
  useFriendSuggestions: () => ({ suggestions: [], isLoading: false }),
  isGroupMemberEligible: () => true,
}));

vi.mock("../common/Avatar", () => ({
  Avatar: ({ alt }: { alt: string }) => <div data-testid="avatar" aria-label={alt} />,
}));

vi.mock("../ui", () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
  ConfirmDialog: () => null,
  DirectorySkeleton: () => null,
  Modal: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
  PanelSection: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  ProfileSkeleton: () => null,
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("./shared-resources/SharedResourcesPreview", () => ({
  SharedResourcesPreview: () => null,
}));

vi.mock("./shared-resources/SharedContentModal", () => ({
  SharedContentPanel: () => null,
}));

vi.mock("../../features/chat/components/ReminderCreateDialog", () => ({
  ReminderCreateDialog: () => null,
}));

const renderDirectProfile = (userId: string) =>
  render(
    <UserProfile
      userId={userId}
      currentUserId="viewer"
      conversationId={`conversation-${userId}`}
      conversationContext="direct"
      initialUser={{
        id: userId,
        username: userId,
        displayName: userId === "a" ? "Người A" : "Người B",
      }}
      onClose={vi.fn()}
    />,
  );

describe("UserProfile contact alias", () => {
  beforeEach(() => {
    mocks.setAlias.mockReset();
    mocks.setAlias.mockResolvedValue({});
    mocks.setLocalAlias.mockReset();
    mocks.refreshDirectory.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
  });

  it("opens a working alias editor from the direct-chat information panel", async () => {
    const user = userEvent.setup();
    renderDirectProfile("a");

    await user.click(
      screen.getByRole("button", { name: "Đặt tên gợi nhớ" }),
    );

    const input = screen.getByRole("textbox", { name: "Đặt tên gợi nhớ" });
    expect(input).toHaveValue("Người A");

    await user.clear(input);
    await user.type(input, "Sếp A");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(mocks.setAlias).toHaveBeenCalledWith("friendship-a", "Sếp A");
      expect(mocks.setLocalAlias).toHaveBeenCalledWith("a", "Sếp A");
    });
  });

  it("clears an alias by sending null from the direct-chat editor", async () => {
    const user = userEvent.setup();
    renderDirectProfile("a");

    await user.click(
      screen.getByRole("button", { name: "Đặt tên gợi nhớ" }),
    );
    await user.clear(
      screen.getByRole("textbox", { name: "Đặt tên gợi nhớ" }),
    );
    await user.click(screen.getByRole("button", { name: "Lưu" }));

    await waitFor(() => {
      expect(mocks.setAlias).toHaveBeenCalledWith("friendship-a", null);
      expect(mocks.setLocalAlias).toHaveBeenCalledWith("a", null);
    });
  });

  it("keeps the draft open if saving the alias fails", async () => {
    const user = userEvent.setup();
    mocks.setAlias.mockRejectedValueOnce(new Error("network unavailable"));
    renderDirectProfile("a");

    await user.click(
      screen.getByRole("button", { name: "Đặt tên gợi nhớ" }),
    );
    const input = screen.getByRole("textbox", { name: "Đặt tên gợi nhớ" });
    await user.clear(input);
    await user.type(input, "Sếp A");
    await user.click(screen.getByRole("button", { name: "Lưu" }));

    await waitFor(() => {
      expect(mocks.setAlias).toHaveBeenCalledWith("friendship-a", "Sếp A");
    });
    expect(input).toHaveValue("Sếp A");
    expect(mocks.setLocalAlias).not.toHaveBeenCalled();
  });

  it("never carries one contact's draft into another contact on the same mounted profile", async () => {
    const user = userEvent.setup();
    const { rerender } = renderDirectProfile("a");

    await user.click(
      screen.getByRole("button", { name: "Đặt tên gợi nhớ" }),
    );
    const firstInput = screen.getByRole("textbox", {
      name: "Đặt tên gợi nhớ",
    });
    await user.clear(firstInput);
    await user.type(firstInput, "Bản nháp của A");

    rerender(
      <UserProfile
        userId="b"
        currentUserId="viewer"
        conversationId="conversation-b"
        conversationContext="direct"
        initialUser={{ id: "b", username: "b", displayName: "Người B" }}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("textbox", { name: "Đặt tên gợi nhớ" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Đặt tên gợi nhớ" }),
    );
    const secondInput = screen.getByRole("textbox", {
      name: "Đặt tên gợi nhớ",
    });
    expect(secondInput).toHaveValue("Người B");

    await user.clear(secondInput);
    await user.type(secondInput, "Sếp B");
    await user.click(screen.getByRole("button", { name: "Lưu" }));

    await waitFor(() => {
      expect(mocks.setAlias).toHaveBeenCalledWith("friendship-b", "Sếp B");
    });
    expect(mocks.setAlias).not.toHaveBeenCalledWith(
      "friendship-b",
      "Bản nháp của A",
    );
  });
});
