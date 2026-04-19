import { beforeEach, describe, expect, it } from "vitest";

import { useGroupStore } from "./groupStore";

describe("groupStore", () => {
  beforeEach(() => {
    useGroupStore.getState().reset();
  });

  it("indexes invite links, join requests, and cooldowns by conversationId", () => {
    const store = useGroupStore.getState();

    store.setSlowModeCooldown("conv-1", 30);
    store.upsertInviteLink("conv-1", {
      id: "invite-1",
      conversationId: "conv-1",
      inviteUrl: "https://example.com/invite/1",
    });
    store.upsertJoinRequest("conv-1", {
      id: "request-1",
      conversationId: "conv-1",
      userId: "user-a",
      status: "pending",
    });
    store.bumpMemberListVersion("conv-1");

    const next = useGroupStore.getState();
    expect(next.slowModeUntilByConversation["conv-1"]).toBeGreaterThan(Date.now());
    expect(next.inviteLinksByConversation["conv-1"]).toHaveLength(1);
    expect(next.joinRequestsByConversation["conv-1"]).toHaveLength(1);
    expect(next.memberListVersionByConversation["conv-1"]).toBe(1);
  });

  it("updates invite and join-request state without any roomId keying", () => {
    const store = useGroupStore.getState();

    store.setInviteLinks("conv-2", [
      {
        id: "invite-2",
        conversationId: "conv-2",
      },
    ]);
    store.setJoinRequests("conv-2", [
      {
        id: "request-2",
        conversationId: "conv-2",
        userId: "user-b",
        status: "pending",
      },
    ]);
    store.markInviteLinkRevoked("conv-2", "invite-2", "2026-04-19T10:00:00.000Z");
    store.markJoinRequestResolved("conv-2", "request-2", "approved");

    const next = useGroupStore.getState();
    expect(next.inviteLinksByConversation["conv-2"]?.[0]?.revokedAt).toBe(
      "2026-04-19T10:00:00.000Z",
    );
    expect(next.joinRequestsByConversation["conv-2"]?.[0]?.status).toBe(
      "approved",
    );
    expect((next as unknown as { inviteLinksByRoom?: unknown }).inviteLinksByRoom).toBeUndefined();
  });
});
