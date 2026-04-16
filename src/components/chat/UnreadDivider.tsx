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
      className={clsx("my-4 flex items-center gap-3", className)}
      role="separator"
      aria-label={t("chat:message.unreadDivider", {
        defaultValue: "New messages",
      })}
    >
      <span className="h-px flex-1 bg-primary/15" aria-hidden="true" />
      <span className="shrink-0 rounded-full border border-primary/14 bg-primary/8 px-3 py-1 text-[11px] font-semibold tracking-[0.01em] text-primary/90">
        {t("chat:message.unreadDivider", { defaultValue: "New messages" })}
      </span>
      <span className="h-px flex-1 bg-primary/15" aria-hidden="true" />
    </div>
  );
};

export default UnreadDivider;
