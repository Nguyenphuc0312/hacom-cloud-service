/**
 * @fileoverview Types cho Chat Web Client
 *
 * ⚠️ QUAN TRỌNG:
 * - Types chính được import từ @hacom/chat-shared-types
 * - File này chỉ chứa các types RIÊNG cho frontend (UI state, React components)
 * - KHÔNG duplicate types đã có trong shared-types
 */

// ============================================
// RE-EXPORT TỪ SHARED-TYPES
// ============================================

// Entities
export type {
  User,
  UserSummary,
  UserProfile,
  UserPresence,
  Message,
  MessageSummary,
  Attachment,
  Reaction,
  ForwardInfo,
  MessageMetadata,
  Room,
  RoomSettings,
  RoomSummary,
  RoomMember,
  Conversation,
  ConversationDetail,
  TypingUser,
} from "@hacom/chat-shared-types";

// Enums
export {
  UserStatus,
  MessageType,
  MessageStatus,
  RoomType,
  RoomMemberRole,
  FileType,
  EventType,
} from "@hacom/chat-shared-types";

// DTOs
export type {
  SendMessageDto,
  EditMessageDto,
  GetMessagesDto,
  MessagesListResponseDto,
  CreateRoomDto,
  UpdateRoomDto,
  LoginDto,
  RegisterDto,
  AuthResponseDto,
  SearchUsersDto,
  UpdateUserDto,
  UpdateUserStatusDto,
} from "@hacom/chat-shared-types";

// Utility types
export type {
  ApiResponse,
  ErrorResponse,
  PaginationParams,
  PaginationResponse,
} from "@hacom/chat-shared-types";

// WebSocket events
export type {
  MessageNewEvent,
  MessageUpdateEvent,
  MessageDeletedEvent,
  MessageReactionEvent,
} from "@hacom/chat-shared-types";

// ============================================
// FRONTEND-SPECIFIC TYPES
// Các types chỉ dùng trong frontend
// ============================================

import type {
  User,
  Message,
  Conversation,
  UserStatus,
} from "@hacom/chat-shared-types";

/**
 * Typing status for UI display
 */
export interface TypingStatus {
  conversationId: string;
  userId: string;
  userName: string;
  isTyping: boolean;
}

/**
 * Location types for map display
 */
export interface Location {
  latitude: number;
  longitude: number;
  address?: string;
  name?: string;
}

/**
 * App state types - Frontend specific
 */
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

/**
 * Context menu types
 */
export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  divider?: boolean;
  disabled?: boolean;
}

/**
 * Filter types
 */
export type ConversationFilter = "all" | "unread" | "groups" | "channels";

/**
 * Input modes for message composer
 */
export type InputMode = "normal" | "reply" | "edit";

export interface InputState {
  mode: InputMode;
  replyToMessage?: Message;
  editingMessage?: Message;
}

/**
 * Notification permission state
 */
export type NotificationPermission = "default" | "granted" | "denied";

/**
 * Theme options
 */
export type Theme = "light" | "dark" | "system";

/**
 * WebSocket connection state
 */
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

/**
 * UI Component props
 */
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

/**
 * Form states
 */
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

/**
 * Search state
 */
export interface SearchState {
  query: string;
  results: {
    users: User[];
    messages: Message[];
    conversations: Conversation[];
  };
  isSearching: boolean;
}

/**
 * Upload state
 */
export interface UploadState {
  files: File[];
  progress: number;
  isUploading: boolean;
  error: string | null;
}

/**
 * Modal state
 */
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

/**
 * Toast notification
 */
export interface ToastNotification {
  id: string;
  type: "success" | "error" | "warning" | "info";
  message: string;
  duration?: number;
}

/**
 * Sidebar state
 */
export interface SidebarState {
  isCollapsed: boolean;
  activeSection: "chats" | "contacts" | "settings";
}
