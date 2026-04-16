import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { GroupInfo } from "./GroupInfo";
import { useGroupStore } from "../../stores";
import { RoomType, UserStatus, type Conversation } from "../../types";

vi.mock("../../features/chat/usecases/getConversationMembers", () => ({
  getConversationMembersUseCase: vi.fn().mockResolvedValue({
    success: true,
    data: [],
  }),
}));

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

vi.mock("../../features/chat/usecases/addConversationMembers", () => ({
  addConversationMembersUseCase: vi.fn(),
}));

vi.mock("../../features/chat/usecases/updateConversation", () => ({
  updateConversationUseCase: vi.fn(),
}));

vi.mock("../../features/chat/usecases/updateConversationMemberRole", () => ({
  updateConversationMemberRoleUseCase: vi.fn(),
}));

vi.mock("../../features/chat/usecases/removeConversationMember", () => ({
  removeConversationMemberUseCase: vi.fn(),
}));

vi.mock("../../features/chat/usecases/leaveConversation", () => ({
  leaveConversationUseCase: vi.fn(),
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
  });
});
