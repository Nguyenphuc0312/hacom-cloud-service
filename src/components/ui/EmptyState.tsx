/**
 * @fileoverview Empty State components
 */

import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  ChatBubbleLeftRightIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
  InboxIcon,
  ExclamationTriangleIcon,
  DocumentArrowUpIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { Button } from "./Button";
import { emitCommandPaletteOpen } from "../../lib/commandPalette";
import { ROUTE_PATHS } from "../../router/paths";

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
      {icon && <div className="mb-3 h-12 w-12 text-text-muted/55">{icon}</div>}

      <h3 className="mb-1.5 text-sm font-semibold text-text-primary">
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
  const navigate = useNavigate();
  const openShortcut =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform)
      ? "Cmd K"
      : "Ctrl K";

  return (
    <section className="chat-background flex flex-1 overflow-y-auto px-[clamp(16px,2.4vw,40px)] py-[clamp(20px,4vw,56px)] text-text-secondary">
      <div className="mx-auto grid w-full max-w-[var(--hc-empty-max-width)] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-xl border border-border bg-surface p-6 text-left shadow-xs sm:p-7">
          <div className="flex flex-col gap-5 md:flex-row md:items-start">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ChatBubbleLeftRightIcon className="h-9 w-9" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-semibold leading-8 text-text-primary">
                Chào mừng đến Hacom Chat
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                Nền tảng liên lạc nội bộ bảo mật, tốc độ cao dành cho Hacom Holding.
              </p>
              <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface-overlay px-3 py-1 text-xs font-medium text-text-muted">
                <ShieldCheckIcon className="h-4 w-4" aria-hidden="true" />
                Mã hóa đầu cuối · Chỉ sử dụng nội bộ
              </p>
            </div>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onNewChat}
            className="min-h-[132px] rounded-lg border border-border bg-surface-overlay p-4 text-left transition-micro hover:border-primary/35 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30"
          >
            <ChatBubbleLeftRightIcon className="mb-3 h-6 w-6 text-primary" />
            <p className="text-sm font-semibold text-text-primary">
              Bắt đầu cuộc trò chuyện
            </p>
            <p className="mt-1 text-xs leading-5 text-text-muted">
              Tìm đồng nghiệp hoặc tạo nhóm trao đổi mới.
            </p>
          </button>
            <button
              type="button"
              onClick={onNewChat}
              className="min-h-[132px] rounded-lg border border-border bg-surface-overlay p-4 text-left transition-micro hover:border-primary/35 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30"
            >
              <UserGroupIcon className="mb-3 h-6 w-6 text-primary" />
              <p className="text-sm font-semibold text-text-primary">
                Tạo nhóm mới
              </p>
              <p className="mt-1 text-xs leading-5 text-text-muted">
                Mở bộ chọn thành viên và đặt tên nhóm theo luồng hiện có.
              </p>
            </button>
            <div className="min-h-[132px] rounded-lg border border-border bg-surface-overlay p-4 text-left">
              <DocumentArrowUpIcon className="mb-3 h-6 w-6 text-primary" />
              <p className="text-sm font-semibold text-text-primary">
                Chia sẻ tệp an toàn
              </p>
              <p className="mt-1 text-xs leading-5 text-text-muted">
                Gửi tài liệu, hình ảnh và nội dung công việc trong cuộc trò chuyện.
              </p>
            </div>
            <button
              type="button"
              onClick={emitCommandPaletteOpen}
              className="min-h-[132px] rounded-lg border border-border bg-surface-overlay p-4 text-left transition-micro hover:border-primary/35 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30"
            >
              <MagnifyingGlassIcon className="mb-3 h-6 w-6 text-primary" />
              <p className="text-sm font-semibold text-text-primary">
                Tìm kiếm nhanh
              </p>
              <p className="mt-1 text-xs leading-5 text-text-muted">
                Mở tìm kiếm bằng phím tắt {openShortcut} để chuyển nhanh giữa các mục.
              </p>
            </button>
          </div>
        </div>

        <aside className="grid gap-3">
          <div className="rounded-xl border border-border bg-surface p-5 shadow-xs">
            <p className="text-sm font-semibold text-text-primary">
              Hoàn thiện hồ sơ của bạn
            </p>
            <p className="mt-2 text-xs leading-5 text-text-muted">
              Cập nhật thông tin để đồng nghiệp nhận diện nhanh hơn trong danh bạ và nhóm.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-4 w-full justify-center"
              onClick={() => navigate(ROUTE_PATHS.SETTINGS)}
            >
              Đi tới hồ sơ
            </Button>
          </div>

          <div className="rounded-xl border border-border bg-surface p-5 shadow-xs">
            <p className="text-sm font-semibold text-text-primary">Mẹo nhanh</p>
            <dl className="mt-3 space-y-3 text-xs leading-5 text-text-muted">
              <div className="flex items-center justify-between gap-3">
                <dt>Gửi tin nhắn</dt>
                <dd className="rounded border border-border bg-surface-overlay px-2 py-0.5 font-medium text-text-secondary">
                  Enter
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Xuống dòng</dt>
                <dd className="rounded border border-border bg-surface-overlay px-2 py-0.5 font-medium text-text-secondary">
                  Shift Enter
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-border bg-surface p-5 shadow-xs">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-text-primary">Trạng thái</p>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2 py-1 text-xs font-medium text-success">
                <span className="h-2 w-2 rounded-full bg-success" />
                Online
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-text-muted">
              Chọn một cuộc trò chuyện ở danh sách bên trái để bắt đầu làm việc.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
};

export default EmptyState;
