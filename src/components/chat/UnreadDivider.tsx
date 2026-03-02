/**
 * @fileoverview UnreadDivider
 * A clear, enterprise-styled divider that separates read from unread messages.
 */

import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";

interface UnreadDividerProps {
  className?: string;
}

export const UnreadDivider: React.FC<UnreadDividerProps> = ({ className }) => {
  const { t } = useTranslation();

  return (
    <div
      className={clsx("my-3 flex items-center gap-3", className)}
      role="separator"
      aria-label={t("chat:message.unreadDivider", {
        defaultValue: "New messages",
      })}
    >
      <div className="h-px flex-1 bg-primary/40" />
      <span className="shrink-0 rounded-full border border-primary/30 bg-primary/8 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
        {t("chat:message.unreadDivider", { defaultValue: "New messages" })}
      </span>
      <div className="h-px flex-1 bg-primary/40" />
    </div>
  );
};

export default UnreadDivider;
