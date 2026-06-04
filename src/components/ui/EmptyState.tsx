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
  XMarkIcon,
  ClockIcon,
  MapPinIcon,
  UserIcon,
  UsersIcon,
  VideoCameraIcon,
  DocumentTextIcon,
  PencilSquareIcon,
  TrashIcon,
  CheckCircleIcon,
  CheckIcon,
  EyeIcon,
} from "@heroicons/react/24/outline";
import { CheckCircleIcon as CheckCircleSolidIcon } from "@heroicons/react/24/solid";
import { Button } from "./Button";
import {
  getEventsByDate,
  type CalendarEvent,
} from "../../features/calendar/data/calendarEvents";
import { MeetingFormModal, type MeetingFormData } from "./MeetingFormModal";
import { ConfirmDialog } from "./Modal";
import { useAuthStore } from "../../stores";
import { useCalendarStore } from "../../stores/calendarStore";
import { toast } from "../../utils/toast";

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

interface SelectedEventDetail {
  kind: "meeting" | "personal";
  id: string;
  title: string;
  date: string;
  time?: string;
  /** Có giá trị khi click vào lịch local (đã tạo qua MeetingFormModal) */
  meeting?: MeetingFormData;
  /** Có giá trị khi click vào sự kiện API (HR calendar hoặc chat calendar) */
  apiEvent?: Partial<{
    id: string;
    title: string;
    startAt: string;
    endAt: string;
    description: string | null;
    meetingChairman: string | null;
    meetingFormat: string | null;
    meetingLocation: string | null;
    attendees: string[];
    visibility: string;
    status: string;
    ownerUserId: string;
    ownerEmployeeId: string | null;
  }>;
  /** Có giá trị khi click vào sự kiện demo (getCalendarEvents) */
  source?: CalendarEvent;
}

interface EventDetailPopupProps {
  detail: SelectedEventDetail;
  currentUserId: string | undefined;
  currentUserName: string;
  onClose: () => void;
  onEdit?: (meeting: MeetingFormData) => void;
  onDelete?: (meetingId: string) => void;
  onDeleteApiEvent?: (eventId: string) => Promise<void>;
  onToggleRead?: (meetingId: string) => void;
}

const formatReadAt = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
    });
  } catch {
    return "";
  }
};

const isParticipantMatch = (
  participants: { name: string }[],
  chairman: string,
  currentName: string,
): boolean => {
  const lower = currentName.trim().toLowerCase();
  if (!lower) return false;
  if (chairman.trim().toLowerCase() === lower) return true;
  return participants.some((p) => p.name.trim().toLowerCase() === lower);
};

