import type { ComposerMode } from "../../../hooks/useComposerAvailability";
import type { InputMode, LocationMessagePayload, Message } from "../../../types";
import type { AttachmentDraft } from "../../../types/attachmentDraft";

export interface MentionCandidate {
  id: string;
  username: string;
  /** Primary display name for UI (fullName or resolved displayName) */
  displayName?: string;
  /** HR full name if available */
  fullName?: string | null;
  employeeCode?: string;
  /** HR department / company for the secondary line */
  departmentName?: string;
  companyName?: string;
  /** Full resolved name (fullName > displayName > username) — used for the
   *  secondary line and server-side resolution, no longer for the inserted tag. */
  resolvedName?: string;
  /**
   * The "nick" inserted into the message when picked — the self-set display
   * name, else username (Zalo-style short tag). NOT the HR full name and NOT
   * the private alias, so the tag reads the same for everyone in the group.
   */
  mentionInsertName?: string;
  /** Avatar shown on the suggestion row (Zalo-style). */
  avatarUrl?: string;
  /**
   * "Tên gợi nhớ" (alias) the viewer set for this user — LOCAL ONLY.
   * Used to label the suggestion row so the viewer can search by the name they
   * know. Never inserted into the composer and never sent to the server: the
   * alias is private to the viewer, so everyone else must see the real name.
   */
  aliasLabel?: string;
}

/** Imperative handle for MessageInput — allows parent to programmatically control the composer */
export interface MessageInputHandle {
  addFile: (file: File) => void;
  /** Focus the editor — e.g. after selecting a new conversation.
   *  Pass scrollIntoView:false to focus without scrolling ancestors. */
  focus: (options?: { scrollIntoView?: boolean }) => void;
  /**
   * Vị trí các tag `@` trong nội dung sắp gửi (code point, gồm cả '@').
   *
   * ChatWindow đọc NGAY TRƯỚC khi gửi, lúc editor còn nguyên nội dung — đọc sau
   * `clearContent()` thì rỗng. Đi qua ref thay vì thêm tham số cho `onSend` để
   * khỏi phải nới cùng lúc 5 signature trên đường xuống API.
   */
  getMentionRanges: () => {
    userId: string;
    offset: number;
    length: number;
  }[];
}

export interface MessageInputProps {
  value: string;
  valueResetKey?: number;
  onChange: (value: string) => void;
  onSend: (
    content?: string,
    fileMeta?: unknown,
    type?: string,
  ) => unknown | Promise<unknown>;
  mode: InputMode;
  conversationId?: string;
  mentionCandidates?: MentionCandidate[];
  replyToMessage?: Message;
  editingMessage?: Message;
  onCancelReply?: () => void;
  onCancelEdit?: () => void;
  onTyping?: (isTyping: boolean) => void;
  sendOnEnter?: boolean;
  disabled?: boolean;
  submitDisabled?: boolean;
  attachmentsDisabled?: boolean;
  className?: string;
  onLayoutHeightChange?: (nextHeight: number) => void;
  disabledReason?: string;
  disabledReasonTone?: "info" | "warn" | "error";
  composerMode?: ComposerMode;
  currentUserId?: string;
  onShareContact?: (contactUserId: string) => Promise<boolean>;
  onShareLocation?: (
    location: LocationMessagePayload,
    clientMessageId?: string,
  ) => unknown | Promise<unknown>;
  conversationName?: string;
  /** Optional product-specific prompt while retaining the shared composer. */
  placeholder?: string;
  /** "direct"|"private" = 1-1 DM; "group" = nhóm. Poll chỉ hiện khi là nhóm. */
  conversationType?: string;

  // ── Multi-file upload queue (from ChatWindow) ──
  uploadDrafts?: AttachmentDraft[];
  onAddFiles?: (files: File[]) => { errors?: string[] } | void;
  /** Override the native Chat voice upload, e.g. for My Documents Cloud. */
  onSendAudio?: (file: File) => Promise<void>;
  onRemoveDraft?: (localId: string) => void;
  onCancelUpload?: (localId: string) => void;
  onRetryUpload?: (localId: string) => void;
  onClearAllDrafts?: () => void;
  hasUploadingDrafts?: boolean;
  hasFailedDrafts?: boolean;
  hasReadyDrafts?: boolean;
}

export interface MentionMatch {
  start: number;
  end: number;
  query: string;
}

export type ComposerVisualState =
  | "idle"
  | "focus"
  | "ready-to-send"
  | "uploading"
  | "disabled"
  | "slow-mode"
  | "offline";

export interface ComposerVisualStyles {
  shell: string;
  attachmentButton: string;
  attachmentDivider: string;
}
