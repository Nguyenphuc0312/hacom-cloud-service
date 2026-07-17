import type { Message } from "../types";
import { MessageType } from "../types";
import { isFailedMessage, isPendingMessage } from "./messageTimeline";
import { getCopyableMessageText } from "./messageCopy";

export type MessageActionId =
  | "react"
  | "reply"
  | "forward"
  | "copy"
  | "retry"
  | "pin"
  | "unpin"
  | "select"
  | "deleteForMe"
  | "recall"
  | "adminDelete"
  | "more";

export interface MessageActionPolicyInput {
  message: Message;
  isOwn: boolean;
  isCoarsePointer: boolean;
  isSelectionMode?: boolean;
  canRetry?: boolean;
  canPin?: boolean;
  isPinned?: boolean;
  canForward?: boolean;
  canSelect?: boolean;
  canDelete?: boolean;
  /** Owner/admin được "Xóa ở mọi người" trên tin của người khác (BE: moderator delete). */
  canRecallOthers?: boolean;
}

interface ActionCandidate {
  id: Exclude<MessageActionId, "more">;
  railOrder?: number;
  menuOrder?: number;
  railEligible: boolean;
  menuEligible: boolean;
}

export interface MessageActionPolicyResult {
  railActions: MessageActionId[];
  menuActions: Exclude<MessageActionId, "more">[];
}

const canCopyMessage = (message: Message): boolean =>
  getCopyableMessageText(message) !== null;

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

const canPinMessage = (message: Message): boolean =>
  message.type !== MessageType.SYSTEM &&
  !message.isDeleted &&
  !isPendingMessage(message) &&
  !isFailedMessage(message);

const canForwardMessage = (message: Message): boolean =>
  message.type !== MessageType.SYSTEM &&
  !message.isDeleted &&
  !isPendingMessage(message) &&
  !isFailedMessage(message);

const canShowMessageMenu = (message: Message): boolean =>
  message.type !== MessageType.SYSTEM &&
  !message.isDeleted &&
  message.lifecycleStatus !== "recalled" &&
  message.lifecycleStatus !== "deleted_admin";

const canDeleteMessage = (message: Message): boolean =>
  message.type !== MessageType.SYSTEM &&
  !message.isDeleted &&
  !isPendingMessage(message) &&
  !isFailedMessage(message);

// Zalo rule: thu hồi chỉ trong 24h sau khi gửi; quá hạn chỉ còn "Xóa chỉ ở phía tôi".
const RECALL_WINDOW_MS = 24 * 60 * 60 * 1000;

const isWithinRecallWindow = (message: Message): boolean => {
  const createdAt = new Date(message.createdAt).getTime();
  return Number.isFinite(createdAt) && Date.now() - createdAt < RECALL_WINDOW_MS;
};

const getActionCandidates = ({
  message,
  isOwn,
  canRetry = false,
  canPin = false,
  isPinned = false,
  canForward = false,
  canSelect = false,
  canDelete = false,
  canRecallOthers = false,
}: MessageActionPolicyInput): ActionCandidate[] => {
  const failed = isFailedMessage(message);
  const candidates: ActionCandidate[] = [];

  if (canRetry && failed) {
    candidates.push({
      id: "retry",
      railOrder: 0,
      railEligible: true,
      menuEligible: false,
    });
  }

  if (canReplyToMessage(message)) {
    candidates.push({
      id: "reply",
      railOrder: 1,
      railEligible: true,
      menuEligible: false,
    });
  }

  if (canReactToMessage(message) && !failed) {
    candidates.push({
      id: "react",
      railOrder: 2,
      railEligible: true,
      menuEligible: false,
    });
  }

  if (canCopyMessage(message)) {
    candidates.push({
      id: "copy",
      railOrder: 3,
      menuOrder: 0,
      railEligible: true,
      menuEligible: true,
    });
  }

  if (canForward && canForwardMessage(message)) {
    candidates.push({
      id: "forward",
      railOrder: 4,
      railEligible: true,
      menuEligible: false,
    });
  }

  if (!canShowMessageMenu(message)) {
    return candidates;
  }

  if (canPin && canPinMessage(message)) {
    candidates.push({
      id: isPinned ? "unpin" : "pin",
      menuOrder: 1,
      railEligible: false,
      menuEligible: true,
    });
  }

  if (canSelect) {
    candidates.push({
      id: "select",
      menuOrder: 2,
      railEligible: false,
      menuEligible: true,
    });
  }

  if (canDelete && canDeleteMessage(message)) {
    if (isOwn && isWithinRecallWindow(message)) {
      candidates.push({
        id: "recall",
        menuOrder: 3,
        railEligible: false,
        menuEligible: true,
      });
    }
    if (!isOwn && canRecallOthers) {
      candidates.push({
        id: "adminDelete",
        menuOrder: 3,
        railEligible: false,
        menuEligible: true,
      });
    }
    candidates.push({
      id: "deleteForMe",
      menuOrder: 4,
      railEligible: false,
      menuEligible: true,
    });
  }

  return candidates;
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

  const railSlots = input.isCoarsePointer ? 1 : 4;
  const railActionIds = candidates
    .filter((candidate) => candidate.railEligible)
    .sort((a, b) => (a.railOrder ?? 99) - (b.railOrder ?? 99))
    .slice(0, railSlots)
    .map((candidate) => candidate.id);

  const menuActionIds = candidates
    .filter((candidate) => candidate.menuEligible)
    .sort((a, b) => (a.menuOrder ?? 99) - (b.menuOrder ?? 99))
    .map((candidate) => candidate.id);

  const railActions: MessageActionId[] = [...railActionIds];
  if (menuActionIds.length > 0) {
    railActions.push("more");
  }

  return {
    railActions,
    menuActions: menuActionIds,
  };
};
