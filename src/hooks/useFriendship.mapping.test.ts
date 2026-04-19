import { describe, expect, it } from "vitest";
import type {
  FriendshipCapabilitiesDto,
  FriendshipRelationDto,
} from "@hacom/chat-shared-types/chat";
import { FriendshipStatus } from "@hacom/chat-shared-types/chat";
import {
  applyRelationToSnapshot,
  deriveRelationshipState,
  mapRelationToFriendRecord,
  mapRelationToRequestRecord,
} from "./useFriendship";

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

const makeRelation = (
  overrides?: Partial<FriendshipRelationDto>,
): FriendshipRelationDto => ({
  relationId: "fr-1",
  pairKey: "u1:u2",
  status: FriendshipStatus.PENDING,
  actorRole: "requester",
  requester: {
    id: "u1",
    username: "requester",
    displayName: "Requester User",
    avatarUrl: null,
  },
  addressee: {
    id: "u2",
    username: "addressee",
    displayName: "Addressee User",
    avatarUrl: null,
  },
  friend: {
    id: "u2",
    username: "addressee",
    displayName: "Addressee User",
    avatarUrl: null,
  },
  capabilities: baseCapabilities(),
  actionResult: "none",
  updatedAt: "2026-04-06T00:00:00.000Z",
  createdAt: "2026-04-06T00:00:00.000Z",
  ...overrides,
});

describe("useFriendship contract mappers", () => {
  it("incoming request maps from requester/addressee correctly", () => {
    const relation = makeRelation({
      actorRole: "addressee",
      capabilities: baseCapabilities({
        canAccept: true,
        canDecline: true,
      }),
    });

    const request = mapRelationToRequestRecord(relation);

    expect(request).not.toBeNull();
    expect(request?.requester.id).toBe("u1");
    expect(request?.addressee.id).toBe("u2");
    expect(request?.requester.firstName).toBe("Requester User");
  });

  it("sent request keeps addressee as target user", () => {
    const relation = makeRelation({
      actorRole: "requester",
      capabilities: baseCapabilities({ canCancel: true }),
    });

    const request = mapRelationToRequestRecord(relation);

    expect(request).not.toBeNull();
    expect(request?.addressee.id).toBe("u2");
    expect(request?.actorRole).toBe("requester");
  });

  it("accepted relation maps friend from relation.friend", () => {
    const relation = makeRelation({
      status: FriendshipStatus.ACCEPTED,
      actorRole: "friend",
      friend: {
        id: "u2",
        username: "friend-user",
        displayName: "Friend User",
        avatarUrl: "https://cdn.example.com/avatar.png",
      },
      capabilities: baseCapabilities({
        canMessage: true,
        canUnfriend: true,
      }),
    });

    const friend = mapRelationToFriendRecord(relation);

    expect(friend).not.toBeNull();
    expect(friend?.id).toBe("u2");
    expect(friend?.username).toBe("friend-user");
    expect(friend?.relationStatus).toBe(FriendshipStatus.ACCEPTED);
  });

  it("relationship state is derived from backend capabilities", () => {
    const incomingRelation = makeRelation({
      relationId: "fr-incoming",
      actorRole: "addressee",
      capabilities: baseCapabilities({
        canAccept: true,
        canDecline: true,
      }),
    });

    const incomingRequest = mapRelationToRequestRecord(incomingRelation);
    expect(incomingRequest).not.toBeNull();

    const state = deriveRelationshipState({
      userId: "u1",
      currentUserId: "u2",
      blockedUsers: [],
      friends: [],
      incomingRequests: incomingRequest ? [incomingRequest] : [],
      sentRequests: [],
    });

    expect(state.kind).toBe("incoming_request");
    if (state.kind === "incoming_request") {
      expect(state.capabilities.canAccept).toBe(true);
      expect(state.capabilities.canDecline).toBe(true);
    }
  });

  it("legacy sender/receiver shape is not accepted anymore", () => {
    const legacyPayload = {
      ...makeRelation(),
      requester: undefined,
      addressee: undefined,
      sender: {
        id: "u1",
        username: "sender",
      },
      receiver: {
        id: "u2",
        username: "receiver",
      },
    } as unknown as FriendshipRelationDto;

    const request = mapRelationToRequestRecord(legacyPayload);

    expect(request).toBeNull();
  });

  it("applies realtime snapshot transition pending -> accepted", () => {
    const pendingRelation = makeRelation({
      relationId: "fr-live-1",
      status: FriendshipStatus.PENDING,
      actorRole: "addressee",
      capabilities: baseCapabilities({ canAccept: true, canDecline: true }),
    });

    const acceptedRelation = makeRelation({
      relationId: "fr-live-1",
      status: FriendshipStatus.ACCEPTED,
      actorRole: "friend",
      capabilities: baseCapabilities({ canMessage: true, canUnfriend: true }),
    });

    const pendingSnapshot = applyRelationToSnapshot(
      {
        friends: [],
        incomingRequests: [],
        sentRequests: [],
        blockedUsers: [],
        pendingCount: 0,
      },
      pendingRelation,
    );

    expect(pendingSnapshot.incomingRequests).toHaveLength(1);
    expect(pendingSnapshot.pendingCount).toBe(1);
    expect(pendingSnapshot.friends).toHaveLength(0);

    const acceptedSnapshot = applyRelationToSnapshot(
      pendingSnapshot,
      acceptedRelation,
    );

    expect(acceptedSnapshot.incomingRequests).toHaveLength(0);
    expect(acceptedSnapshot.pendingCount).toBe(0);
    expect(acceptedSnapshot.friends).toHaveLength(1);
    expect(acceptedSnapshot.friends[0]?.relationStatus).toBe(
      FriendshipStatus.ACCEPTED,
    );
  });

  it("applies realtime snapshot transition accepted -> blocked", () => {
    const acceptedRelation = makeRelation({
      relationId: "fr-live-2",
      status: FriendshipStatus.ACCEPTED,
      actorRole: "friend",
      capabilities: baseCapabilities({ canMessage: true, canUnfriend: true }),
    });
    const blockedRelation = makeRelation({
      relationId: "fr-live-2",
      status: FriendshipStatus.BLOCKED,
      actorRole: "requester",
      capabilities: baseCapabilities({ canUnblock: true }),
    });

    const acceptedSnapshot = applyRelationToSnapshot(
      {
        friends: [],
        incomingRequests: [],
        sentRequests: [],
        blockedUsers: [],
        pendingCount: 0,
      },
      acceptedRelation,
    );

    const blockedSnapshot = applyRelationToSnapshot(
      acceptedSnapshot,
      blockedRelation,
    );

    expect(blockedSnapshot.friends).toHaveLength(0);
    expect(blockedSnapshot.blockedUsers).toHaveLength(1);
    expect(blockedSnapshot.blockedUsers[0]?.relationStatus).toBe(
      FriendshipStatus.BLOCKED,
    );
  });
});
