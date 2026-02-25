/**
 * @fileoverview Empty State components
 */

import React from "react";
import clsx from "clsx";
import {
  ChatBubbleLeftRightIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
  InboxIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { Button } from "./Button";

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
        "flex flex-col items-center justify-center px-6 py-12 text-center",
        className,
      )}
    >
      {icon && <div className="mb-4 h-20 w-20 text-text-muted/55">{icon}</div>}

      <h3 className="mb-2 text-lg font-medium text-text-primary">{title}</h3>

      {description && (
        <p className="mb-6 max-w-sm text-sm text-text-secondary">{description}</p>
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
  return (
    <EmptyState
      icon={<ChatBubbleLeftRightIcon className="h-full w-full" />}
      title="No conversations yet"
      description="Start a new chat to connect with your team."
      action={
        onNewChat
          ? {
              label: "Start chat",
              onClick: onNewChat,
            }
          : undefined
      }
    />
  );
};

export const EmptyMessages: React.FC = () => {
  return (
    <EmptyState
      icon={<InboxIcon className="h-full w-full" />}
      title="No messages"
      description="Send the first message to start this conversation."
    />
  );
};

export const EmptySearchResults: React.FC<{
  query?: string;
  onClear?: () => void;
}> = ({ query, onClear }) => {
  return (
    <EmptyState
      icon={<MagnifyingGlassIcon className="h-full w-full" />}
      title="No result found"
      description={
        query
          ? `No result matches "${query}".`
          : "No result found. Try another keyword."
      }
      action={
        onClear
          ? {
              label: "Clear search",
              onClick: onClear,
              variant: "outline",
            }
          : undefined
      }
    />
  );
};

export const EmptyMembers: React.FC = () => {
  return (
    <EmptyState
      icon={<UserGroupIcon className="h-full w-full" />}
      title="No members"
      description="Add members to start collaborating."
    />
  );
};

export const ErrorState: React.FC<{
  title?: string;
  message?: string;
  onRetry?: () => void;
}> = ({
  title = "Something went wrong",
  message = "Cannot load data right now. Please try again.",
  onRetry,
}) => {
  return (
    <EmptyState
      icon={<ExclamationTriangleIcon className="h-full w-full text-danger/55" />}
      title={title}
      description={message}
      action={
        onRetry
          ? {
              label: "Try again",
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
  return (
    <section className="chat-background flex flex-1 flex-col items-center justify-center px-6 py-10 text-text-secondary">
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
      <h2 className="mb-2 text-lg font-semibold text-text-primary sm:text-xl">
        Select a conversation
      </h2>
      <p className="mb-5 max-w-sm text-center text-sm leading-6 text-text-secondary">
        Choose a chat from the sidebar or start a new conversation.
      </p>
      {onNewChat && (
        <button
          type="button"
          onClick={onNewChat}
          className="min-h-11 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary/90"
        >
          Start new chat
        </button>
      )}
    </section>
  );
};

export default EmptyState;

