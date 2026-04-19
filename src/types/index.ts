/**
 * @fileoverview Frontend type exports and UI-specific extensions.
 */

// Re-export shared domain entities
export type {
  User,
  UserSummary,
  UserProfile,
  UserPresence,
  LoginDto,
  RegisterDto,
  AuthResponseDto,
  SearchUsersDto,
  UpdateUserDto,
  UpdateUserStatusDto,
} from "@hacom/chat-shared-types/auth";

export type {
  MessageSummary,
  Attachment,
  Reaction,
  ForwardInfo,
  MessageMetadata,
  SendMessageDto,
  EditMessageDto,
  GetMessagesDto,
  MessagesListResponseDto,
} from "@hacom/chat-shared-types/chat";

export type {
  Room,
  RoomSettings,
  RoomSummary,
  RoomMember,
  CreateRoomDto,
  UpdateRoomDto,
} from "@hacom/chat-shared-types/compat";

// Re-export shared enums
export { UserStatus } from "@hacom/chat-shared-types/core";
export {
  MessageType,
  MessageStatus,
  ConversationType,
  FileType,
} from "@hacom/chat-shared-types/chat";
export {
  RoomType,
  RoomMemberRole,
  EventType,
} from "@hacom/chat-shared-types/compat";

// Re-export shared API utility types
export type {
  ApiResponse,
  ApiSuccess,
  ApiFailure,
  ApiError,
  ErrorResponse,
  PaginationMeta,
  CursorMeta,
  PaginationParams,
  PaginatedResponse,
} from "@hacom/chat-shared-types/core";

// Re-export shared WebSocket payload types
export type {
  MessageNewEvent,
  MessageUpdateEvent,
  MessageDeletedEvent,
  MessageReactionEvent,
} from "@hacom/chat-shared-types/ws";

import type {
  Conversation as SharedConversation,
  ConversationDetail as SharedConversationDetail,
  Message as SharedMessage,
  TypingUser as SharedTypingUser,
} from "@hacom/chat-shared-types/chat";
import { MessageStatus as SharedMessageStatus } from "@hacom/chat-shared-types/chat";
import type { User, UserSummary as SharedUserSummary } from "@hacom/chat-shared-types/auth";

export type TypingUser = SharedTypingUser;

export type Conversation = Omit<
  SharedConversation,
  "lastReadAt" | "lastReadMessageId"
> & {
  createdBy?: string;
  createdAt?: Date | string;
  lastMessageAt?: Date | string | null;
  lastActivityAt?: Date | string | null;
  displayName?: string;
  displayAvatar?: string | null;
  otherUser?: SharedUserSummary | null;
  directKey?: string | null;
  currentUserId?: string;
  updatedAt: Date;
  joinedAt?: Date;
  lastReadAt?: Date | string | null;
  lastReadMessageId?: string | null;
  firstUnreadMessageId?: string | null;
  firstUnreadMessageAt?: Date | string | null;
  lastMessageSortAt?: Date | string | null;
  lastMessageId?: string | null;
  lastMessageStatus?: "pending" | "sent" | "failed" | null;
  membershipState?: "active" | "left" | "removed" | "banned" | "deleted";
  summaryVersion?: number;
  typingUsers?: TypingUser[];
};

export type ConversationDetail = Omit<
  SharedConversationDetail,
  keyof Conversation
> &
  Conversation;

export type MessageSendState =
  | "queued"
  | "sending"
  | "retrying"
  | "sent"
  | "failed";

export type MessageQueueReason = "offline" | "reconnecting" | "manual_retry";

export type MessageFailureReason =
  | "network"
  | "timeout"
  | "permission"
  | "slow_mode"
  | "backend_4xx"
  | "backend_5xx"
  | "server"
  | "unknown";

export interface SendRestriction {
  code?: string;
  reason: string;
  kind: "blocked" | "permission" | "slow_mode" | "readonly";
}

export interface SendMessageResult {
  disposition: "optimistic" | "queued" | "sent";
  messageId: string;
}

export interface Message extends Omit<SharedMessage, "id" | "status"> {
  id: string;
  localId?: string;
  stableId?: string;
  clientMessageId?: string;
  version?: number;
  serverSeq?: number;
  serverTs?: Date;
  localOrder?: number;
  transportStatus?:
    | "draft"
    | "optimistic"
    | "acked_transport"
    | "synced_stream";
  sendState?: MessageSendState;
  queuedReason?: MessageQueueReason;
  failureReason?: MessageFailureReason;
  errorCode?: string;
  errorMessage?: string;
  sendAttempts?: number;
  lastSendAttemptAt?: Date;
  updatedAt?: Date;
  status: SharedMessageStatus | "uploading";
}

export interface TypingStatus {
  conversationId: string;
  userId: string;
  userName: string;
  isTyping: boolean;
  activity?: "typing" | "recording" | "uploading" | "online";
  confidence?: number;
  lastEventAt?: number;
}

export interface Location {
  latitude: number;
  longitude: number;
  address?: string;
  name?: string;
}

export interface ChatState {
  currentUser: User | null;
  conversations: Conversation[];
  selectedConversationId: string | null;
  messages: Record<string, Message[]>;
  typingStatuses: TypingStatus[];
  isInfoPanelOpen: boolean;
  searchQuery: string;
  activeTab: ConversationFilter;
  isLoading: boolean;
  error: string | null;
}

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  divider?: boolean;
  disabled?: boolean;
}

export type ConversationFilter =
  | "all"
  | "unread"
  | "groups"
  | "channels"
  | "direct";

export type InputMode = "normal" | "reply" | "edit";

export interface InputState {
  mode: InputMode;
  replyToMessage?: Message;
  editingMessage?: Message;
}

export type NotificationPermission = "default" | "granted" | "denied";

export type Theme = "light" | "dark" | "system";

export type ConnectionState =
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting";

export interface WebSocketState {
  connectionState: ConnectionState;
  reconnectAttempts: number;
  lastConnected: Date | null;
  error: string | null;
}

export interface MessageListProps {
  messages: Message[];
  currentUserId: string;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (messageId: string) => void;
  onReaction: (messageId: string, emoji: string) => void;
}

export interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (conversationId: string) => void;
  filter: ConversationFilter;
}

export interface MessageInputProps {
  inputState: InputState;
  onSend: (content: string, attachments?: File[]) => void;
  onCancel: () => void;
  disabled?: boolean;
}

export interface LoginFormData {
  email: string;
  password: string;
  rememberMe: boolean;
}

export interface RegisterFormData {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  firstName?: string;
  lastName?: string;
  acceptTerms: boolean;
}

export interface SearchState {
  query: string;
  results: {
    users: User[];
    messages: Message[];
    conversations: Conversation[];
  };
  isSearching: boolean;
}

export interface UploadState {
  files: File[];
  progress: number;
  isUploading: boolean;
  error: string | null;
}

export interface ModalState {
  isOpen: boolean;
  type: ModalType | null;
  data?: unknown;
}

export type ModalType =
  | "createGroup"
  | "editProfile"
  | "settings"
  | "members"
  | "forward"
  | "imagePreview"
  | "deleteConfirm";

export interface ToastNotification {
  id: string;
  type: "success" | "error" | "warning" | "info";
  message: string;
  duration?: number;
}

export interface SidebarState {
  isCollapsed: boolean;
  activeSection: "chats" | "contacts" | "settings";
}
