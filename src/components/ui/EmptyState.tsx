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
} from "@heroicons/react/24/outline";
import { Button } from "./Button";
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

const WELCOME_SLIDES = [
  {
    src: "/hacom-tower.jpg",
    alt: "Hacom Tower",
    title: "Hacom Tower",
    description: "Dự án căn hộ thương mại tại Khánh Hòa",
    fit: "cover",
  },
  {
    src: "/hacom-riverside.jpg",
    alt: "Hacom Riverside",
    title: "Hacom Riverside",
    description: "Dự án tại Lào Cai",
    fit: "cover",
  },
  {
    src: "/hacom-wind.jpg",
    alt: "Nhà máy điện gió Hòa Bình 5",
    title: "Điện gió Hòa Bình 5",
    description: "Năng lượng tái tạo",
    fit: "cover",
  },
  {
    src: "/hacom-imperial-dalat.jpg",
    alt: "Khách sạn Imperial Palace Đà Lạt",
    title: "Imperial Palace Đà Lạt",
    description: "Khách sạn nghỉ dưỡng",
    fit: "cover",
  },
];

export const NoChatSelected: React.FC<NoChatSelectedProps> = ({
  onNewChat,
}) => {
  const navigate = useNavigate();
  const [activeSlideIndex, setActiveSlideIndex] = React.useState(0);
  const activeSlide = WELCOME_SLIDES[activeSlideIndex];

  React.useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActiveSlideIndex((currentIndex) =>
        currentIndex === WELCOME_SLIDES.length - 1 ? 0 : currentIndex + 1,
      );
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <section className="chat-background flex flex-1 overflow-y-auto px-[clamp(16px,3vw,48px)] py-[clamp(18px,3.5vw,44px)] text-text-secondary">
      <div className="mx-auto flex w-full max-w-[860px] flex-col items-center">
        <figure className="w-full max-w-[520px] overflow-hidden rounded-xl bg-surface shadow-[0_18px_46px_rgba(15,23,42,0.18)]">
          <div className="relative aspect-[16/8.7] w-full overflow-hidden bg-slate-100">
            {WELCOME_SLIDES.map((slide, index) => (
              <img
                key={slide.src}
                src={slide.src}
                alt={slide.alt}
                className={clsx(
                  "absolute inset-0 h-full w-full transition-opacity duration-500 ease-out",
                  slide.fit === "contain" ? "object-contain" : "object-cover",
                  index === activeSlideIndex ? "opacity-100" : "opacity-0",
                )}
                loading={index === 0 ? "eager" : "lazy"}
              />
            ))}
          </div>
          <figcaption className="grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2">
            <strong className="min-w-0 truncate text-xs font-bold text-text-primary">
              {activeSlide.title}
            </strong>
            <span className="min-w-0 truncate text-right text-xs font-semibold text-text-muted">
              {activeSlide.description}
            </span>
          </figcaption>
        </figure>

        <div className="mt-7 text-center">
          <h2 className="text-[clamp(32px,4vw,44px)] font-extrabold leading-tight text-text-primary">
            Chào mừng đến với <span className="text-primary">Hacom Chat</span>
          </h2>
          <div className="mx-auto mt-4 max-w-[720px] text-[17px] font-medium leading-7 text-text-secondary inline-block text-left">
            <p>Nền tảng trò chuyện nội bộ an toàn, tốc độ cao dành cho nhân sự Hacom Holdings.</p>
            <p>Kết nối, cộng tác và điều phối công việc hiệu quả.</p>
          </div>
        </div>

        <div className="mt-8 grid w-full max-w-[720px] gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={onNewChat}
            className="flex min-h-[112px] gap-4 rounded-lg border border-border bg-surface p-5 text-left shadow-elev1 transition-micro hover:border-primary/35 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600 shadow-sm">
              <ChatBubbleLeftRightIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-text-primary">
                Bắt đầu trò chuyện
              </p>
              <p className="mt-2 text-sm font-medium leading-5 text-text-secondary">
                Tìm kiếm đồng nghiệp để nhắn tin hoặc tạo nhóm chat mới cho đội nhóm
                của bạn.
              </p>
            </div>
          </button>

          <div className="flex min-h-[112px] gap-4 rounded-lg border border-border bg-surface p-5 text-left shadow-elev1">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 shadow-sm">
              <DocumentArrowUpIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-text-primary">
                Chia sẻ file an toàn
              </p>
              <p className="mt-2 text-sm font-medium leading-5 text-text-secondary">
                Kéo thả tài liệu, bài thuyết trình và hình ảnh trực tiếp vào bất kỳ
                cửa sổ chat nào.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex w-full max-w-[720px] items-center justify-between gap-4 rounded-lg border border-border bg-surface px-5 py-4 shadow-elev1">
          <div className="min-w-0">
            <p className="text-sm font-bold text-text-primary">
              Hoàn thiện hồ sơ
            </p>
            <p className="mt-1.5 text-sm font-medium leading-5 text-text-secondary">
              Cập nhật chức danh, phòng ban và ảnh đại diện chuyên nghiệp để đồng
              nghiệp dễ nhận diện bạn.
            </p>
          </div>
          <button
            type="button"
            className="h-10 shrink-0 rounded-lg bg-primary px-5 text-sm font-bold text-white transition-micro hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30"
            onClick={() => navigate(ROUTE_PATHS.SETTINGS)}
          >
            Mở hồ sơ
          </button>
        </div>
      </div>
    </section>
  );
};

export default EmptyState;
