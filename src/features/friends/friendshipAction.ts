import type { FriendshipCapabilitiesDto } from "@hacom/chat-shared-types/chat";
import type { RelationshipState } from "../../stores/friendshipStore";

export type FriendshipSearchStatus =
  | "none"
  | "pending"
  | "requested"
  | "accepted"
  | "friends"
  | "friend"
  | "declined"
  | "canceled"
  | "cancelled"
  | "blocked"
  | null
  | undefined;

export interface FriendshipActionUser {
  id: string;
  isFriend?: boolean;
  canAddFriend?: boolean;
  friendshipStatus?: FriendshipSearchStatus;
  capabilities?: Partial<FriendshipCapabilitiesDto> | null;
}

export type FriendshipAction =
  | { kind: "self" }
  | { kind: "message" }
  | { kind: "accept_decline" }
  | { kind: "cancel" }
  | { kind: "pending" }
  | { kind: "add" }
  | { kind: "blocked" }
  | { kind: "none" };

const acceptedStatuses = new Set<FriendshipSearchStatus>([
  "accepted",
  "friends",
  "friend",
]);

const pendingStatuses = new Set<FriendshipSearchStatus>(["pending", "requested"]);
const noneStatuses = new Set<FriendshipSearchStatus>([
  "none",
  null,
  undefined,
  "declined",
  "canceled",
  "cancelled",
]);

export const getFriendshipAction = (
  user: FriendshipActionUser,
  relationship: RelationshipState,
): FriendshipAction => {
  if (relationship.kind === "self") {
    return { kind: "self" };
  }

  const capabilities = user.capabilities;
  if (capabilities?.canMessage || user.isFriend === true) {
    return { kind: "message" };
  }
  if (acceptedStatuses.has(user.friendshipStatus)) {
    return { kind: "message" };
  }
  if (capabilities?.canAccept) {
    return { kind: "accept_decline" };
  }
  if (capabilities?.canCancel) {
    return { kind: "cancel" };
  }
  if (capabilities?.canSendRequest) {
    return { kind: "add" };
  }
  if (user.friendshipStatus === "blocked") {
    return { kind: "blocked" };
  }
  if (pendingStatuses.has(user.friendshipStatus) || user.canAddFriend === false) {
    return relationship.kind === "outgoing_request"
      ? { kind: "cancel" }
      : { kind: "pending" };
  }

  switch (relationship.kind) {
    case "friend":
      return { kind: "message" };
    case "incoming_request":
      return { kind: "accept_decline" };
    case "outgoing_request":
      return relationship.capabilities.canCancel
        ? { kind: "cancel" }
        : { kind: "pending" };
    case "not_friend":
      if (
        user.canAddFriend === true ||
        (noneStatuses.has(user.friendshipStatus) &&
          relationship.capabilities.canSendRequest)
      ) {
        return { kind: "add" };
      }
      return { kind: "none" };
    default:
      return { kind: "none" };
  }
};
