import React from "react";
import clsx from "clsx";
import type { Message } from "../../types";

interface SystemMessageProps {
  message: Message;
  className?: string;
}

export const SystemMessage: React.FC<SystemMessageProps> = ({
  message,
  className,
}) => {
  const metadata =
    message.metadata && typeof message.metadata === "object"
      ? (message.metadata as Record<string, unknown>)
      : null;
  const severityRaw =
    typeof metadata?.severity === "string"
      ? metadata.severity
      : typeof metadata?.level === "string"
        ? metadata.level
        : typeof metadata?.variant === "string"
          ? metadata.variant
          : "info";
  const severity =
    severityRaw === "warn" || severityRaw === "warning"
      ? "warn"
      : severityRaw === "error"
        ? "error"
        : "info";

  return (
    <div className={clsx("my-4 flex justify-center", className)}>
      <span
        className={clsx(
          "rounded-full border px-3.5 py-1 text-[11px] backdrop-blur",
          severity === "error"
            ? "border-danger/25 bg-danger/10 text-danger"
            : severity === "warn"
              ? "border-warning/25 bg-warning/12 text-warning"
              : "text-text-secondary",
        )}
        style={
          severity === "info"
            ? {
                backgroundColor: "hsl(var(--color-chat-pill) / 0.94)",
                borderColor: "hsl(var(--color-chat-pill-border) / 0.7)",
              }
            : undefined
        }
      >
        {message.content}
      </span>
    </div>
  );
};

export default SystemMessage;
