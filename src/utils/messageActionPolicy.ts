import type { Message } from "../types";
import { MessageType } from "../types";
import { isFailedMessage, isPendingMessage } from "./messageTimeline";

export type MessageActionId =
  | "react"
  | "reply"
  | "copy"
  | "edit"
  | "deleteForMe"
  | "deleteForEveryone"
  | "retry"
  | "pin"
  | "unpin"
  | "more";

export interface MessageActionPolicyInput {
  message: Message;
  isOwn: boolean;
  isCoarsePointer: boolean;
  isSelectionMode?: boolean;
  canEdit?: boolean;
  /** Có cho phép "Xóa về phía tôi" hay không. Thường = Boolean(onDelete). */
  canDelete?: boolean;
  /**
   * Có cho phép "Thu hồi"/"Xóa ở mọi người" hay không.
   * Trong P3 mặc định = isOwn && tin nhắn còn trong window 24h.
   * Admin/moderator có thể true cho tin nhắn của người khác (caller truyền vào).
   */
  canDeleteForEveryone?: boolean;
  canRetry?: boolean;
  /** Có cho phép ghim tin nhắn hay không (owner/admin). */
  canPin?: boolean;
  /** Tin nhắn đã được ghim chưa. */
  isPinned?: boolean;
}

const RECALL_WINDOW_MS = 24 * 60 * 60 * 1000;

const isWithinRecallWindow = (message: Message): boolean => {
  if (!message.createdAt) return false;
  const createdAtMs =
    message.createdAt instanceof Date
      ? message.createdAt.getTime()
      : new Date(message.createdAt).getTime();
  if (Number.isNaN(createdAtMs)) return false;
  return Date.now() - createdAtMs <= RECALL_WINDOW_MS;
};

interface ActionCandidate {
  id: Exclude<MessageActionId, "more">;
  score: number;
  railEligible: boolean;
  menuEligible: boolean;
}

export interface MessageActionPolicyResult {
  railActions: MessageActionId[];
  menuActions: Exclude<MessageActionId, "more">[];
}

const canCopyMessage = (message: Message): boolean =>
  Boolean(message.content?.trim());

const canReactToMessage = (message: Message): boolean =>
  message.type !== MessageType.SYSTEM &&
  !message.isDeleted &&
  !isPendingMessage(message) &&
  !isFailedMessage(message);

const canReplyToMessage = (message: Message): boolean =>
  message.type !== MessageType.SYSTEM &&
  !message.isDeleted &&
  !isPendingMessage(message) &&
  !isFailedMessage(message);

const canEditMessage = (message: Message, isOwn: boolean): boolean =>
  isOwn &&
  !message.isDeleted &&
  !isFailedMessage(message) &&
  !isPendingMessage(message) &&
  message.type === MessageType.TEXT;

const canDeleteMessage = (message: Message): boolean => !message.isDeleted;

const canPinMessage = (message: Message): boolean =>
  message.type !== MessageType.SYSTEM &&
  !message.isDeleted &&
  !isPendingMessage(message) &&
  !isFailedMessage(message);

const getActionCandidates = ({
  message,
  isOwn,
  canEdit = false,
  canDelete = false,
  canDeleteForEveryone,
  canRetry = false,
  canPin = false,
  isPinned = false,
}: MessageActionPolicyInput): ActionCandidate[] => {
  const failed = isFailedMessage(message);
  const candidates: ActionCandidate[] = [];

  if (canRetry && failed) {
    candidates.push({
      id: "retry",
      score: 110,
      railEligible: true,
      menuEligible: true,
    });
  }

  if (canReplyToMessage(message)) {
    candidates.push({
      id: "reply",
      score: isOwn ? 66 : 82,
      railEligible: true,
      menuEligible: true,
    });
  }

  if (canReactToMessage(message) && !failed) {
    candidates.push({
      id: "react",
      score: isOwn ? 56 : 74,
      railEligible: true,
      menuEligible: true,
    });
  }

  if (canCopyMessage(message)) {
    candidates.push({
      id: "copy",
      score: failed ? 76 : 72,
      railEligible: true,
      menuEligible: true,
    });
  }

  if (canEdit && canEditMessage(message, isOwn)) {
    candidates.push({
      id: "edit",
      score: 70,
      railEligible: false,
      menuEligible: true,
    });
  }

  if (canDelete && canDeleteMessage(message)) {
    candidates.push({
      id: "deleteForMe",
      score: failed && isOwn ? 68 : 18,
      railEligible: false,
      menuEligible: true,
    });
  }

  const allowRecall =
    canDeleteForEveryone ?? (isOwn && isWithinRecallWindow(message));
  if (allowRecall && canDeleteMessage(message)) {
    candidates.push({
      id: "deleteForEveryone",
      score: isOwn ? 24 : 20,
      railEligible: false,
      menuEligible: true,
    });
  }

  // Pin/Unpin actions (only for group admins/owners)
  if (canPin && canPinMessage(message)) {
    if (isPinned) {
      candidates.push({
        id: "unpin",
        score: 30,
        railEligible: true,
        menuEligible: true,
      });
    } else {
      candidates.push({
        id: "pin",
        score: 28,
        railEligible: true,
        menuEligible: true,
      });
    }
  }

  return candidates.sort((a, b) => b.score - a.score);
};

export const resolveMessageActions = (
  input: MessageActionPolicyInput,
): MessageActionPolicyResult => {
  if (input.isSelectionMode) {
    return {
      railActions: [],
      menuActions: [],
    };
  }

  const candidates = getActionCandidates(input);
  if (candidates.length === 0) {
    return {
      railActions: [],
      menuActions: [],
    };
  }

  const railSlots = input.isCoarsePointer ? 1 : 3;
  const railCandidates = candidates
    .filter((candidate) => candidate.railEligible)
    .slice(0, railSlots);
  const railActionIds = railCandidates.map((candidate) => candidate.id);

  const menuCandidates = candidates.filter(
    (candidate) =>
      candidate.menuEligible && !railActionIds.includes(candidate.id),
  );

  const railActions: MessageActionId[] = [...railActionIds];
  if (menuCandidates.length > 0) {
    railActions.push("more");
  }

  return {
    railActions,
    menuActions: menuCandidates.map((candidate) => candidate.id),
  };
};
