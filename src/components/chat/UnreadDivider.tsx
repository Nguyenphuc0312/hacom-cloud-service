/**
 * @fileoverview UnreadDivider
 * A clear, enterprise-styled divider that separates read from unread messages.
 */

import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { ChatDensity } from "../../stores/uiStore";
import { getTimelineDensityContract } from "./timelineDensity";

interface UnreadDividerProps {
  density?: ChatDensity;
  className?: string;
}

export const UnreadDivider: React.FC<UnreadDividerProps> = ({
  density,
  className,
}) => {
  const { t } = useTranslation();
  const contract = getTimelineDensityContract(density);

  return (
    <div
      className={clsx("flex items-center", contract.unreadDivider.outer, className)}
      role="separator"
      aria-label={t("chat:message.unreadDivider", {
        defaultValue: "New messages",
      })}
    >
      <span
        className={clsx("h-px flex-1", contract.unreadDivider.line)}
        aria-hidden="true"
      />
      <span
        className={clsx(
          "shrink-0 rounded-full border border-border/70 bg-[hsl(var(--chat-panel-bg))/0.96] text-text-secondary",
          contract.unreadDivider.pill,
        )}
      >
        {t("chat:message.unreadDivider", { defaultValue: "New messages" })}
      </span>
      <span
        className={clsx("h-px flex-1", contract.unreadDivider.line)}
        aria-hidden="true"
      />
    </div>
  );
};

export default UnreadDivider;
