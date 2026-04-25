import { describe, it, expect, beforeEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FriendshipCapabilitiesDto } from "@hacom/chat-shared-types/chat";
import { FriendQrWorkspace } from "./FriendQrWorkspace";

const qrcodeToDataUrlMock = vi.fn(async (value: string, options?: unknown) => {
  void value;
  void options;
  return "data:image/png;base64,mock";
});

vi.mock("qrcode", () => ({
  default: {
    toDataURL: (value: string, options?: unknown) =>
      qrcodeToDataUrlMock(value, options),
  },
}));

const authState = {
  user: {
    id: "me-1",
    username: "me_user",
    firstName: "Me",
    lastName: "User",
    avatar: "https://cdn.example.com/me.png",
    bio: "My bio",
  },
};

vi.mock("../../stores", () => ({
  useAuthStore: (selector: (state: typeof authState) => unknown) =>
    selector(authState),
}));

const applyRelationMock = vi.fn();

vi.mock("../../stores/friendshipStore", () => ({
  useFriendshipStore: {
    getState: () => ({
      applyRelation: applyRelationMock,
    }),
  },
}));

type RelationshipState =
  | { kind: "self"; capabilities: FriendshipCapabilitiesDto }
  | { kind: "not_friend"; capabilities: FriendshipCapabilitiesDto }
  | {
      kind: "outgoing_request";
      requestId: string;
      capabilities: FriendshipCapabilitiesDto;
    }
  | {
      kind: "incoming_request";
      requestId: string;
      capabilities: FriendshipCapabilitiesDto;
    }
  | {
      kind: "friend";
      friendshipId: string;
      capabilities: FriendshipCapabilitiesDto;
    }
  | {
      kind: "blocked";
      friendshipId: string;
      capabilities: FriendshipCapabilitiesDto;
    };

const baseCapabilities = (
  overrides?: Partial<FriendshipCapabilitiesDto>,
): FriendshipCapabilitiesDto => ({
  canSendRequest: false,
  canAccept: false,
  canDecline: false,
  canCancel: false,
  canUnfriend: false,
  canBlock: false,
  canUnblock: false,
  canMessage: false,
  ...overrides,
});

const relationshipByUserId = new Map<string, RelationshipState>();

const sendFriendRequestMock = vi.fn(async () => true);
const acceptFriendRequestMock = vi.fn(async () => true);
const rejectFriendRequestMock = vi.fn(async () => true);
const cancelFriendRequestMock = vi.fn(async () => true);
const blockUserMock = vi.fn(async () => true);
const unblockUserMock = vi.fn(async () => true);

vi.mock("../../hooks/useFriendship", () => ({
  useFriendship: () => ({
    getRelationshipState: (userId: string) =>
      relationshipByUserId.get(userId) || {
        kind: "not_friend",
        capabilities: baseCapabilities({
          canSendRequest: true,
          canBlock: true,
        }),
      },
    sendFriendRequest: sendFriendRequestMock,
    acceptFriendRequest: acceptFriendRequestMock,
    rejectFriendRequest: rejectFriendRequestMock,
    cancelFriendRequest: cancelFriendRequestMock,
    blockUser: blockUserMock,
    unblockUser: unblockUserMock,
  }),
}));

const getMyFriendQrMock = vi.fn();
const resetMyFriendQrMock = vi.fn();
const resolveCodeMock = vi.fn();
const getUserByIdMock = vi.fn();
const createPrivateConversationMock = vi.fn();

vi.mock("../../services/api", () => ({
  friendQrApi: {
    getMyFriendQr: (...args: unknown[]) => getMyFriendQrMock(...args),
    resetMyFriendQr: (...args: unknown[]) => resetMyFriendQrMock(...args),
    resolveCode: (...args: unknown[]) => resolveCodeMock(...args),
  },
  userApi: {
    getUserById: (...args: unknown[]) => getUserByIdMock(...args),
  },
  conversationApi: {
    createPrivateConversation: (...args: unknown[]) =>
      createPrivateConversationMock(...args),
  },
}));

const makeSuccess = <T,>(data: T) => ({
  success: true as const,
  statusCode: 200,
  message: "OK",
  data,
});

const renderWorkspace = (options?: { initialShareCode?: string | null }) => {
  return render(
    <MemoryRouter>
      <FriendQrWorkspace initialShareCode={options?.initialShareCode} />
    </MemoryRouter>,
  );
};

