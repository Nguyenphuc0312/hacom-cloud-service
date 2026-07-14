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
  | "more";

export interface MessageActionPolicyInput {
  message: Message;
  isOwn: boolean;
  isCoarsePointer: boolean;
  isSelectionMode?: boolean;
  canRetry?: boolean;
  /** Có cho phép ghim tin nhắn hay không (owner/admin). */
  canPin?: boolean;
  /** Tin nhắn đã được ghim chưa. */
  isPinned?: boolean;
  /** Có cho phép chuyển tiếp tin nhắn hay không. */
  canForward?: boolean;
}

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

const getActionCandidates = ({
  message,
  canRetry = false,
  canPin = false,
  isPinned = false,
  canForward = false,
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
      score: 90,
      railEligible: true,
      menuEligible: true,
    });
  }

  if (canReactToMessage(message) && !failed) {
    candidates.push({
      id: "react",
      score: 100,
      railEligible: true,
      menuEligible: true,
    });
  }

  if (canCopyMessage(message)) {
    candidates.push({
      id: "copy",
      score: failed ? 76 : 80,
      railEligible: true,
      menuEligible: true,
    });
  }

  if (canForward && canForwardMessage(message)) {
    candidates.push({
      id: "forward",
      score: 70,
      railEligible: true,
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
