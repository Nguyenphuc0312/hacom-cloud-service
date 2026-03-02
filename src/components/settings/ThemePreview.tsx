/**
 * @fileoverview Live preview of theme + font size + density inside Settings
 * Shows a mini chat mockup that reacts in real-time to setting changes.
 */

import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { FontSize, DisplayDensity } from "../../settings/types";

interface ThemePreviewProps {
  fontSize: FontSize;
  density: DisplayDensity;
  className?: string;
}

const FONT_SIZE_MAP: Record<FontSize, string> = {
  small: "text-xs",
  medium: "text-sm",
  large: "text-base",
};

const DENSITY_MAP: Record<DisplayDensity, string> = {
  compact: "px-2.5 py-1.5",
  comfortable: "px-3.5 py-2.5",
};

export const ThemePreview: React.FC<ThemePreviewProps> = ({
  fontSize,
  density,
  className,
}) => {
  const { t } = useTranslation("settings");
  const bubblePadding = DENSITY_MAP[density];
  const bubbleFont = FONT_SIZE_MAP[fontSize];

  return (
    <div
      className={clsx(
        "overflow-hidden rounded-xl border border-border",
        className,
      )}
    >
      {/* Mini header */}
      <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2">
        <div className="h-7 w-7 rounded-full bg-primary/20" />
        <div>
          <div className="text-xs font-medium text-text-primary">
            {t("preview.contact")}
          </div>
          <div className="text-[10px] text-text-muted">
            {t("common:status.online")}
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="chat-background space-y-2 p-3">
        {/* Received bubble */}
        <div className="flex justify-start">
          <div
            className={clsx(
              "max-w-[75%] rounded-2xl rounded-bl-md bg-surface-raised shadow-xs",
              bubblePadding,
            )}
          >
            <p className={clsx(bubbleFont, "text-text-primary")}>
              {t("preview.received")}
            </p>
            <span className="mt-0.5 block text-right text-[10px] text-text-muted">
              10:30
            </span>
          </div>
        </div>

        {/* Sent bubble */}
        <div className="flex justify-end">
          <div
            className={clsx(
              "max-w-[75%] rounded-2xl rounded-br-md bg-primary shadow-xs",
              bubblePadding,
            )}
          >
            <p className={clsx(bubbleFont, "text-text-inverse")}>
              {t("preview.sent")}
            </p>
            <span className="mt-0.5 block text-right text-[10px] text-text-inverse/70">
              10:31
            </span>
          </div>
        </div>

        {/* Received bubble */}
        <div className="flex justify-start">
          <div
            className={clsx(
              "max-w-[75%] rounded-2xl rounded-bl-md bg-surface-raised shadow-xs",
              bubblePadding,
            )}
          >
            <p className={clsx(bubbleFont, "text-text-primary")}>
              {t("preview.receivedTwo")}
            </p>
            <span className="mt-0.5 block text-right text-[10px] text-text-muted">
              10:32
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThemePreview;
