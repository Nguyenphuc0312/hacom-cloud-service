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
  ComputerDesktopIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CalendarDaysIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { Button } from "./Button";
import {
  getCalendarEvents,
  getEventsByDate,
  type CalendarEvent,
} from "../../features/calendar/data/calendarEvents";
import { MeetingFormModal, type MeetingFormData } from "./MeetingFormModal";

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

const formatDateStr = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const WEEKDAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;

/** ISO 8601 week number — week containing the first Thursday is week 1 */
const getISOWeek = (date: Date): number => {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
};

const getWeekDays = (base: Date): Date[] => {
  const day = base.getDay();
  const monday = new Date(base);
  monday.setDate(base.getDate() - (day === 0 ? 6 : day - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
};

const MAX_VISIBLE_EVENTS = 3;

const WeeklyCalendarWidget: React.FC = () => {
  const navigate = useNavigate();
  const today = React.useMemo(() => new Date(), []);
  const [weekOffset, setWeekOffset] = React.useState(0);
  const [events, setEvents] = React.useState<CalendarEvent[]>([]);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [modalDefaultDate, setModalDefaultDate] = React.useState<string | undefined>();
  const [localMeetings, setLocalMeetings] = React.useState<MeetingFormData[]>([]);

  const weekDays = React.useMemo(() => {
    const base = new Date(today);
    base.setDate(today.getDate() + weekOffset * 7);
    return getWeekDays(base);
  }, [today, weekOffset]);

  React.useEffect(() => {
    if (!weekDays.length) return;
    const year = weekDays[0].getFullYear();
    setEvents(
      getCalendarEvents(year).filter(
        (e) => e.type === "meeting" || e.type === "personal",
      ),
    );
  }, [weekDays]);

  const sortByTime = (a: CalendarEvent, b: CalendarEvent) =>
    (a.time ?? "").localeCompare(b.time ?? "");

  const openAddMeeting = (day: Date) => {
    setModalDefaultDate(formatDateStr(day));
    setModalOpen(true);
  };

  const handleSaveMeeting = (data: MeetingFormData) => {
    setLocalMeetings((prev) => [...prev, data]);
  };

  const isToday = (d: Date) =>
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();

  const isCurrentWeek = weekOffset === 0;

  const todayLabel = React.useMemo(() => {
    const dayNames = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
    return `${dayNames[today.getDay()]}, ${today.getDate()}/${today.getMonth() + 1}`;
  }, [today]);

  const weekLabel = React.useMemo(() => {
    if (!weekDays.length) return "";
    const thursday = weekDays[3];
    const weekNum = getISOWeek(thursday);
    return `${weekNum} · Tháng ${thursday.getMonth() + 1}/${thursday.getFullYear()}`;
  }, [weekDays]);

  return (
    <div className="mt-5 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-elev1">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarDaysIcon className="h-5 w-5 text-primary" />
          <span className="text-sm font-bold text-text-primary">Lịch tuần</span>
          <span className="text-sm text-text-muted">{weekLabel}</span>
          {isCurrentWeek && (
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="rounded-full bg-primary/8 px-2 py-0.5 text-xs font-semibold text-primary hover:bg-primary/15 transition-micro"
            >
              Hôm nay · {todayLabel}
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Legend */}
          <div className="hidden items-center gap-3 sm:flex">
            <span className="flex items-center gap-1 text-xs text-text-muted">
              <span className="h-2 w-2 rounded-full bg-teal-500" />
              Họp
            </span>
            <span className="flex items-center gap-1 text-xs text-text-muted">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              Cá nhân
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            {!isCurrentWeek && (
              <button
                type="button"
                onClick={() => setWeekOffset(0)}
                className="rounded px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-micro"
              >
                Tuần này
              </button>
            )}
            <button
              type="button"
              title="Tuần trước"
              onClick={() => setWeekOffset((p) => p - 1)}
              className="rounded p-1 text-text-muted hover:bg-surface-hover transition-micro"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Tuần sau"
              onClick={() => setWeekOffset((p) => p + 1)}
              className="rounded p-1 text-text-muted hover:bg-surface-hover transition-micro"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <MeetingFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveMeeting}
        defaultDate={modalDefaultDate}
        existingMeetings={localMeetings}
      />

      {/* Grid */}
      <div className="grid grid-cols-7 divide-x divide-border">
        {weekDays.map((day, i) => {
          const todayDay = isToday(day);
          const dayEvents = getEventsByDate(events, day);
          const isWeekend = i >= 5;
          const dayStr = formatDateStr(day);

          const personal = dayEvents.filter((e) => e.type === "personal").sort(sortByTime);
          const meeting = dayEvents.filter((e) => e.type === "meeting").sort(sortByTime);
          const localDayMeetings = localMeetings.filter((m) => m.date === dayStr);

          const allEvents: Array<{ id: string; time?: string; title: string; kind: "meeting" | "personal" }> = [
            ...meeting.map((e) => ({ id: e.id, time: e.time, title: e.title, kind: "meeting" as const })),
            ...localDayMeetings.map((m) => ({ id: m.id, time: m.startTime, title: m.title, kind: "meeting" as const })),
            ...personal.map((e) => ({ id: e.id, time: e.time, title: e.title, kind: "personal" as const })),
          ];

          const visibleEvents = allEvents.slice(0, MAX_VISIBLE_EVENTS);
          const overflowCount = allEvents.length - visibleEvents.length;
          const totalCount = allEvents.length;

          return (
            <div
              key={i}
              className={clsx(
                "flex flex-col p-2 sm:p-2.5",
                "min-h-[140px]",
                isWeekend && "bg-surface-overlay",
                todayDay && !isWeekend && "bg-primary/5",
              )}
            >
              {/* Day header */}
              <div className="mb-2 flex flex-col items-center gap-1">
                {/* Hàng 1: tên thứ, căn giữa */}
                <span
                  className={clsx(
                    "text-[11px] font-semibold sm:text-xs",
                    isWeekend ? "text-rose-500" : todayDay ? "text-primary" : "text-text-muted",
                  )}
                >
                  {WEEKDAY_LABELS[i]}
                </span>
                {/* Hàng 2: số ngày (trái) + nút Thêm lịch (phải) */}
                <div className="flex w-full items-center justify-between">
                  <div className="relative">
                    <span
                      className={clsx(
                        "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold sm:h-6 sm:w-6 sm:text-xs",
                        todayDay
                          ? "bg-primary text-white"
                          : isWeekend
                            ? "text-rose-500"
                            : "text-text-primary",
                      )}
                    >
                      {day.getDate()}
                    </span>
                    {totalCount > 0 && (
                      <span className="absolute -right-2 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-text-muted/20 px-0.5 text-[9px] font-bold text-text-muted">
                        {totalCount}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    title={`Thêm lịch ngày ${day.getDate()}`}
                    onClick={() => openAddMeeting(day)}
                    className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 ring-1 ring-amber-400/50 bg-amber-400/10 hover:bg-amber-400/20 hover:text-amber-700 hover:ring-amber-400 transition-micro sm:text-[11px]"
                  >
                    <PlusIcon className="h-3 w-3" />
                    <span className="hidden sm:inline">Thêm lịch</span>
                  </button>
                </div>
              </div>

              {/* Events */}
              <div className="flex flex-1 flex-col gap-1">
                {visibleEvents.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => navigate("/calendar")}
                    className={clsx(
                      "flex min-w-0 w-full flex-col rounded-[3px] border-l-[3px] px-1.5 py-1 text-left text-[10px] leading-snug sm:text-[11px]",
                      "hover:brightness-95 dark:hover:brightness-110 transition-micro",
                      ev.kind === "meeting"
                        ? "border-teal-500 bg-teal-500/8 text-teal-800 dark:bg-teal-500/12 dark:text-teal-200"
                        : "border-amber-500 bg-amber-500/8 text-amber-800 dark:bg-amber-500/12 dark:text-amber-200",
                    )}
                    title={ev.title}
                  >
                    {ev.time && (
                      <span className="font-bold opacity-80">{ev.time}</span>
                    )}
                    <span className="truncate">{ev.title}</span>
                  </button>
                ))}

                {overflowCount > 0 && (
                  <button
                    type="button"
                    onClick={() => navigate("/calendar")}
                    className="text-left text-[10px] font-semibold text-primary hover:underline sm:text-[11px]"
                  >
                    +{overflowCount} mục khác
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border px-4 py-2">
        <span className="flex items-center gap-1 text-[11px] text-text-muted">
          <span className="flex h-4 w-4 items-center justify-center rounded border border-border text-[9px] font-bold text-text-muted">i</span>
          Nhấn vào sự kiện để xem chi tiết
        </span>
        <button
          type="button"
          onClick={() => navigate("/calendar")}
          className="text-xs font-semibold text-primary hover:underline transition-micro"
        >
          Xem lịch đầy đủ →
        </button>
      </div>
    </div>
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
    <figure className="w-full max-w-[380px] overflow-hidden rounded-xl bg-surface shadow-[0_18px_46px_rgba(15,23,42,0.18)]">
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

        <div className="mt-4 text-center">
          <h2 className="text-[clamp(22px,2.8vw,32px)] font-extrabold leading-tight text-text-primary">
            Chào mừng đến với <span className="text-primary">Hacom Chat</span>
          </h2>
          <div className="mt-3 flex justify-center">
            <Button
              variant="outline"
              size="lg"
              className="rounded-full border-primary/20 hover:bg-primary/5 hover:text-primary transition-all duration-300"
              leftIcon={<ComputerDesktopIcon className="h-5 w-5" />}
              onClick={() => window.open("https://hacomholding-my.sharepoint.com/:f:/g/personal/admin_hacomholdings_vn/IgC3kG0k8ccjS7N7Yai-VOEXARcTnkT1pggFa0Fdn2wUEGc?e=a8UzP1", "_blank")}
            >
              {t("common:emptyState.downloadPC")}
            </Button>
          </div>
        </div>

        <WeeklyCalendarWidget />
      </div>
    </section>
  );
};

export default EmptyState;
