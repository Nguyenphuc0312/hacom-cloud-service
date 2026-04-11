/**
 * @fileoverview Empty State components
 */

import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  ChatBubbleLeftRightIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
  InboxIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { Button } from "./Button";
import { emitCommandPaletteOpen } from "../../lib/commandPalette";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
    variant?: "primary" | "secondary" | "outline";
  };
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  action,
  className,
}) => {
  return (
    <div
      className={clsx(
        "flex flex-col items-center justify-center px-6 py-8 text-center",
        className,
      )}
    >
      {icon && <div className="mb-4 h-20 w-20 text-text-muted/55">{icon}</div>}

      <h3 className="mb-2 text-title-sm text-text-primary">{title}</h3>

      {description && (
        <p className="mb-5 max-w-sm text-body-sm text-text-secondary">
          {description}
        </p>
      )}

      {action && (
        <Button variant={action.variant || "primary"} onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
};

export const EmptyConversations: React.FC<{
  onNewChat?: () => void;
}> = ({ onNewChat }) => {
  const { t } = useTranslation();

  return (
    <EmptyState
      icon={<ChatBubbleLeftRightIcon className="h-full w-full" />}
      title={t("chat:empty.noChatTitle")}
      description={t("chat:empty.noChatDescription")}
      action={
        onNewChat
          ? {
              label: t("chat:empty.startNewChat"),
              onClick: onNewChat,
            }
          : undefined
      }
    />
  );
};

export const EmptyMessages: React.FC = () => {
  const { t } = useTranslation();

  return (
    <EmptyState
      icon={<InboxIcon className="h-full w-full" />}
      title={t("chat:empty.messagesTitle")}
      description={t("chat:empty.messagesDescription")}
    />
  );
};

export const EmptySearchResults: React.FC<{
  query?: string;
  onClear?: () => void;
}> = ({ query, onClear }) => {
  const { t } = useTranslation();

  return (
    <EmptyState
      icon={<MagnifyingGlassIcon className="h-full w-full" />}
      title={t("chat:empty.searchTitle")}
      description={
        query
          ? t("chat:empty.searchDescription", { query })
          : t("chat:empty.searchDescriptionEmpty")
      }
      action={
        onClear
          ? {
              label: t("chat:empty.clearSearch"),
              onClick: onClear,
              variant: "outline",
            }
          : undefined
      }
    />
  );
};

export const EmptyMembers: React.FC = () => {
  const { t } = useTranslation();

  return (
    <EmptyState
      icon={<UserGroupIcon className="h-full w-full" />}
      title={t("profile:groupInfo.tabs.members")}
      description={t("profile:groupInfo.addMember")}
    />
  );
};

export const ErrorState: React.FC<{
  title?: string;
  message?: string;
  onRetry?: () => void;
}> = ({ title, message, onRetry }) => {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t("error:generic.unexpected");
  const resolvedMessage = message ?? t("error:generic.requestFailed");

  return (
    <EmptyState
      icon={
        <ExclamationTriangleIcon className="h-full w-full text-danger/55" />
      }
      title={resolvedTitle}
      description={resolvedMessage}
      action={
        onRetry
          ? {
              label: t("common:actions.retry"),
              onClick: onRetry,
              variant: "primary",
            }
          : undefined
      }
    />
  );
};

interface NoChatSelectedProps {
  onNewChat?: () => void;
}

export const NoChatSelected: React.FC<NoChatSelectedProps> = ({
  onNewChat,
}) => {
  const { t } = useTranslation();
  const openShortcut =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform)
      ? "Cmd K"
      : "Ctrl K";

  return (
    <section className="chat-background flex flex-1 flex-col items-center justify-center px-6 py-8 text-text-secondary">
      <div className="mb-5 h-24 w-24 text-text-muted/60 sm:mb-6 sm:h-32 sm:w-32">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      </div>
      <h2 className="mb-2 text-title text-text-primary sm:text-title">
        {t("chat:empty.noChatTitle")}
      </h2>
      <p className="mb-5 max-w-sm text-center text-body-sm text-text-secondary">
        {t("chat:empty.noChatDescription")}
      </p>
      {onNewChat && (
        <Button type="button" onClick={onNewChat} size="md">
          {t("chat:empty.startNewChat")}
        </Button>
      )}

      <button
        type="button"
        onClick={emitCommandPaletteOpen}
        className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-surface/90 px-3 py-1.5 text-caption text-text-muted transition-micro hover:bg-surface-hover hover:text-text-secondary"
      >
        <span>
          {t("common:actions.search", { defaultValue: "Quick jump" })}
        </span>
        <span className="rounded border border-border px-1.5 py-0.5 font-medium">
          {openShortcut}
        </span>
      </button>
    </section>
  );
};

export default EmptyState;
