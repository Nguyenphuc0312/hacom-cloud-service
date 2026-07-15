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
  /** Resolved display name for insert (fullName > displayName > username) */
  resolvedName?: string;
}

/** Imperative handle for MessageInput — allows parent to programmatically control the composer */
export interface MessageInputHandle {
  addFile: (file: File) => void;
  /** Focus the editor — e.g. after selecting a new conversation.
   *  Pass scrollIntoView:false to focus without scrolling ancestors. */
  focus: (options?: { scrollIntoView?: boolean }) => void;
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
  /** "direct"|"private" = 1-1 DM; "group" = nhóm. Poll chỉ hiện khi là nhóm. */
  conversationType?: string;

  // ── Multi-file upload queue (from ChatWindow) ──
  uploadDrafts?: AttachmentDraft[];
  onAddFiles?: (files: File[]) => { errors?: string[] } | void;
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
