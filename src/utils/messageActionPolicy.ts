import type { Message } from "../types";
import { MessageType } from "../types";
import { isFailedMessage, isPendingMessage } from "./messageTimeline";

export type MessageActionId =
  | "react"
  | "reply"
  | "copy"
  | "edit"
  | "delete"
  | "retry"
  | "more";

export interface MessageActionPolicyInput {
  message: Message;
  isOwn: boolean;
  isCoarsePointer: boolean;
  isSelectionMode?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canRetry?: boolean;
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

const getActionCandidates = ({
  message,
  isOwn,
  canEdit = false,
  canDelete = false,
  canRetry = false,
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
      id: "delete",
      score: failed && isOwn ? 68 : 18,
      railEligible: false,
      menuEligible: true,
    });
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
