import { resolveUserDisplayName } from "../chat/identity/resolveUserDisplayName";
import type { FriendRequest } from "../../stores/friendshipStore";
import type { User } from "../../stores";

export type FriendRequestView = "incoming" | "sent";

const UUID_LIKE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuidLike = (value: string): boolean => UUID_LIKE_PATTERN.test(value);

const asNonUuidString = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || isUuidLike(trimmed)) {
    return null;
  }

  return trimmed;
};

export const getFriendRequestDisplayUser = (
  request: FriendRequest,
  view: FriendRequestView,
): User => {
  if (view === "incoming") {
    return request.friend ?? request.requester;
  }

  return request.friend ?? request.addressee;
};

export const getFriendRequestDisplayLabel = (user: User | null | undefined): string => {
  const resolved = asNonUuidString(
    resolveUserDisplayName(user, {
      allowLegacyFallback: false,
    }),
  );
  if (resolved) {
    return resolved;
  }

  const username = asNonUuidString(user?.username);
  if (username) {
    return username;
  }

  return "Người dùng";
};

export const getFriendRequestUsernameLabel = (
  user: User | null | undefined,
): string | null => {
  const username = asNonUuidString(user?.username);
  return username ? `@${username}` : null;
};
