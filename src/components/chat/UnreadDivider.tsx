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
      className={clsx("my-5 flex items-center justify-center", className)}
      role="separator"
      aria-label={t("chat:message.unreadDivider", {
        defaultValue: "New messages",
      })}
    >
      <span className="shrink-0 rounded-full border border-primary/18 bg-primary/12 px-3.5 py-1 text-[11px] font-semibold tracking-[0.01em] text-primary">
        {t("chat:message.unreadDivider", { defaultValue: "New messages" })}
      </span>
    </div>
  );
};

export default UnreadDivider;
