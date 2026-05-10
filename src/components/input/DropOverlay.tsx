/**
 * @fileoverview DropOverlay — full-area overlay shown when dragging files
 * over the chat window.
 *
 * Features:
 * - Animated entry with backdrop blur
 * - ESC key to dismiss
 * - Accessible: aria-live, role="region"
 * - Shows file count hint when files are being dragged
 */

import React, { useCallback, useEffect } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { ArrowUpTrayIcon } from "@heroicons/react/24/outline";

interface DropOverlayProps {
  /** Whether a file drag is currently active */
  isActive: boolean;
  /** Called when ESC is pressed or overlay is clicked */
  onDismiss?: () => void;
  className?: string;
}

const DropOverlayComponent: React.FC<DropOverlayProps> = ({
  isActive,
  onDismiss,
  className,
}) => {
  const { t } = useTranslation();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && isActive) {
        e.preventDefault();
        onDismiss?.();
      }
    },
    [isActive, onDismiss],
  );

  useEffect(() => {
    if (!isActive) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isActive, handleKeyDown]);

  if (!isActive) return null;

  return (
    <div
      className={clsx(
        "absolute inset-0 z-50 flex flex-col items-center justify-center",
        "bg-surface/80 backdrop-blur-sm",
        "animate-content-fade",
        className,
      )}
      role="region"
      aria-live="assertive"
      aria-label={t("chat:dropZone.title", { defaultValue: "Drop files here" })}
    >
      <div
        className={clsx(
          "flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-primary/50 p-10",
          "bg-primary/5",
          "transition-transform",
        )}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <ArrowUpTrayIcon className="h-7 w-7 text-primary animate-bounce-subtle" />
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-text-primary">
            {t("chat:dropZone.title", { defaultValue: "Drop files here" })}
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            {t("chat:dropZone.subtitle", {
              defaultValue: "Release to attach files to this conversation",
            })}
          </p>
          <p className="mt-2 text-xs text-text-muted">
            {t("chat:dropZone.limits", {
              defaultValue:
                "Tối đa 10 tệp · Ảnh 37.5 MB · Tài liệu 150 MB · Video 300 MB",
            })}
          </p>
        </div>
      </div>
    </div>
  );
};

export const DropOverlay = React.memo(DropOverlayComponent);

export default DropOverlay;
