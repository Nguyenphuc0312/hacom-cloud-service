import type { Conversation, Message } from "../types";
import type { ChatDensity } from "../stores/uiStore";

export type ResolvedChatDensity = Exclude<ChatDensity, "auto">;

export interface DensityPolicyInput {
  preference: ChatDensity;
  viewportWidth: number;
  viewportHeight: number;
  messages: Message[];
  conversationType: Conversation["type"];
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const getRecentMessages = (messages: Message[]): Message[] =>
  messages.slice(Math.max(0, messages.length - 24));

const getAverageTextLength = (messages: Message[]): number => {
  if (messages.length === 0) return 0;
  const total = messages.reduce(
    (sum, message) => sum + (message.content?.trim().length ?? 0),
    0,
  );
  return total / messages.length;
};

const getRichMessageRatio = (messages: Message[]): number => {
  if (messages.length === 0) return 0;
  const richCount = messages.filter(
    (message) =>
      (message.attachments?.length ?? 0) > 0 ||
      (message.content?.length ?? 0) > 220,
  ).length;
  return richCount / messages.length;
};

export const resolveChatDensity = ({
  preference,
  viewportWidth,
  viewportHeight,
  messages,
}: DensityPolicyInput): ResolvedChatDensity => {
  if (preference === "compact" || preference === "comfortable" || preference === "expanded") {
    return preference;
  }

  const recentMessages = getRecentMessages(messages);
  const avgLength = getAverageTextLength(recentMessages);
  const richRatio = getRichMessageRatio(recentMessages);
  const compactScore =
    (viewportWidth < 768 ? 26 : 0) +
    (viewportHeight < 760 ? 12 : 0) +
    (avgLength > 0 && avgLength < 42 ? 18 : 0) +
    (recentMessages.length >= 18 ? 12 : 0);
  const expandedScore =
    (viewportWidth > 1280 ? 24 : 0) +
    (avgLength > 180 ? 26 : 0) +
    (richRatio > 0.35 ? 18 : 0);

  const compactAdvantage = compactScore - expandedScore;
  const expandedAdvantage = expandedScore - compactScore;

  if (compactAdvantage >= 16) return "compact";
  if (expandedAdvantage >= 16) return "expanded";

  const balanceScore = clamp(avgLength / 24 + richRatio * 20, 0, 20);
  return balanceScore >= 11 ? "expanded" : "comfortable";
};
