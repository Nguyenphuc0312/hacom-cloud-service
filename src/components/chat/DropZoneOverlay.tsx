import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { ArrowUpTrayIcon } from "@heroicons/react/24/outline";

interface DropZoneOverlayProps {
  /** Whether a file is currently being dragged over the chat area */
  isActive: boolean;
  className?: string;
}

/**
 * Full-area overlay that appears when dragging files over the chat window.
 * Provides clear visual feedback without cluttering the default UI.
 */
const DropZoneOverlayComponent: React.FC<DropZoneOverlayProps> = ({
  isActive,
  className,
}) => {
  const { t } = useTranslation();

  if (!isActive) return null;

  return (
    <div
      className={clsx(
        "absolute inset-0 z-50 flex flex-col items-center justify-center",
        "bg-surface/80 backdrop-blur-sm",
        "animate-content-fade",
        className,
      )}
      aria-live="assertive"
    >
      <div
        className={clsx(
          "flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-[#FFC857]/60 p-10",
          "bg-[#FFC857]/5",
        )}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FFC857]/15">
          <ArrowUpTrayIcon className="h-7 w-7 text-[#C41E3A] animate-bounce-subtle" />
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-text-primary">
            {t("chat:dropZone.title", { defaultValue: "Drop files here" })}
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            {t("chat:dropZone.subtitle", {
              defaultValue: "Release to upload to this conversation",
            })}
          </p>
        </div>
      </div>
    </div>
  );
};

export const DropZoneOverlay = React.memo(DropZoneOverlayComponent);

export default DropZoneOverlay;
