import { beforeEach, describe, expect, it } from "vitest";
import type {
  FriendshipCapabilitiesDto,
  FriendshipRelationDto,
} from "@hacom/chat-shared-types/chat";
import { FriendshipStatus } from "@hacom/chat-shared-types/chat";
import {
  deriveRelationshipState,
  useFriendshipStore,
  type FriendshipDirectorySnapshot,
} from "./friendshipStore";
import { toFriendshipRealtimeDetail } from "../features/chat/realtime/friendshipRealtime";

const EMPTY_SNAPSHOT: FriendshipDirectorySnapshot = {
  friends: [],
  incomingRequests: [],
  sentRequests: [],
  blockedUsers: [],
  pendingCount: 0,
};

const capabilities = (
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
  relationId: "fr-qr-1",
  pairKey: "sender-1:receiver-1",
  status: FriendshipStatus.PENDING,
  actorRole: "requester",
  requester: {
    id: "sender-1",
    username: "sender",
    displayName: "Sender User",
    avatarUrl: null,
  },
  addressee: {
    id: "receiver-1",
    username: "receiver",
    displayName: "Receiver User",
    avatarUrl: null,
  },
  friend: null,
  capabilities: capabilities({ canCancel: true }),
  actionResult: "created",
  updatedAt: "2026-04-07T00:00:00.000Z",
  createdAt: "2026-04-07T00:00:00.000Z",
  ...overrides,
});

const applyRealtimeRelation = (relation: FriendshipRelationDto): void => {
  const detail = toFriendshipRealtimeDetail("friendship:relation:updated", {
    relation,
    status: relation.status,
  });
  useFriendshipStore.getState().applyRealtimeDetail(detail);
};

const getRelationship = (userId: string, currentUserId: string) => {
  const state = useFriendshipStore.getState();
  return deriveRelationshipState({
    userId,
    currentUserId,
    blockedUsers: state.blockedUsers,
    friends: state.friends,
    incomingRequests: state.incomingRequests,
    sentRequests: state.sentRequests,
  });
};

describe("friendship realtime consistency for QR entrypoint", () => {
  beforeEach(() => {
    useFriendshipStore.getState().applySnapshot(EMPTY_SNAPSHOT);
  });

  it("add friend tu mini profile -> realtime update sender thanh pending", () => {
    applyRealtimeRelation(
      makeRelation({
        actorRole: "requester",
        capabilities: capabilities({ canCancel: true, canBlock: true }),
      }),
    );

    const relationship = getRelationship("receiver-1", "sender-1");

    expect(relationship.kind).toBe("outgoing_request");
    if (relationship.kind === "outgoing_request") {
      expect(relationship.capabilities.canCancel).toBe(true);
    }
  });

  it("add friend tu mini profile -> realtime update receiver thanh incoming", () => {
    applyRealtimeRelation(
      makeRelation({
        actorRole: "addressee",
        capabilities: capabilities({ canAccept: true, canDecline: true }),
      }),
    );

    const relationship = getRelationship("sender-1", "receiver-1");

    expect(relationship.kind).toBe("incoming_request");
    if (relationship.kind === "incoming_request") {
      expect(relationship.capabilities.canAccept).toBe(true);
      expect(relationship.capabilities.canDecline).toBe(true);
    }
  });

  it("auto-accept pending nguoc chieu -> ca hai phia thanh friend va cap nhat permission", () => {
    applyRealtimeRelation(
      makeRelation({
        relationId: "fr-auto-sender",
        actorRole: "addressee",
        requester: {
          id: "receiver-1",
          username: "receiver",
          displayName: "Receiver User",
          avatarUrl: null,
        },
        addressee: {
          id: "sender-1",
          username: "sender",
          displayName: "Sender User",
          avatarUrl: null,
        },
        capabilities: capabilities({ canAccept: true, canDecline: true }),
      }),
    );

    applyRealtimeRelation(
      makeRelation({
        relationId: "fr-auto-sender",
        status: FriendshipStatus.ACCEPTED,
        actorRole: "friend",
        friend: {
          id: "receiver-1",
          username: "receiver",
          displayName: "Receiver User",
          avatarUrl: null,
        },
        capabilities: capabilities({ canMessage: true, canUnfriend: true }),
        actionResult: "accepted",
      }),
    );

    const senderRelationship = getRelationship("receiver-1", "sender-1");
    expect(senderRelationship.kind).toBe("friend");
    if (senderRelationship.kind === "friend") {
      expect(senderRelationship.capabilities.canMessage).toBe(true);
    }

    useFriendshipStore.getState().applySnapshot(EMPTY_SNAPSHOT);

    applyRealtimeRelation(
      makeRelation({
        relationId: "fr-auto-receiver",
        actorRole: "requester",
        requester: {
          id: "receiver-1",
          username: "receiver",
          displayName: "Receiver User",
          avatarUrl: null,
        },
        addressee: {
          id: "sender-1",
          username: "sender",
          displayName: "Sender User",
          avatarUrl: null,
        },
        capabilities: capabilities({ canCancel: true }),
      }),
    );

    applyRealtimeRelation(
      makeRelation({
        relationId: "fr-auto-receiver",
        status: FriendshipStatus.ACCEPTED,
        actorRole: "friend",
        friend: {
          id: "sender-1",
          username: "sender",
          displayName: "Sender User",
          avatarUrl: null,
        },
        capabilities: capabilities({ canMessage: true, canUnfriend: true }),
        actionResult: "accepted",
      }),
    );

    const receiverRelationship = getRelationship("sender-1", "receiver-1");
    expect(receiverRelationship.kind).toBe("friend");
    if (receiverRelationship.kind === "friend") {
      expect(receiverRelationship.capabilities.canMessage).toBe(true);
    }
  });
});
