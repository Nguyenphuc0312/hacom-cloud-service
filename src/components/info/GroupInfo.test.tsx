import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { GroupInfo } from "./GroupInfo";
import { useGroupStore } from "../../stores";
import { RoomType, UserStatus, type Conversation } from "../../types";

vi.mock("../../features/chat/usecases/getConversationById", () => ({
  getConversationByIdUseCase: vi.fn().mockResolvedValue({
    success: true,
    data: {},
  }),
}));

vi.mock("../../features/chat/usecases/searchUsers", () => ({
  searchUsersUseCase: vi.fn().mockResolvedValue({
    success: true,
    data: [],
  }),
}));

vi.mock("../../features/chat/usecases/createGroupInviteLink", () => ({
  createGroupInviteLinkUseCase: vi.fn(),
}));

vi.mock("../../features/chat/usecases/revokeGroupInviteLink", () => ({
  revokeGroupInviteLinkUseCase: vi.fn(),
}));

vi.mock("../../features/chat/usecases/resolveGroupJoinRequest", () => ({
  resolveGroupJoinRequestUseCase: vi.fn(),
}));

vi.mock("../../services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/api")>();
  return {
    ...actual,
    groupApi: {
      ...actual.groupApi,
      getMembers: vi.fn().mockResolvedValue({
        success: true,
        data: {
          members: [
            {
              roomId: "room-1",
              userId: "user-1",
              role: "owner",
              joinedAt: new Date("2026-04-16T00:00:00.000Z"),
              user: {
                id: "user-1",
                username: "owner",
                displayName: "Owner",
                status: "online",
              },
            },
            {
              roomId: "room-1",
              userId: "user-2",
              role: "member",
              joinedAt: new Date("2026-04-16T00:00:00.000Z"),
              user: {
                id: "user-2",
                username: "member",
                displayName: "Member",
                status: "online",
              },
            },
          ],
        },
      }),
      getInviteLinks: vi.fn().mockResolvedValue({ success: true, data: [] }),
      getJoinRequests: vi.fn().mockResolvedValue({ success: true, data: [] }),
    },
  };
});

const conversation: Conversation = {
  id: "room-1",
  type: RoomType.GROUP,
  name: "Engineering",
  displayName: "Engineering",
  participantCount: 2,
  participants: [
    {
      id: "user-1",
      username: "owner",
      displayName: "Owner",
      status: UserStatus.ONLINE,
    },
    {
      id: "user-2",
      username: "member",
      displayName: "Member",
      status: UserStatus.ONLINE,
    },
  ],
  unreadCount: 0,
  isPinned: false,
  isMuted: false,
  isArchived: false,
  isBlocked: false,
  updatedAt: new Date("2026-04-16T00:00:00.000Z"),
  createdAt: new Date("2026-04-16T00:00:00.000Z"),
  summaryVersion: 1,
  membershipState: "active",
  createdBy: "user-1",
};

describe("GroupInfo", () => {
  beforeEach(() => {
    useGroupStore.getState().reset();
  });

  it("renders with stable empty invite and join-request snapshots", async () => {
    render(
      <MemoryRouter>
        <GroupInfo
          conversation={conversation}
          currentUserId="user-1"
          onClose={() => {}}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Group information")).toBeInTheDocument();
    expect(screen.getByText("Engineering")).toBeInTheDocument();
    expect(screen.queryByText(/report group/i)).not.toBeInTheDocument();
  });
});
