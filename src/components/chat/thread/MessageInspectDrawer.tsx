import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  ClipboardDocumentIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import type { Message } from "../../../types";

interface MessageInspectDrawerProps {
  message: Message | null;
  onClose: () => void;
  className?: string;
}

const formatValue = (value: unknown): string => {
  if (value === null) {
    return "null";
  }

  if (value === undefined) {
    return "undefined";
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const FieldRow: React.FC<{
  label: string;
  value: unknown;
  multiline?: boolean;
}> = ({ label, value, multiline = false }) => {
  if (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  ) {
    return null;
  }

  return (
    <div className="space-y-1 border-b border-border/60 pb-3 last:border-b-0 last:pb-0">
      <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
        {label}
      </div>
      {multiline ? (
        <pre className="overflow-x-auto rounded-lg bg-surface-overlay px-3 py-2 text-[12px] leading-5 text-text-secondary">
          {formatValue(value)}
        </pre>
      ) : (
        <div className="text-sm leading-5 text-text-primary">{formatValue(value)}</div>
      )}
    </div>
  );
};

export const MessageInspectDrawer: React.FC<MessageInspectDrawerProps> = ({
  message,
  onClose,
  className,
}) => {
  const { t } = useTranslation();

  if (!message) {
    return null;
  }

  const technicalPayload = {
    attachments: message.attachments ?? [],
    metadata: message.metadata ?? null,
    mentions: message.mentions ?? [],
    reactions: message.reactions ?? [],
    readBy: message.readBy ?? [],
    replyTo: message.replyTo ?? null,
    replyToMessage: message.replyToMessage ?? null,
    forwardedFrom: message.forwardedFrom ?? null,
  };

  return (
    <div
      className={clsx(
        "flex h-full flex-col bg-[hsl(var(--chat-panel-bg))]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border/70 px-5 py-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
            {t("chat:message.actions.inspect", {
              defaultValue: "Message inspect",
            })}
          </p>
          <h3 className="truncate text-base font-semibold text-text-primary">
            {message.senderName || message.senderId}
          </h3>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
          aria-label={t("common:actions.close")}
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <FieldRow label="ID" value={message.id} />
        <FieldRow label="Stable ID" value={message.stableId} />
        <FieldRow label="Client Message ID" value={message.clientMessageId} />
        <FieldRow label="Conversation ID" value={message.conversationId} />
        <FieldRow label="Sender ID" value={message.senderId} />
        <FieldRow label="Type" value={message.type} />
        <FieldRow label="Status" value={message.status} />
        <FieldRow label="Send State" value={message.sendState} />
        <FieldRow label="Created At" value={message.createdAt} />
        <FieldRow label="Updated At" value={message.updatedAt} />
        <FieldRow label="Edited At" value={message.editedAt} />
        <FieldRow label="Content" value={message.content} multiline />
        <FieldRow label="Technical Payload" value={technicalPayload} multiline />
      </div>

      <div className="border-t border-border/70 px-5 py-4">
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(formatValue(message))}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
        >
          <ClipboardDocumentIcon className="h-4 w-4" />
          {t("chat:message.actions.copyDetails", {
            defaultValue: "Copy payload",
          })}
        </button>
      </div>
    </div>
  );
};

export default MessageInspectDrawer;
