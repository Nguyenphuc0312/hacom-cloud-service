// User types
export interface User {
  id: string;
  username: string;
  firstName: string;
  lastName?: string;
  phone?: string;
  bio?: string;
  avatar?: string;
  status: "online" | "offline" | "away";
  lastSeen?: Date;
  isVerified?: boolean;
  isBot?: boolean;
}

// Conversation types
export type ConversationType = "private" | "group" | "channel";

export interface Conversation {
  id: string;
  type: ConversationType;
  name: string;
  avatar?: string;
  participants: User[];
  lastMessage?: Message;
  unreadCount: number;
  isPinned: boolean;
  isMuted: boolean;
  isArchived: boolean;
  updatedAt: Date;
  createdAt: Date;
  description?: string;
  pinnedMessageId?: string;
}

// Message types
export type MessageType =
  | "text"
  | "image"
  | "video"
  | "file"
  | "voice"
  | "location"
  | "sticker"
  | "system";

export type MessageStatus =
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  type: MessageType;
  replyTo?: Message;
  forwardedFrom?: User;
  attachments?: Attachment[];
  reactions?: Reaction[];
  status: MessageStatus;
  isEdited: boolean;
  isPinned: boolean;
  createdAt: Date;
  editedAt?: Date;
  readBy?: string[];
}

// Attachment types
export type AttachmentType = "image" | "video" | "file" | "audio";

export interface Attachment {
  id: string;
  type: AttachmentType;
  url: string;
  thumbnailUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  duration?: number;
  width?: number;
  height?: number;
}

// Reaction types
export interface Reaction {
  emoji: string;
  userIds: string[];
  count: number;
}

// Typing status
export interface TypingStatus {
  conversationId: string;
  userId: string;
  userName: string;
  isTyping: boolean;
}

// Location types
export interface Location {
  latitude: number;
  longitude: number;
  address?: string;
  name?: string;
}

// App state types
export interface ChatState {
  currentUser: User;
  conversations: Conversation[];
  selectedConversationId: string | null;
  messages: Record<string, Message[]>;
  typingStatuses: TypingStatus[];
  isInfoPanelOpen: boolean;
  searchQuery: string;
  activeTab: "all" | "unread" | "groups" | "channels";
}

// Context menu types
export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  divider?: boolean;
}

// Filter types
export type ConversationFilter =
  | "all"
  | "unread"
  | "groups"
  | "channels"
  | "direct";

// Input modes
export type InputMode = "normal" | "reply" | "edit";

export interface InputState {
  mode: InputMode;
  replyToMessage?: Message;
  editingMessage?: Message;
}
