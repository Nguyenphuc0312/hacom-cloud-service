import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { XMarkIcon } from "@heroicons/react/24/outline";
import type { Message } from "../../../types";

interface ComposerEditBannerProps {
  editingMessage: Message;
  onCancelEdit?: () => void;
}

export const ComposerEditBanner: React.FC<ComposerEditBannerProps> = ({
  editingMessage,
  onCancelEdit,
}) => {
  const { t } = useTranslation();

  return (
    <div className="mb-2 flex items-center justify-between rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 animate-slide-up-fade">
      <div className="flex min-w-0 items-center gap-2">
        <div className="h-7 w-1 rounded-full bg-warning" />
        <div className="min-w-0">
          <p className="text-xs font-medium text-warning">
            {t("chat:composer.editing")}
          </p>
          <p className="truncate text-xs text-warning">
            {editingMessage.content}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onCancelEdit}
        className={clsx(
          "rounded-full p-1 transition-colors hover:bg-warning/20",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
        )}
        aria-label={t("chat:composer.cancelEdit")}
      >
        <XMarkIcon className="h-4 w-4 text-warning" />
      </button>
    </div>
  );
};
