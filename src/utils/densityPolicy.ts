import type { Conversation } from "../types";
import type { ChatDensity } from "../stores/uiStore";

export type ResolvedChatDensity = Exclude<ChatDensity, "auto">;
export type ChatLayoutState = "normal" | "with-panel" | "mobile";
export type ChatLayoutProfile =
  | "desktop-wide"
  | "laptop"
  | "mobile-compact";

export interface DensityPolicyInput {
  preference: ChatDensity;
  viewportWidth: number;
  viewportHeight: number;
  layoutState: ChatLayoutState;
  conversationType: Conversation["type"];
}

export const resolveChatLayoutProfile = (
  viewportWidth: number,
  layoutState: ChatLayoutState,
): ChatLayoutProfile => {
  if (layoutState === "mobile") {
    return "mobile-compact";
  }

  if (viewportWidth < 1440) {
    return "laptop";
  }

  return "desktop-wide";
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const resolveChatDensity = ({
  preference,
  viewportWidth,
  viewportHeight,
  layoutState,
}: DensityPolicyInput): ResolvedChatDensity => {
  if (preference === "compact" || preference === "comfortable" || preference === "expanded") {
    return preference;
  }
  const compactScore =
    (layoutState === "mobile" ? 28 : 0) +
    (layoutState === "with-panel" ? 24 : 0) +
    (viewportWidth < 768 ? 20 : 0) +
    (viewportHeight < 760 ? 12 : 0);
  const expandedScore =
    (layoutState === "normal" && viewportWidth >= 1440 ? 18 : 0) +
    (layoutState === "with-panel" ? -18 : 0);

  const compactAdvantage = compactScore - expandedScore;
  const expandedAdvantage = expandedScore - compactScore;

  if (compactAdvantage >= 16) return "compact";
  if (expandedAdvantage >= 16) return "expanded";

  const balanceScore = clamp(
    (viewportWidth >= 1400 ? 8 : 0) +
      (viewportHeight >= 900 ? 6 : 0) +
      (layoutState === "normal" ? 4 : 0),
    0,
    20,
  );
  return balanceScore >= 11 ? "expanded" : "comfortable";
};
