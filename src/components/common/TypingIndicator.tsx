import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";

interface TypingIndicatorProps {
  userName?: string;
  userNames?: Array<string | undefined>;
  activity?: "typing" | "recording" | "uploading" | "online";
  confidence?: number;
  className?: string;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  userName,
  userNames,
  activity = "typing",
  confidence = 1,
  className,
}) => {
  const { t } = useTranslation();
  const activeNames = React.useMemo(() => {
    const names =
      userNames && userNames.length > 0 ? userNames : userName ? [userName] : [];

    return Array.from(
      new Set(
        names
          .map((name) => name?.trim())
          .filter((name): name is string => Boolean(name)),
      ),
    );
  }, [userName, userNames]);

  const label = React.useMemo(() => {
    if (activity === "recording") {
      return t("chat:typing.recording", {
        name: userName,
        defaultValue: userName ? `${userName} is recording` : "Recording",
      });
    }

    if (activity === "uploading") {
      return t("chat:typing.uploading", {
        name: userName,
        defaultValue: userName ? `${userName} is uploading` : "Uploading",
      });
    }

    if (activeNames.length === 1) {
      return t("chat:typing.user", { name: activeNames[0] });
    }

    if (activeNames.length === 2) {
      return t("chat:typing.twoUsers", {
        name1: activeNames[0],
        name2: activeNames[1],
        defaultValue: `${activeNames[0]}, ${activeNames[1]} are typing`,
      });
    }

    if (activeNames.length > 2) {
      return t("chat:typing.manyUsers", {
        name1: activeNames[0],
        name2: activeNames[1],
        count: activeNames.length - 2,
        defaultValue: `${activeNames[0]}, ${activeNames[1]} and ${
          activeNames.length - 2
        } others are typing`,
      });
    }

    return t("chat:typing.default", { defaultValue: "Typing" });
  }, [activity, activeNames, t, userName]);

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
