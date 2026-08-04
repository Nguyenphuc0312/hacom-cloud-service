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
  ComputerDesktopIcon,
} from "@heroicons/react/24/outline";
import { Button } from "./Button";
import { WeeklyCalendarWidget } from "../../features/calendar/components/WeeklyCalendarWidget";

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

const SlideshowFigure: React.FC = React.memo(() => {
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
    <figure className="w-full max-w-[380px] overflow-hidden rounded-xl bg-surface shadow-[0_18px_46px_rgba(21,101,192,0.15)] ring-1 ring-border/50">
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
  );
});

export const NoChatSelected: React.FC<NoChatSelectedProps> = () => {
  const { t } = useTranslation();

  return (
    <section className="chat-background flex flex-1 overflow-y-auto px-[clamp(12px,2.5vw,40px)] py-[clamp(12px,2.5vw,32px)] text-text-secondary">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col items-center">
        <SlideshowFigure />

        <div className="mt-4 animate-fade-in text-center">
          <h2 className="text-[clamp(22px,2.8vw,32px)] font-extrabold leading-tight text-text-primary">
            Chào mừng đến với{" "}
            <span className="text-[#1565C0]">
              Hacom Chat
            </span>
          </h2>
          <div className="mt-3 flex justify-center">
            <a
              href="https://drive.google.com/drive/u/2/folders/1sHWGuyh8oU70KfiqK5x_q3fBV4xhPE0u"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white transition-all duration-300 hover:bg-[#1976D2] active:scale-[0.98] bg-[#1565C0]"
              style={{
                boxShadow: "0 2px 8px rgba(21, 101, 192, 0.35), 0 1px 3px rgba(21, 101, 192, 0.2)",
              }}
            >
              <ComputerDesktopIcon className="h-5 w-5 shrink-0" />
              {t("common:emptyState.downloadPC")}
            </a>
          </div>
        </div>

        <WeeklyCalendarWidget />
      </div>
    </section>
  );
};

export default EmptyState;
