/**
 * @fileoverview Export all stores
 */

export { useAuthStore } from "./authStore";
export type { User } from "./authStore";

export {
  useChatStore,
  useSelectedConversation,
  useCurrentMessages,
  useMessagesByConversation,
  useCurrentTypingStatus,
  useFilteredConversations,
  useTotalUnreadCount,
} from "./chatStore";

export { useUIStore, useToast } from "./uiStore";
export type {
  Theme,
  ThemeBrand,
  ChatDensity,
  ModalType,
  Toast,
} from "./uiStore";

export { usePresenceStore } from "./presenceStore";
export type { PresenceState, UserPresenceInfo } from "./presenceStore";

export { useGroupStore } from "./groupStore";
export type { InviteLinkItem, JoinRequestItem } from "./groupStore";

export { useFriendshipStore } from "./friendshipStore";
export type {
  BlockedUser,
  FriendRecord,
  FriendRequest,
  FriendshipStatusType,
  RelationshipState,
} from "./friendshipStore";
