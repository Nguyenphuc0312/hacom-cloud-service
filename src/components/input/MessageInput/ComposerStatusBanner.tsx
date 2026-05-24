import React from "react";
import clsx from "clsx";
import type { ComposerMode } from "../../../hooks/useComposerAvailability";
import { InlineNotice } from "../../ui";
import { compactStatusToneClasses, compactStatusToneIcons } from "./constants";
import { shouldRenderCompactStatusBar } from "./utils";

interface ComposerStatusBannerProps {
  disabledReason: string;
  disabledReasonTone: "info" | "warn" | "error";
  composerMode: ComposerMode;
}

export const ComposerStatusBanner: React.FC<ComposerStatusBannerProps> = ({
  disabledReason,
  disabledReasonTone,
  composerMode,
}) => {
  const showCompact = shouldRenderCompactStatusBar(composerMode);
  const tone =
    disabledReasonTone === "error"
      ? "error"
      : disabledReasonTone === "info"
        ? "info"
        : "warn";
  const Icon = compactStatusToneIcons[tone];

  if (showCompact) {
    return (
      <div className="mb-2 flex items-start">
        <div
          className={clsx(
            "inline-flex max-w-full items-start gap-1.5 rounded-full border px-3 py-1 text-xs font-medium shadow-sm",
            compactStatusToneClasses[tone],
          )}
          role="status"
          aria-live="polite"
        >
          <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 leading-5">{disabledReason}</span>
        </div>
      </div>
    );
  }

  return (
    <InlineNotice
      tone={
        disabledReasonTone === "error"
          ? "error"
          : disabledReasonTone === "info"
            ? "info"
            : "warning"
      }
      message={disabledReason}
      className="mb-2"
    />
  );
};
