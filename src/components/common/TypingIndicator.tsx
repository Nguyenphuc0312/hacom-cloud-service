import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";

interface TypingIndicatorProps {
  userName?: string;
  activity?: "typing" | "recording" | "uploading" | "online";
  confidence?: number;
  className?: string;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  userName,
  activity = "typing",
  confidence = 1,
  className,
}) => {
  const { t } = useTranslation();
  const label =
    activity === "recording"
      ? t("chat:typing.recording", {
          name: userName,
          defaultValue: userName ? `${userName} is recording` : "Recording",
        })
      : activity === "uploading"
        ? t("chat:typing.uploading", {
            name: userName,
            defaultValue: userName ? `${userName} is uploading` : "Uploading",
          })
        : userName
          ? t("chat:typing.user", { name: userName })
          : t("chat:typing.default", { defaultValue: "Typing" });

  return (
    <div
      className={clsx(
        "flex items-center gap-2 text-xs text-text-muted animate-fade-in-fast",
        className,
      )}
      style={{ opacity: Math.max(0.35, Math.min(1, confidence)) }}
    >
      <span className="truncate max-w-[10rem]">{label}</span>
      <div className="flex items-center gap-[3px]">
        <span className="h-[5px] w-[5px] rounded-full bg-text-muted animate-typing-dot will-change-transform" />
        <span className="h-[5px] w-[5px] rounded-full bg-text-muted animate-typing-dot-delay-1 will-change-transform" />
        <span className="h-[5px] w-[5px] rounded-full bg-text-muted animate-typing-dot-delay-2 will-change-transform" />
      </div>
    </div>
  );
};

export default TypingIndicator;