const EventDetailPopup: React.FC<EventDetailPopupProps> = ({
  detail,
  currentUserId,
  currentUserName,
  onClose,
  onEdit,
  onDelete,
  onDeleteApiEvent,
  onToggleRead,
}) => {
  const isLocalMeeting = !!detail.meeting;
  const isApiEvent = !!detail.apiEvent;
  const m = detail.meeting;
  const apiEvent = detail.apiEvent;
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [showApiDeleteConfirm, setShowApiDeleteConfirm] = React.useState(false);

  const isCreator = !!(m && currentUserId && m.createdById === currentUserId);
  const isApiOwner = !!(apiEvent && currentUserId && apiEvent.ownerUserId === currentUserId);
  const isTaggedParticipant = !!(
    m && !isCreator && isParticipantMatch(m.participants, m.chairman, currentUserName)
  );
  const hasMarkedRead = !!(
    m?.readBy?.some((r) => r.userId === currentUserId)
  );
  const readCount = m?.readBy?.length ?? 0;
  const totalAudience = m
    ? m.participants.length + (m.chairman ? 1 : 0)
    : 0;
  const accent = detail.kind === "meeting"
    ? { dot: "bg-teal-500", chip: "bg-teal-500/10 text-teal-700 dark:text-teal-300", label: "Lịch họp" }
    : { dot: "bg-amber-500", chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300", label: "Cá nhân" };

  const formatDate = (d: string) => {
    try {
      return new Date(`${d}T00:00:00`).toLocaleDateString("vi-VN", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return d;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md animate-scale-in rounded-xl border border-border bg-surface p-6 shadow-lg">
        <button
          type="button"
          onClick={onClose}
          title="Đóng"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-micro"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>

        <div className="pr-8 max-h-[calc(100dvh-6rem)] overflow-y-auto">
          <div className={clsx("mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium", accent.chip)}>
            <span className={clsx("h-2 w-2 rounded-full", accent.dot)} />
            {accent.label}
          </div>

          <h3 className="text-xl font-semibold text-text-primary">{detail.title}</h3>
          <p className="mt-1 text-sm font-semibold text-teal-600 dark:text-teal-400">
            {formatDate(detail.date)}
          </p>

          {isLocalMeeting && m!.createdByName && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
              <span>Người tạo:</span>
              <span className="font-medium text-text-primary">
                {m!.createdByName}
                {isCreator && <span className="ml-1 text-[#1565C0]">(bạn)</span>}
              </span>
            </div>
          )}

          <div className="mt-4 space-y-3 text-sm">
            {(isLocalMeeting ? (m!.startTime || m!.endTime) : detail.time) && (
              <div className="flex items-center gap-3">
                <ClockIcon className="h-5 w-5 text-text-muted" />
                <span className="text-text-primary">
                  {isLocalMeeting
                    ? `${m!.startTime || "--:--"} — ${m!.endTime || "--:--"}`
                    : detail.time}
                </span>
              </div>
            )}

            {isLocalMeeting && m!.chairman && (
              <div className="flex items-center gap-3">
                <UserIcon className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                <span className="text-text-primary">
                  <span className="font-semibold text-teal-600 dark:text-teal-400">Chủ trì: </span>
                  {m!.chairman}
                </span>
              </div>
            )}

            {isLocalMeeting && m!.participants.length > 0 && (
              <div className="flex items-start gap-3">
                <UsersIcon className="mt-0.5 h-5 w-5 text-teal-600 dark:text-teal-400" />
                <div className="flex-1">
                  <div className="font-semibold text-teal-600 dark:text-teal-400">
                    Thành viên ({m!.participants.length}):
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {m!.participants.map((p, idx) => (
                      <span
                        key={`${p.name}-${idx}`}
                        className={clsx(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
                          p.hasConflict
                            ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
                            : "bg-surface-hover text-text-primary",
                        )}
                      >
                        {p.hasConflict && <ExclamationTriangleIcon className="h-3 w-3" />}
                        {p.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {isLocalMeeting && (
              <div className="flex items-center gap-3">
                {m!.format === "online" ? (
                  <VideoCameraIcon className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                ) : (
                  <MapPinIcon className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                )}
                <span className="text-text-primary">
                  <span className="font-semibold text-teal-600 dark:text-teal-400">
                    {m!.format === "online" ? "Hình thức: " : "Địa điểm: "}
                  </span>
                  {m!.format === "online" ? "Trực tuyến" : (m!.location || "Chưa cập nhật")}
                </span>
              </div>
            )}

            {isLocalMeeting && m!.notes && (
              <div className="flex items-start gap-3">
                <DocumentTextIcon className="mt-0.5 h-5 w-5 text-text-muted" />
                <p className="whitespace-pre-wrap text-text-primary">{m!.notes}</p>
              </div>
            )}

            {/* API Event rich display */}
            {isApiEvent && apiEvent && (
              <>
                {/* Time */}
                {apiEvent.startAt && apiEvent.endAt && (
                  <div className="flex items-center gap-3">
                    <ClockIcon className="h-5 w-5 text-text-muted" />
                    <span className="text-text-primary">
                      {apiEvent.startAt.slice(11, 16)} — {apiEvent.endAt.slice(11, 16)}
                    </span>
                  </div>
                )}

                {/* Chairman */}
                {apiEvent.meetingChairman && (
                  <div className="flex items-center gap-3">
                    <UserIcon className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                    <span className="text-text-primary">
                      <span className="font-semibold text-teal-600 dark:text-teal-400">Chủ trì: </span>
                      {apiEvent.meetingChairman}
                    </span>
                  </div>
                )}

                {/* Attendees */}
                {apiEvent.attendees && apiEvent.attendees.length > 0 && (
                  <div className="flex items-start gap-3">
                    <UsersIcon className="mt-0.5 h-5 w-5 text-teal-600 dark:text-teal-400" />
                    <div className="flex-1">
                      <div className="font-semibold text-teal-600 dark:text-teal-400">
                        Thành viên ({apiEvent.attendees.length})
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {apiEvent.attendees.slice(0, 10).map((name, idx) => (
                          <span
                            key={`${name}-${idx}`}
                            className="inline-flex items-center rounded-full bg-surface-hover px-2 py-0.5 text-xs text-text-primary"
                          >
                            {name}
                          </span>
                        ))}
                        {apiEvent.attendees.length > 10 && (
                          <span className="inline-flex items-center rounded-full bg-surface-hover px-2 py-0.5 text-xs text-text-muted">
                            +{apiEvent.attendees.length - 10} người khác
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Location / Meeting Link */}
                {apiEvent.meetingLocation && (
                  <div className="flex items-center gap-3">
                    {apiEvent.meetingFormat === "online" ? (
                      <VideoCameraIcon className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                    ) : (
                      <MapPinIcon className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                    )}
                    <span className="text-text-primary break-all">
                      {apiEvent.meetingFormat === "online" ? "Trực tuyến: " : "Địa điểm: "}
                      {apiEvent.meetingLocation}
                    </span>
                  </div>
                )}

                {/* Description */}
                {apiEvent.description && (
                  <div className="flex items-start gap-3">
                    <DocumentTextIcon className="mt-0.5 h-5 w-5 text-text-muted" />
                    <p className="whitespace-pre-wrap text-text-primary">{apiEvent.description}</p>
                  </div>
                )}
              </>
            )}

            {!isLocalMeeting && !isApiEvent && detail.source?.description && (
              <p className="text-text-secondary">{detail.source.description}</p>
            )}
          </div>

          {/* Đã xem / đã nhận */}
          {isLocalMeeting && (
            <div className="mt-5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 dark:bg-emerald-500/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <EyeIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                    Đã xem
                  </span>
                  <span
                    className={clsx(
                      "rounded-full px-2 py-0.5 text-xs font-bold",
                      readCount > 0
                        ? "bg-emerald-500 text-white"
                        : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                    )}
                  >
                    {readCount}/{totalAudience}
                  </span>
                </div>
                {isTaggedParticipant && (
                  <button
                    type="button"
                    onClick={() => m && onToggleRead?.(m.id)}
                    className={clsx(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-micro",
                      hasMarkedRead
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/15"
                        : "bg-[#1976D2]/10 text-[#1565C0] hover:bg-[#1976D2]/12",
                    )}
                  >
                    {hasMarkedRead ? (
                      <>
                        <CheckCircleSolidIcon className="h-3.5 w-3.5" />
                        Đã xem
                      </>
                    ) : (
                      <>
                        <CheckIcon className="h-3.5 w-3.5" />
                        Đánh dấu đã xem
                      </>
                    )}
                  </button>
                )}
              </div>

              {readCount > 0 && (
                <ul className="mt-2 space-y-1">
                  {m!.readBy!.map((r) => (
                    <li
                      key={r.userId}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="flex items-center gap-1.5 text-text-primary">
                        <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-500" />
                        {r.name}
                      </span>
                      <span className="text-text-muted">{formatReadAt(r.readAt)}</span>
                    </li>
                  ))}
                </ul>
              )}

              {readCount === 0 && (
                <p className="mt-2 text-xs text-emerald-700/80 dark:text-emerald-300/80">
                  Chưa có ai đánh dấu đã xem.
                </p>
              )}
            </div>
          )}

          {/* Action footer for API events */}
          {isApiEvent && isApiOwner && (
            <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-3">
              <Button
                variant="outline"
                size="sm"
                leftIcon={<TrashIcon className="h-4 w-4" />}
                className="text-danger hover:bg-danger/10"
                onClick={() => setShowApiDeleteConfirm(true)}
              >
                Xóa
              </Button>
            </div>
          )}

          <ConfirmDialog
            isOpen={showApiDeleteConfirm}
            onClose={() => setShowApiDeleteConfirm(false)}
            onConfirm={async () => {
              setShowApiDeleteConfirm(false);
              await onDeleteApiEvent?.(detail.id);
            }}
            title="Xóa sự kiện"
            message="Bạn có chắc muốn xóa sự kiện này? Hành động không thể hoàn tác."
            confirmText="Xóa"
            variant="danger"
          />

          {/* Action footer: chỉ người tạo mới có Sửa/Xóa */}
          {isLocalMeeting && isCreator && (
            <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-3">
              {!confirmDelete ? (
                <>
                  <Button
                    variant="brand-outline"
                    size="sm"
                    leftIcon={<PencilSquareIcon className="h-4 w-4" />}
                    onClick={() => m && onEdit?.(m)}
                  >
                    Sửa
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<TrashIcon className="h-4 w-4" />}
                    className="text-danger hover:bg-danger/10"
                    onClick={() => setConfirmDelete(true)}
                  >
                    Xóa
                  </Button>
                </>
              ) : (
                <>
                  <span className="mr-auto text-xs text-danger">
                    Xác nhận xóa lịch họp này?
                  </span>
                  <Button
                    variant="brand-outline"
                    size="sm"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Hủy
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    className="bg-danger hover:bg-danger/90"
                    onClick={() => m && onDelete?.(m.id)}
                  >
                    Xóa
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

class WidgetErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    console.error("[WidgetErrorBoundary] WeeklyCalendarWidget render error:", error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-border bg-surface p-4 text-sm text-text-muted">
          Không tải được lịch tuần. Vui lòng thử lại sau.
        </div>
      );
    }
    return this.props.children;
  }
}

const WeeklyCalendarWidget: React.FC = () => {
  const navigate = useNavigate();
  const today = React.useMemo(() => new Date(), []);
  const [weekOffset, setWeekOffset] = React.useState(0);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [modalDefaultDate, setModalDefaultDate] = React.useState<string | undefined>();
  const [selectedDetail, setSelectedDetail] = React.useState<SelectedEventDetail | null>(null);
  const [editingMeeting, setEditingMeeting] = React.useState<MeetingFormData | null>(null);

  // Calendar store - shared source of truth
  const storeEvents = useCalendarStore((s) => s.events);
  const storeIsLoading = useCalendarStore((s) => s.isLoading);
  const storeError = useCalendarStore((s) => s.error);
  const storeErrorCode = useCalendarStore((s) => s.errorCode);
  const fetchEvents = useCalendarStore((s) => s.fetchEvents);
  const createEvent = useCalendarStore((s) => s.createEvent);
  const deleteEvent = useCalendarStore((s) => s.deleteEvent);

  // Store full API events for detail view
  const safeStoreEvents = Array.isArray(storeEvents) ? storeEvents : [];
  const apiEventsMap = React.useMemo(() => {
    const map: Record<string, NonNullable<SelectedEventDetail["apiEvent"]>> = {};
    safeStoreEvents.forEach((event) => {
      // Map HRCalendarEvent fields to the shape expected by SelectedEventDetail
      const attendeeNames = event.participants
        ? event.participants
            .filter((p) => p.employee?.fullName)
            .map((p) => p.employee!.fullName)
        : [];
      map[event.id] = {
        id: event.id,
        title: event.title,
        startAt: event.startAt,
        endAt: event.endAt,
        description: event.description,
        meetingLocation: event.location ?? null,
        attendees: attendeeNames,
        visibility: event.visibility,
        ownerUserId: event.ownerId,
      };
    });
    return map;
  }, [safeStoreEvents]);

  const currentUser = useAuthStore((s) => s.user);
  const currentUserId = currentUser?.id;
  const currentUserName = React.useMemo(
    () =>
      currentUser?.effectiveDisplayName ||
      currentUser?.displayName ||
      currentUser?.fullName ||
      currentUser?.fullNameFromHR ||
      currentUser?.username ||
      "",
    [currentUser],
  );

  const weekDays = React.useMemo(() => {
    const base = new Date(today);
    base.setDate(today.getDate() + weekOffset * 7);
    return getWeekDays(base);
  }, [today, weekOffset]);

  // Compute week range for API call
  const weekRange = React.useMemo(() => {
    if (!weekDays.length) return { start: null, end: null };
    const start = weekDays[0];
    const end = new Date(weekDays[6]);
    end.setHours(23, 59, 59, 999);
    return {
      start: start.toISOString(),
      end: end.toISOString(),
    };
  }, [weekDays]);

  // Fetch events from API when week changes
  React.useEffect(() => {
    if (!weekRange.start || !weekRange.end) return;
    void fetchEvents(weekRange.start, weekRange.end);
  }, [weekRange.start, weekRange.end, fetchEvents]);

  // Map store events to CalendarEvent format for display
  const events: CalendarEvent[] = React.useMemo(() => {
    return safeStoreEvents.map((event) => ({
      id: event.id,
      title: event.title,
      date: event.startAt.slice(0, 10),
      type: event.eventType === "MEETING" ? "meeting" : "work",
      description: event.description ?? undefined,
      time: event.startAt.slice(11, 16),
    }));
  }, [safeStoreEvents]);

  const sortByTime = (a: CalendarEvent, b: CalendarEvent) =>
    (a.time ?? "").localeCompare(b.time ?? "");

  const openAddMeeting = (day: Date) => {
    setEditingMeeting(null);
    setModalDefaultDate(formatDateStr(day));
    setModalOpen(true);
  };

  const handleSaveMeeting = async (data: MeetingFormData) => {
    try {
      const startAt = `${data.date}T${data.startTime}:00.000Z`;
      const endAt = `${data.date}T${data.endTime}:00.000Z`;

      const input = {
        title: data.title,
        description: data.notes || undefined,
        type: "MEETING" as const,
        source: "MEETING" as const,
        startAt,
        endAt,
        timezone: "Asia/Ho_Chi_Minh",
        isAllDay: false,
        visibility: "PRIVATE" as const,
        status: "CONFIRMED" as const,
        attendees: data.participants.map(p => p.name),
        meetingChairman: data.chairman || undefined,
        meetingFormat: data.format,
        meetingLocation: data.location || undefined,
      };

      const result = await createEvent(input);

      if (result) {
        toast.success("Đã thêm lịch họp");
        // Refetch to update the calendar
        if (weekRange.start && weekRange.end) {
          await fetchEvents(weekRange.start, weekRange.end);
        }
      }
    } catch (error) {
      console.error("Failed to create event:", error);
      toast.error("Không thể thêm lịch. Vui lòng thử lại.");
    }
  };

  const handleEditMeeting = (meeting: MeetingFormData) => {
    setSelectedDetail(null);
    setEditingMeeting(meeting);
    setModalDefaultDate(meeting.date);
    setModalOpen(true);
  };

  const handleDeleteMeeting = async (meetingId: string) => {
    try {
      await deleteEvent(meetingId);
      toast.success("Đã xóa lịch");
      setSelectedDetail(null);
      // Refetch to update the calendar
      if (weekRange.start && weekRange.end) {
        await fetchEvents(weekRange.start, weekRange.end);
      }
    } catch (error) {
      console.error("Failed to delete event:", error);
      toast.error("Không thể xóa lịch");
    }
  };

  // Handler for deleting API events
  const handleDeleteApiEvent = async (eventId: string) => {
    await handleDeleteMeeting(eventId);
  };

  // Note: handleToggleRead is not supported by API yet - disabled for API-based events
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleToggleRead = (_meetingId: string) => {
    // Read receipts not yet supported by backend
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
          <CalendarDaysIcon className="h-5 w-5 text-[#1565C0]" />
          <span className="text-sm font-bold text-text-primary">Lịch tuần</span>
          <span className="text-sm text-text-muted">{weekLabel}</span>
          {isCurrentWeek && (
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="rounded-full px-2 py-0.5 text-xs font-bold text-white transition-micro hover:brightness-105 active:scale-[0.98] bg-gradient-to-r from-[#1976D2] to-[#1565C0]"
              style={{
                boxShadow: "0 1px 4px rgba(196, 30, 58, 0.3)",
              }}
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
                className="rounded px-2 py-1 text-xs font-semibold text-amber-600 ring-1 ring-amber-400/50 bg-amber-400/10 hover:bg-amber-400/20 hover:text-amber-700 hover:ring-amber-400 transition-micro"
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
        onClose={() => {
          setModalOpen(false);
          setEditingMeeting(null);
        }}
        onSave={handleSaveMeeting}
        defaultDate={modalDefaultDate}
        initialData={editingMeeting}
      />

      {selectedDetail && (
        <EventDetailPopup
          detail={selectedDetail}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          onClose={() => setSelectedDetail(null)}
          onEdit={handleEditMeeting}
          onDelete={handleDeleteMeeting}
          onDeleteApiEvent={handleDeleteApiEvent}
          onToggleRead={handleToggleRead}
        />
      )}

      {/* Loading indicator — subtle bar, never hides the grid */}
      {storeIsLoading && (
        <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-1.5">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#1565C0] border-t-transparent" />
          <span className="text-[11px] text-text-muted">Đang tải lịch...</span>
        </div>
      )}

      {/* Error notice banner — soft, inline, never replaces the grid */}
      {storeError && !storeIsLoading && (
        <div className="mx-3 my-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800/40 dark:bg-amber-900/20">
          <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-amber-800 dark:text-amber-200">
              {storeErrorCode === "EMPLOYEE_LINK_REQUIRED"
                ? "Tài khoản chưa liên kết hồ sơ nhân sự. Lịch họp và phòng ban sẽ hiển thị sau khi liên kết."
                : storeError}
            </p>
            {storeErrorCode !== "FORBIDDEN" &&
              storeErrorCode !== "EMPLOYEE_INACTIVE" &&
              storeErrorCode !== "EMPLOYEE_LINK_REQUIRED" && (
              <div className="mt-1 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (weekRange.start && weekRange.end) {
                      void fetchEvents(weekRange.start, weekRange.end);
                    }
                  }}
                  className="text-[11px] font-semibold text-amber-700 hover:underline dark:text-amber-300"
                >
                  Thử lại
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/calendar")}
                  className="text-[11px] font-semibold text-[#1565C0] hover:underline"
                >
                  Xem lịch đầy đủ →
                </button>
              </div>
            )}
            {storeErrorCode === "EMPLOYEE_LINK_REQUIRED" && (
              <button
                type="button"
                onClick={() => navigate("/calendar")}
                className="mt-1 text-[11px] font-semibold text-[#1565C0] hover:underline"
              >
                Xem lịch →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Grid — always rendered so the calendar shell is never lost due to an API error */}
      <div className="grid grid-cols-7 divide-x divide-border">
        {weekDays.map((day, i) => {
          const todayDay = isToday(day);
          const dayEvents = getEventsByDate(events, day);
          const isWeekend = i >= 5;
          const dayStr = formatDateStr(day);

          const personal = dayEvents.filter((e) => e.type === "personal").sort(sortByTime);
          const meeting = dayEvents.filter((e) => e.type === "meeting").sort(sortByTime);

          const allEvents: Array<{
            id: string;
            time?: string;
            title: string;
            kind: "meeting" | "personal";
            detail: SelectedEventDetail;
          }> = [
            ...meeting.map((e) => ({
              id: e.id,
              time: e.time,
              title: e.title,
              kind: "meeting" as const,
              detail: {
                kind: "meeting" as const,
                id: e.id,
                title: e.title,
                date: dayStr,
                time: e.time,
                source: e,
                apiEvent: apiEventsMap[e.id],
              },
            })),
            ...personal.map((e) => ({
              id: e.id,
              time: e.time,
              title: e.title,
              kind: "personal" as const,
              detail: {
                kind: "personal" as const,
                id: e.id,
                title: e.title,
                date: dayStr,
                time: e.time,
                source: e,
                apiEvent: apiEventsMap[e.id],
              },
            })),
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
              )}
              style={todayDay && !isWeekend ? { backgroundColor: "rgba(255, 200, 87, 0.08)" } : undefined}
            >
              {/* Day header */}
              <div className="mb-2 flex flex-col items-center gap-1">
                {/* Hàng 1: tên thứ, căn giữa */}
                <span
                  className={clsx(
                    "text-[11px] font-semibold sm:text-xs",
                    isWeekend ? "text-rose-500" : "text-text-muted",
                  )}
                  style={todayDay && !isWeekend ? { color: "#1565C0" } : undefined}
                >
                  {WEEKDAY_LABELS[i]}
                </span>
                {/* Hàng 2: số ngày (trái) + nút Thêm lịch (phải) */}
                <div className="flex w-full items-center justify-between">
                  <div className="relative">
                    <span
                      className={clsx(
                        "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold sm:h-6 sm:w-6 sm:text-xs",
                        !todayDay && (isWeekend ? "text-rose-500" : "text-text-primary"),
                      )}
                      style={
                        todayDay
                          ? { background: "#DBEAFE", color: "#1565C0", boxShadow: "0 1px 4px rgba(255,200,87,0.45)" }
                          : undefined
                      }
                    >
                      {day.getDate()}
                    </span>
                    {totalCount > 0 && (
                      <span className="absolute -right-2 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#FFC857] px-0.5 text-[9px] font-bold text-[#C41E3A]">
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
                    onClick={() => setSelectedDetail(ev.detail)}
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
                    className="text-left text-[10px] font-semibold text-[#1565C0] hover:underline sm:text-[11px]"
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
          className="bg-gradient-to-r from-[#1976D2] to-[#1565C0] bg-clip-text text-xs font-semibold text-transparent transition-micro hover:brightness-110 active:scale-95"
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
            Chào mừng đến với{" "}
            <span className="bg-gradient-to-r from-[#1976D2] to-[#1565C0] bg-clip-text text-transparent">
              Hacom Chat
            </span>
          </h2>
          <div className="mt-3 flex justify-center">
            <a
              href="https://drive.google.com/drive/u/2/folders/1sHWGuyh8oU70KfiqK5x_q3fBV4xhPE0u"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white transition-all duration-300 hover:brightness-105 active:scale-[0.98] bg-gradient-to-r from-[#1976D2] to-[#1565C0]"
              style={{
                boxShadow: "0 2px 8px rgba(196, 30, 58, 0.35), 0 1px 3px rgba(255, 200, 87, 0.3)",
              }}
            >
              <ComputerDesktopIcon className="h-5 w-5 shrink-0" />
              {t("common:emptyState.downloadPC")}
            </a>
          </div>
        </div>

        <WidgetErrorBoundary>
          <WeeklyCalendarWidget />
        </WidgetErrorBoundary>
      </div>
    </section>
  );
};

export default EmptyState;