describe("FriendQrWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    relationshipByUserId.clear();

    getMyFriendQrMock.mockResolvedValue(
      makeSuccess({
        shareCode: "share-code-1234567890",
        deepLink: "hacom://friend/profile?code=share-code-1234567890",
        updatedAt: "2026-04-07T08:00:00.000Z",
      }),
    );

    resetMyFriendQrMock.mockResolvedValue(
      makeSuccess({
        shareCode: "share-code-reset-123456",
        deepLink: "hacom://friend/profile?code=share-code-reset-123456",
        updatedAt: "2026-04-07T09:00:00.000Z",
      }),
    );

    resolveCodeMock.mockResolvedValue(
      makeSuccess({
        profile: {
          id: "u-1",
          username: "friend_1",
          displayName: "Friend One",
          avatarUrl: "https://cdn.example.com/friend.png",
        },
        relationship: {
          context: "other",
          friendship: null,
        },
        capabilities: baseCapabilities({ canSendRequest: true }),
        source: "qr",
      }),
    );

    getUserByIdMock.mockResolvedValue(
      makeSuccess({
        id: "u-1",
        username: "friend_1",
        bio: "Bio from user service",
      }),
    );

    createPrivateConversationMock.mockResolvedValue(makeSuccess({ id: "c-1" }));
  });

  it("render QR cua toi", async () => {
    renderWorkspace();

    expect(
      await screen.findByText("share-code-1234567890"),
    ).toBeInTheDocument();
    expect(await screen.findByAltText("friends:tabs.qr")).toBeInTheDocument();
    expect(qrcodeToDataUrlMock).toHaveBeenCalled();
  });

  it("reset QR thanh cong", async () => {
    renderWorkspace();

    await screen.findByText("share-code-1234567890");
    await userEvent.click(
      screen.getByRole("button", { name: "friends:qr.reset" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "friends:qr.resetDialogConfirm" }),
    );

    expect(
      await screen.findByText("share-code-reset-123456"),
    ).toBeInTheDocument();
    expect(screen.getByText("friends:qr.resetNotice")).toBeInTheDocument();
  });

  it("resolve code thanh cong mo mini profile", async () => {
    relationshipByUserId.set("u-1", {
      kind: "not_friend",
      capabilities: baseCapabilities({ canSendRequest: true, canBlock: true }),
    });

    renderWorkspace();

    await userEvent.type(
      screen.getByPlaceholderText("friends:qr.resolvePlaceholder"),
      "share-code-1234567890",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "friends:qr.resolve" }),
    );

    expect(
      await screen.findByText("friends:qr.miniProfileTitle"),
    ).toBeInTheDocument();
    expect(screen.getByText("Friend One")).toBeInTheDocument();
  });

  it("resolve deep link tu route shareCode", async () => {
    relationshipByUserId.set("u-1", {
      kind: "not_friend",
      capabilities: baseCapabilities({ canSendRequest: true, canBlock: true }),
    });

    renderWorkspace({ initialShareCode: "share-code-1234567890" });

    await waitFor(() => {
      expect(resolveCodeMock).toHaveBeenCalledWith("share-code-1234567890");
    });

    expect(
      await screen.findByText("friends:qr.miniProfileTitle"),
    ).toBeInTheDocument();
    expect(screen.getByText("Friend One")).toBeInTheDocument();
  });

  it("self QR hien self state", async () => {
    resolveCodeMock.mockResolvedValueOnce(
      makeSuccess({
        profile: {
          id: "me-1",
          username: "me_user",
          displayName: "Me User",
          avatarUrl: "https://cdn.example.com/me.png",
        },
        relationship: {
          context: "self",
          friendship: null,
        },
        capabilities: baseCapabilities(),
        source: "qr",
      }),
    );

    relationshipByUserId.set("me-1", {
      kind: "self",
      capabilities: baseCapabilities(),
    });

    renderWorkspace();

    await userEvent.type(
      screen.getByPlaceholderText("friends:qr.resolvePlaceholder"),
      "self-code-1234567890",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "friends:qr.resolve" }),
    );

    expect(
      await screen.findByText("friends:qr.selfProfile"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "friends:addFriend" }),
    ).not.toBeInTheDocument();
  });

  it("add friend tu mini profile", async () => {
    relationshipByUserId.set("u-1", {
      kind: "not_friend",
      capabilities: baseCapabilities({ canSendRequest: true }),
    });

    renderWorkspace();

    await userEvent.type(
      screen.getByPlaceholderText("friends:qr.resolvePlaceholder"),
      "share-code-1234567890",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "friends:qr.resolve" }),
    );
    await screen.findByText("friends:qr.miniProfileTitle");

    await userEvent.click(
      screen.getByRole("button", { name: "friends:addFriend" }),
    );

    await waitFor(() => {
      expect(sendFriendRequestMock).toHaveBeenCalledWith("u-1");
    });
  });

  it("mo deep link code cu sau reset fail dung", async () => {
    resolveCodeMock.mockRejectedValueOnce(
      new Error("Friend QR code is invalid or expired"),
    );

    renderWorkspace({ initialShareCode: "old-reset-code-12345678" });

    expect(
      await screen.findByText("friends:qr.invalidCode"),
    ).toBeInTheDocument();
  });
});
