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

// Lazy: widget lịch tuần kéo theo CẢ cây lịch (EventDetailModal +
// MeetingFormModal ~48 kB). EmptyState là primitive dùng chung khắp app, nên
// import tĩnh sẽ nhét chỗ đó vào chunk entry — tải cả ở màn login, nơi không
// đời nào thấy cái lịch. Widget nằm dưới màn hình đầu, lazy không đổi first paint.
const WeeklyCalendarWidget = React.lazy(() =>
  import("../../features/calendar/components/WeeklyCalendarWidget").then((m) => ({
    default: m.WeeklyCalendarWidget,
  })),
);

const DocumentWorkspace = React.lazy(() =>
  import("../../features/dms/DocumentWorkspace"),
);

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
        "flex flex-col items-center justify-center px-5 py-5 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-overlay text-[#1565C0] ring-1 ring-inset ring-border/60">
          <div className="h-7 w-7">{icon}</div>
        </div>
      )}

      <h3 className="mb-1.5 text-base font-semibold text-text-primary">
        {title}
      </h3>

      {description && (
        <p className="mb-4 max-w-xs text-sm leading-5 text-text-secondary">
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
    <div role="alert" aria-live="assertive">
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
    </div>
  );
};

interface NoChatSelectedProps {
  onNewChat?: () => void;
}

export const NoChatSelected: React.FC<NoChatSelectedProps> = () => {
  return (
    <section className="chat-background flex flex-1 overflow-y-auto px-[clamp(12px,2.5vw,40px)] py-[clamp(12px,2.5vw,32px)] text-text-secondary">
      {/* h-fit: as a flex child of a scrolling column this box would otherwise be
          stretched/squashed to the section height, clipping the calendar's
          tallest day mid-event instead of letting the section scroll. */}
      <div className="mx-auto flex h-fit w-full max-w-[1800px] flex-col items-center">
        <React.Suspense fallback={<div className="skeleton h-[520px] w-full rounded-xl" />}>
          <DocumentWorkspace />
        </React.Suspense>

        {/* Fallback giữ đúng khung + chiều cao của widget để tải xong không
            giật layout (khớp wrapper thật trong WeeklyCalendarWidget). */}
        <React.Suspense
          fallback={
            <div className="skeleton mt-5 h-[420px] w-full rounded-xl" />
          }
        >
          <WeeklyCalendarWidget />
        </React.Suspense>
      </div>
    </section>
  );
};

export default EmptyState;
