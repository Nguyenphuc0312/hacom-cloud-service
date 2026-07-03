import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import clsx from "clsx";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  XMarkIcon,
  UserIcon,
  BuildingOfficeIcon,
  CalendarIcon,
  ClockIcon,
  MapPinIcon,
  VideoCameraIcon,
  UsersIcon,
  PencilSquareIcon,
  TrashIcon,
  EyeIcon,
  DocumentTextIcon,
  PaperClipIcon,
} from "@heroicons/react/24/outline";
import {
  getEventColor,
  getEventTypeLabel,
  VIETNAMESE_MONTHS,
  VIETNAMESE_WEEKDAYS,
  type CalendarEvent as LocalCalendarEvent,
  type ExtendedCalendarEvent,
  type EventType,
} from "../data/calendarEvents";
import {
  hrApi,
  type AttendanceCalendarDay,
} from "../../api/hrApi";
import {
  hrCalendarApi,
  type HRCalendarEvent,
  type HRCalendarParticipant,
} from "../../api/hrCalendarApi";
import {
  apiVisibilityToForm,
  meetingVisibilityToApi,
  personalVisibilityToApi,
} from "../utils/calendarVisibility";
import { MeetingFormModal, type MeetingFormData } from "../../../components/ui/MeetingFormModal";
import { PersonalEventFormModal, type PersonalEventFormData } from "../../../components/ui/PersonalEventFormModal";
import { ConfirmDialog, Modal } from "../../../components/ui/Modal";
import { toast } from "../../../utils/toast";
import { useCalendarStore } from "../../../stores/calendarStore";
import { DayView } from "../components/DayView";
import { WeekView } from "../components/WeekView";
import { getWeekDays, getIsoWeekNumber, eventOccursOnDay, getMultiDayPosition, type MultiDayPosition } from "../utils/timeline";
import {
  buildExtendedEventMap,
  filterCalendarEventsByType,
  getMeetingMetadata,
  mapHrmEventToCalendarEvent,
  toLocalDateString,
  toLocalTimeString,
} from "../utils/calendarEventMapping";
import { HrNotificationBell } from "../components/HrNotificationBell";
import { UserSearchModal } from "../../../components/ui/UserSearchModal";
import { loadUserProfiles, type UserProfileSummary } from "../../../services/userBatchLoader";
import {
  resolvePublicResourceUrl,
  CALENDAR_ATTACHMENTS_ENABLED,
  CALENDAR_ATTACHMENTS_USE_MOCK,
} from "../../../config";
import {
  CalendarAttachmentList,
  type CalendarLocalAttachment,
} from "../../../components/ui/CalendarAttachmentZone";
import {
  uploadCalendarAttachments,
  splitCalendarAttachments,
  CalendarAttachmentUploadError,
} from "../utils/uploadCalendarAttachment";
import {
  mockSetEventAttachments,
  mockGetAttachmentsForEvents,
} from "../utils/calendarAttachmentMockStore";
import type { CalendarAttachmentDto } from "../../../features/api/hrCalendarApi";
import { Avatar } from "../../../components/common/Avatar";
import { useEnrichedProfileStore } from "../../../stores/enrichedProfileStore";

// Lazy: kéo react-markdown (~100kB) vào chunk riêng, chỉ tải khi mở chi tiết
// lịch có ghi chú. Render ghi chú dạng markdown (bảng, danh sách…) cho đẹp.
const MarkdownContent = React.lazy(
  () => import("../../../components/message/MarkdownContent"),
);

const isImageMime = (mime: string) => mime.startsWith("image/");

/**
 * Map attachment đã lưu ở BE (HRCalendarEvent.attachments) → dạng form REMOTE,
 * để pre-fill khi mở form sửa → không mất file cũ.
 */
const remoteAttachmentsToForm = (
  attachments: CalendarAttachmentDto[] | null | undefined,
): CalendarLocalAttachment[] =>
  (attachments ?? []).map((a) => ({
    id: a.fileId,
    previewUrl: isImageMime(a.mimeType) ? (a.thumbnailUrl ?? a.url) : null,
    name: a.filename,
    sizeBytes: a.sizeBytes,
    mimeType: a.mimeType,
    remoteFileId: a.fileId,
    downloadUrl: a.url,
  }));

/**
 * Từ attachments trong form: upload file mới, gộp với fileId cũ (remote) →
 * `attachmentFileIds` (full desired set BE reconcile). Trả về undefined khi
 * feature-flag off HOẶC không có attachment nào (bỏ field → BE không đụng tới).
 */
const resolveAttachmentFileIds = async (
  attachments: CalendarLocalAttachment[] | undefined,
): Promise<string[] | undefined> => {
  if (!CALENDAR_ATTACHMENTS_ENABLED) return undefined;
  if (!attachments || attachments.length === 0) return [];
  const { filesToUpload, existingFileIds } = splitCalendarAttachments(attachments);
  const uploaded = await uploadCalendarAttachments(filesToUpload);
  return [...existingFileIds, ...uploaded.map((u) => u.fileId)];
};

/**
 * MOCK: sau khi create/update, lưu mapping eventId → fileIds vào IndexedDB để
 * lần sau list/detail hiển thị lại. No-op khi không dùng mock (BE tự lưu).
 */
const persistMockAttachmentMapping = async (
  eventId: string | undefined,
  fileIds: string[] | undefined,
): Promise<void> => {
  if (!CALENDAR_ATTACHMENTS_USE_MOCK || !eventId || fileIds === undefined) return;
  await mockSetEventAttachments(eventId, fileIds);
};

/**
 * Calendar view types.
 */
type CalendarView = "day" | "week" | "month";

/**
 * Calendar type filter for the sidebar.
 */
interface CalendarTypeFilter {
  type: EventType;
  label: string;
  color: string;
  checked: boolean;
}


/**
 * Generate calendar days for a given month.
 */
const generateCalendarDays = (
  year: number,
  month: number
): Array<{ date: Date; isCurrentMonth: boolean }> => {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const startDayOfWeek = firstDay.getDay();

  const days: Array<{ date: Date; isCurrentMonth: boolean }> = [];

  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const date = new Date(year, month, -i);
    days.push({ date, isCurrentMonth: false });
  }

  for (let day = 1; day <= lastDay.getDate(); day++) {
    const date = new Date(year, month, day);
    days.push({ date, isCurrentMonth: true });
  }

  const remainingDays = 42 - days.length;
  for (let i = 1; i <= remainingDays; i++) {
    const date = new Date(year, month + 1, i);
    days.push({ date, isCurrentMonth: false });
  }

  return days;
};

/**
 * Format date to YYYY-MM-DD
 */
const formatDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * Khoảng FETCH cho tháng đang xem, LÙI 6 THÁNG ở đầu và TIẾN 1 THÁNG ở cuối.
 * Lý do: lịch dài hạn (công tác/nghỉ phép có thể kéo dài 3–4 tháng) bắt đầu từ
 * nhiều tháng trước nhưng vẫn kéo sang tuần/tháng đang xem; backend lọc theo
 * `startAt` nên nếu range quá hẹp sẽ KHÔNG trả các event dài bắt đầu xa → dây bị
 * đứt ở các tuần xa ngày bắt đầu. Lùi 6 tháng để chắc bắt được event dài.
 * Lưới/Day/Week vẫn lọc client theo eventOccursOnDay nên chỉ hiển thị đúng phạm
 * vi đang xem. Khớp với khoảng fetch của widget lịch tuần (EmptyState).
 */
const getMonthFetchRange = (year: number, month: number): { from: string; to: string } => {
  const start = new Date(year, month - 6, 1);
  const end = new Date(year, month + 2, 0);
  return { from: formatDateString(start), to: formatDateString(end) };
};

/**
 * Format time from HH:mm format
 */
const formatTime = (time: string | null | undefined): string => {
  if (!time) return "--:--";
  return time;
};


/**
 * Helper to format date string to Vietnamese format
 */
const formatDateVN = (dateStr: string): string => {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("vi-VN", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
};

/**
 * Build the participant payload for hr-api-service from the meeting form.
 * - refs: identifiers the backend can resolve to an employee
 *   (employee cuid / employeeCode / chat authUserId)
 * - freeTextNames: typed names without identity → stored in metadata.attendees
 * The chairman tagged from friends is invited as a participant too, so the
 * meeting shows up on their calendar; the backend never adds the owner.
 */
const buildParticipantPayload = (
  data: MeetingFormData,
): { refs: string[]; freeTextNames: string[] } => {
  const refs = new Set<string>();
  const freeTextNames: string[] = [];
  for (const p of data.participants ?? []) {
    const ref = p.employeeId || p.employeeCode || p.userId;
    if (ref) {
      refs.add(ref);
    } else if (p.name.trim()) {
      freeTextNames.push(p.name.trim());
    }
  }
  const chairmanRef = data.chairmanEmployeeCode || data.chairmanUserId;
  if (chairmanRef) refs.add(chairmanRef);
  return { refs: Array.from(refs), freeTextNames };
};

/**
 * Calculate duration between two timestamps
 */
const calculateDuration = (startAt: string, endAt: string): string => {
  try {
    const start = new Date(startAt);
    const end = new Date(endAt);
    const diffMs = end.getTime() - start.getTime();
    const diffMins = Math.round(diffMs / 60000);

    if (diffMins < 60) {
      return `${diffMins} phút`;
    }
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    if (mins === 0) {
      return `${hours} giờ`;
    }
    return `${hours} giờ ${mins} phút`;
  } catch {
    return "";
  }
};

/**
 * Get status badge color
 */
const getStatusBadge = (status?: string): { bg: string; text: string; label: string } => {
  switch (status) {
    case "CONFIRMED":
      return { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-300", label: "Đã xác nhận" };
    case "TENTATIVE":
      return { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-300", label: "Dự kiến" };
    case "CANCELLED":
      return { bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-300", label: "Đã hủy" };
    default:
      return { bg: "bg-gray-500/10", text: "text-gray-600 dark:text-gray-300", label: status ?? "Không xác định" };
  }
};

/**
 * Event detail modal component with rich display.
 * Works with both LocalCalendarEvent and ExtendedCalendarEvent.
 */
const RESP_LABEL: Record<string, string> = {
  PENDING: "Chưa phản hồi",
  ACCEPTED: "Tham gia",
  DECLINED: "Không tham gia",
  MAYBE: "Có thể",
};

const respBadgeClass = (response: string): string => {
  switch (response) {
    case "ACCEPTED":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300";
    case "DECLINED":
      return "bg-rose-500/10 text-rose-600 dark:text-rose-300";
    case "MAYBE":
      return "bg-blue-500/10 text-blue-600 dark:text-blue-300";
    default:
      return "bg-gray-500/10 text-gray-500 dark:text-gray-300";
  }
};

const EventDetailModal: React.FC<{
  event: LocalCalendarEvent | ExtendedCalendarEvent;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  isViewingOthers?: boolean;
  /** Raw HR event (when available) — carries participant roster + response state. */
  hrEvent?: HRCalendarEvent;
  /** Called when the current user (an invitee) accepts/declines. */
  onRespond?: (response: "ACCEPTED" | "DECLINED") => Promise<void> | void;
}> = ({ event, onClose, onEdit, onDelete, isViewingOthers = false, hrEvent, onRespond }) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [showEditConfirm, setShowEditConfirm] = React.useState(false);
  const [responding, setResponding] = React.useState<null | "ACCEPTED" | "DECLINED">(null);
  // Khối đính kèm collapse — mặc định đóng cho gọn modal.
  const [attachmentsOpen, setAttachmentsOpen] = React.useState(false);
  const colors = getEventColor(event.type);
  const isExtended = "startAt" in event && event.startAt;

  // Owner (người tạo) không nằm trong participants[] từ BE, nhưng phải xuất hiện
  // trong danh sách "Người tham gia" để đồng bộ với avatar stack ở Day/Week/Widget
  // (cả 2 chiều người tạo ↔ người nhận thấy đủ mặt). Ghép owner lên đầu, dedup.
  const hrParticipants = React.useMemo(() => {
    const list = hrEvent?.participants ?? [];
    const owner = hrEvent?.owner;
    if (!owner) return list;
    const ownerCode = owner.employeeCode?.toLowerCase();
    const ownerName = owner.fullName?.trim().toLowerCase();
    const already = list.some(
      (p) =>
        (ownerCode &&
          (p.employeeCode?.toLowerCase() === ownerCode ||
            p.employee?.employeeCode?.toLowerCase() === ownerCode)) ||
        (ownerName &&
          (p.fullName?.trim().toLowerCase() === ownerName ||
            p.employee?.fullName?.trim().toLowerCase() === ownerName)),
    );
    if (already) return list;
    // Người tạo mặc định coi như đã tham gia (ACCEPTED).
    const ownerRow: HRCalendarParticipant = {
      id: `owner-${owner.id}`,
      employeeId: owner.id,
      authUserId: hrEvent?.ownerAuthUserId ?? null,
      employeeCode: owner.employeeCode,
      fullName: owner.fullName,
      avatarUrl: (owner as { avatarUrl?: string | null }).avatarUrl ?? null,
      employee: { id: owner.id, fullName: owner.fullName, employeeCode: owner.employeeCode },
      response: "ACCEPTED",
      createdAt: hrEvent?.createdAt ?? new Date().toISOString(),
    };
    return [ownerRow, ...list];
  }, [hrEvent]);
  const isHrOwner = !!hrEvent?.canEdit;
  const canRespond = !!hrEvent?.isParticipant && !isHrOwner && !!onRespond;
  const respSummary = {
    total: hrParticipants.length,
    accepted: hrParticipants.filter((p) => p.response === "ACCEPTED").length,
    declined: hrParticipants.filter((p) => p.response === "DECLINED").length,
    pending: hrParticipants.filter((p) => p.response === "PENDING").length,
  };
  // Avatar + phòng ban/công ty lấy từ chat-web /users/batch theo authUserId
  // (GIỐNG avatar stack ở Day/Week/Widget) — hr-api không trả company/avatar chuẩn.
  const [participantProfiles, setParticipantProfiles] = React.useState<
    Record<string, UserProfileSummary | null>
  >({});
  React.useEffect(() => {
    const ids = [
      ...new Set(
        hrParticipants
          .map((p) => p.authUserId)
          .filter((id): id is string => !!id),
      ),
    ];
    if (ids.length === 0) return;
    void loadUserProfiles(ids).then(setParticipantProfiles);
  }, [hrParticipants]);
  // Tên gợi nhớ (alias) đã được friendshipStore inject vào enrichedProfileStore
  // theo userId (= authUserId). Ưu tiên alias hơn tên thật khi hiển thị.
  const aliasByUserId = useEnrichedProfileStore((s) => s.nameByUserId);
  const handleRespondClick = async (response: "ACCEPTED" | "DECLINED") => {
    if (!onRespond) return;
    setResponding(response);
    try {
      await onRespond(response);
    } finally {
      setResponding(null);
    }
  };

  // Permission: use canEdit/canDelete from API when available (hr-api-service),
  // otherwise fall back to owner check (chat-api-service)
  const apiCanEdit = "canEdit" in event ? event.canEdit : undefined;
  const apiCanDelete = "canDelete" in event ? event.canDelete : undefined;

  // If viewing others, always disable edit/delete
  const canEdit = !isViewingOthers && (apiCanEdit ?? false) && !!onEdit;
  const canDelete = !isViewingOthers && (apiCanDelete ?? false) && !!onDelete;

  // Get status badge info
  const statusInfo = "status" in event ? getStatusBadge(event.status) : null;

  // Time display — convert ISO (UTC) to local wall-clock
  const startTime = isExtended && "startAt" in event ? toLocalTimeString(event.startAt) : event.time;
  const endTime = isExtended && "endAt" in event ? toLocalTimeString(event.endAt) : null;
  const duration = isExtended && "startAt" in event && "endAt" in event && event.startAt && event.endAt
    ? calculateDuration(event.startAt, event.endAt)
    : null;
  // Sự kiện kéo dài nhiều ngày (qua đêm / công tác) → bắt đầu & kết thúc khác ngày local.
  const startAtIso = isExtended && "startAt" in event ? event.startAt : null;
  const endAtIso = isExtended && "endAt" in event ? event.endAt : null;
  const startDateLocal = startAtIso ? toLocalDateString(startAtIso) : null;
  const endDateLocal = endAtIso ? toLocalDateString(endAtIso) : null;
  const isMultiDay = !!(startDateLocal && endDateLocal && startDateLocal !== endDateLocal);

  // Location + meeting extras (chairman/format lưu trong metadata của HR event)
  const meetingMeta = getMeetingMetadata(hrEvent);
  const location = "meetingLocation" in event ? event.meetingLocation : null;
  const format = meetingMeta.meetingFormat ?? ("meetingFormat" in event ? event.meetingFormat : null);
  const chairman = meetingMeta.meetingChairman ?? ("meetingChairman" in event ? event.meetingChairman : null) ?? null;
  const attendees = "attendees" in event ? event.attendees : null;
  const visibility = "visibility" in event ? event.visibility : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-lg animate-scale-in rounded-xl border border-border bg-surface p-6 shadow-lg">
        <button
          type="button"
          onClick={onClose}
          title="Đóng"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-micro"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>

        <div className="scrollbar-hide max-h-[calc(100vh-8rem)] overflow-y-auto pr-1">
          {/* Header: Type badge + Status badge + Read-only badge */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {isViewingOthers && (
              <div className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                <EyeIcon className="h-3 w-3" />
                Chỉ xem
              </div>
            )}
            {canRespond && (
              <div className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                <UsersIcon className="h-3 w-3" />
                Được mời
              </div>
            )}
            <div
              className={clsx(
                "inline-block rounded-full px-3 py-1 text-xs font-medium",
                colors.bg,
                colors.text
              )}
            >
              {getEventTypeLabel(event.type)}
            </div>
            {statusInfo && (
              <div
                className={clsx(
                  "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                  statusInfo.bg,
                  statusInfo.text
                )}
              >
                {statusInfo.label}
              </div>
            )}
          </div>

          {/* Title */}
          <h3 className="text-xl font-semibold text-text-primary">
            {event.title}
          </h3>

          {/* Date and Time Section */}
          <div className="mt-4 space-y-2">
            {isMultiDay ? (
              /* Sự kiện nhiều ngày: hiện rõ mốc bắt đầu & kết thúc kèm ngày. */
              <div className="flex items-start gap-3">
                <CalendarIcon className="mt-0.5 h-5 w-5 shrink-0 text-[#1565C0] dark:text-[#6BA8F0]" />
                <div className="space-y-1">
                  <p className="text-sm text-text-primary">
                    <span className="font-medium text-text-secondary">Bắt đầu: </span>
                    {formatDateVN(startAtIso!)}
                    {startTime && ` · ${startTime}`}
                  </p>
                  <p className="text-sm text-text-primary">
                    <span className="font-medium text-text-secondary">Kết thúc: </span>
                    {formatDateVN(endAtIso!)}
                    {endTime && ` · ${endTime}`}
                  </p>
                  {duration && (
                    <p className="text-xs text-text-muted">Thời lượng: {duration}</p>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Date */}
                <div className="flex items-start gap-3">
                  <CalendarIcon className="mt-0.5 h-5 w-5 shrink-0 text-[#1565C0] dark:text-[#6BA8F0]" />
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {isExtended && event.startAt ? formatDateVN(event.startAt) : event.date}
                    </p>
                  </div>
                </div>

                {/* Time (for API events with startAt) */}
                {isExtended && startTime && (
                  <div className="flex items-start gap-3">
                    <ClockIcon className="mt-0.5 h-5 w-5 shrink-0 text-text-muted" />
                    <div>
                      <p className="text-sm text-text-primary">
                        {startTime}
                        {endTime && ` — ${endTime}`}
                      </p>
                      {duration && (
                        <p className="text-xs text-text-muted">
                          Thời lượng: {duration}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Location / Meeting Link */}
            {location && (
              <div className="flex items-start gap-3">
                {format === "online" ? (
                  <VideoCameraIcon className="mt-0.5 h-5 w-5 shrink-0 text-[#1565C0] dark:text-[#6BA8F0]" />
                ) : (
                  <MapPinIcon className="mt-0.5 h-5 w-5 shrink-0 text-text-muted" />
                )}
                <p className="text-sm text-text-primary break-all">
                  {location}
                </p>
              </div>
            )}

            {/* Meeting format */}
            {format && (
              <div className="flex items-center gap-3">
                {format === "online" ? (
                  <VideoCameraIcon className="h-5 w-5 shrink-0 text-[#1565C0] dark:text-[#6BA8F0]" />
                ) : (
                  <BuildingOfficeIcon className="h-5 w-5 shrink-0 text-text-muted" />
                )}
                <p className="text-sm text-text-primary">
                  {format === "online" ? "Trực tuyến (Online)" : "Trực tiếp (Offline)"}
                </p>
              </div>
            )}

            {/* Chairman */}
            {chairman && (
              <div className="flex items-start gap-3">
                <UserIcon className="mt-0.5 h-5 w-5 shrink-0 text-[#1565C0] dark:text-[#6BA8F0]" />
                <div>
                  <p className="text-xs font-medium text-[#1565C0] dark:text-[#6BA8F0]">
                    Chủ trì
                  </p>
                  <p className="text-sm text-text-primary">
                    {chairman}
                  </p>
                </div>
              </div>
            )}

            {/* Attendees (name-only): full fallback khi không có HR roster;
                khi có roster thì chỉ hiện thêm khách mời free-text từ metadata */}
            {(() => {
              const nameOnlyAttendees = hrEvent
                ? (meetingMeta.attendees ?? [])
                : (attendees ?? []);
              return nameOnlyAttendees.length > 0 ? (
              <div className="flex items-start gap-3">
                <UsersIcon className="mt-0.5 h-5 w-5 shrink-0 text-[#1565C0] dark:text-[#6BA8F0]" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-[#1565C0] dark:text-[#6BA8F0]">
                    {hrEvent ? `Khách mời khác (${nameOnlyAttendees.length})` : `Thành viên (${nameOnlyAttendees.length})`}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {nameOnlyAttendees.slice(0, 10).map((name, idx) => (
                      <span
                        key={`${name}-${idx}`}
                        className="inline-flex items-center rounded-full bg-surface-hover px-2 py-0.5 text-xs text-text-primary"
                      >
                        {name}
                      </span>
                    ))}
                    {nameOnlyAttendees.length > 10 && (
                      <span className="inline-flex items-center rounded-full bg-surface-hover px-2 py-0.5 text-xs text-text-muted">
                        +{nameOnlyAttendees.length - 10} người khác
                      </span>
                    )}
                  </div>
                </div>
              </div>
              ) : null;
            })()}

            {/* Quyền xem (visibility) */}
            {visibility && (
              <div className="flex items-start gap-3">
                <EyeIcon className="mt-0.5 h-5 w-5 shrink-0 text-text-muted" />
                <div>
                  <p className="text-xs font-medium text-text-muted">Quyền xem</p>
                  <p className="text-sm text-text-primary">
                    {visibility === "PUBLIC" ? "Công khai" :
                      visibility === "TEAM" ? "Nhóm" :
                      visibility === "UNIT" ? "Đơn vị" :
                      visibility === "PRIVATE" ? "Riêng tư (ẩn hoàn toàn)" :
                      "Riêng tư (người khác chỉ thấy “Bận”)"}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Ghi chú (description) — render markdown để bảng/danh sách hiển thị đẹp */}
          {event.description && (
            <div className="mt-4 border-t border-border pt-4">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[#1565C0] dark:text-[#6BA8F0]">
                <DocumentTextIcon className="h-4 w-4" />
                Ghi chú
              </p>
              <div className="rounded-lg bg-surface-overlay/60 p-3 text-sm leading-relaxed text-text-secondary">
                <React.Suspense
                  fallback={
                    <p className="whitespace-pre-wrap">{event.description}</p>
                  }
                >
                  <MarkdownContent content={event.description} isOwn={false} />
                </React.Suspense>
              </div>
            </div>
          )}

          {/* Đính kèm (file/ảnh) — collapse, chỉ hiện khi BE trả attachments cho event này */}
          {hrEvent?.attachments && hrEvent.attachments.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setAttachmentsOpen((v) => !v)}
                aria-expanded={attachmentsOpen ? "true" : "false"}
                className="flex w-full items-center gap-1.5 text-xs font-medium text-[#1565C0] hover:text-[#0D47A1] dark:text-[#6BA8F0] dark:hover:text-[#93C5FD]"
              >
                <PaperClipIcon className="h-4 w-4" />
                Đính kèm ({hrEvent.attachments.length})
                <ChevronRightIcon
                  className={`ml-auto h-4 w-4 transition-transform ${attachmentsOpen ? "rotate-90" : ""}`}
                />
              </button>
              {attachmentsOpen && (
                <div className="mt-2">
                  <CalendarAttachmentList attachments={hrEvent.attachments} />
                </div>
              )}
            </div>
          )}

          {/* HR participant roster (with response status) */}
          {hrEvent && hrParticipants.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-medium text-[#1565C0] dark:text-[#6BA8F0]">
                  <UsersIcon className="h-4 w-4" />
                  Người tham gia ({respSummary.total})
                </p>
                {isHrOwner && (
                  <div className="flex flex-wrap gap-1 text-[11px] font-medium">
                    <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-emerald-600 dark:text-emerald-300">
                      {respSummary.accepted} tham gia
                    </span>
                    <span className="rounded-full bg-rose-500/10 px-1.5 py-0.5 text-rose-600 dark:text-rose-300">
                      {respSummary.declined} từ chối
                    </span>
                    <span className="rounded-full bg-gray-500/10 px-1.5 py-0.5 text-gray-500 dark:text-gray-300">
                      {respSummary.pending} chưa
                    </span>
                  </div>
                )}
              </div>
              {/* Ô cố định ~5 người; vượt thì cuộn trong khung, không phá layout modal. */}
              <div className="max-h-[228px] space-y-1.5 overflow-y-auto pr-1">
                {hrParticipants.map((p) => {
                  const profile = p.authUserId
                    ? participantProfiles[p.authUserId]
                    : null;
                  const alias = p.authUserId ? aliasByUserId[p.authUserId] : undefined;
                  const name =
                    alias ?? p.fullName ?? p.employee?.fullName ?? "N/A";
                  // Dòng phụ: phòng ban + công ty (từ /users/batch). Fallback phòng
                  // ban hr-api nếu chưa có profile.
                  const dept = profile?.department ?? p.departmentName ?? "";
                  const company = profile?.company ?? "";
                  const sub = [dept, company].filter(Boolean).join(" · ");
                  return (
                    <div key={p.id} className="flex items-center gap-2">
                      <Avatar
                        src={resolvePublicResourceUrl(
                          profile?.avatarUrl ?? p.avatarUrl ?? undefined,
                        )}
                        alt={name}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-text-primary">{name}</p>
                        {sub && <p className="truncate text-[11px] text-text-muted">{sub}</p>}
                      </div>
                      <span
                        className={clsx(
                          "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                          respBadgeClass(p.response),
                        )}
                      >
                        {RESP_LABEL[p.response] ?? p.response}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Invitee response actions */}
          {canRespond && (
            <div className="mt-4 rounded-lg border border-border bg-surface-overlay p-3">
              <p className="mb-2 text-sm font-medium text-text-primary">
                Bạn được mời tham gia lịch họp này
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={responding !== null}
                  onClick={() => handleRespondClick("ACCEPTED")}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-micro hover:bg-emerald-700 disabled:opacity-60"
                >
                  {responding === "ACCEPTED" ? "Đang lưu..." : "Tham gia"}
                </button>
                <button
                  type="button"
                  disabled={responding !== null}
                  onClick={() => handleRespondClick("DECLINED")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-600 transition-micro hover:bg-rose-100 disabled:opacity-60 dark:border-rose-700 dark:bg-rose-900/20 dark:text-rose-300"
                >
                  {responding === "DECLINED" ? "Đang lưu..." : "Không tham gia"}
                </button>
              </div>
            </div>
          )}

          {/* Action buttons — Xóa (phá hoại) ở góc trái, Chỉnh sửa ở góc phải,
              tách xa nhau để tránh bấm nhầm. */}
          {(canEdit || canDelete) && (
            <div className="mt-6 flex items-center justify-between gap-2 border-t border-border pt-4">
              {canDelete ? (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-danger/30 bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger transition-micro hover:bg-danger/20"
                >
                  <TrashIcon className="h-4 w-4" />
                  Xóa
                </button>
              ) : (
                <span />
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setShowEditConfirm(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-micro hover:bg-primary/90"
                >
                  <PencilSquareIcon className="h-4 w-4" />
                  Chỉnh sửa
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          setShowDeleteConfirm(false);
          onDelete?.();
        }}
        title="Xóa sự kiện"
        message="Bạn có chắc muốn xóa sự kiện này? Hành động không thể hoàn tác."
        confirmText="Xóa"
        variant="danger"
      />
      <ConfirmDialog
        isOpen={showEditConfirm}
        onClose={() => setShowEditConfirm(false)}
        onConfirm={() => {
          setShowEditConfirm(false);
          onEdit?.();
        }}
        title="Chỉnh sửa sự kiện"
        message="Bạn có muốn chỉnh sửa sự kiện này không?"
        confirmText="Chỉnh sửa"
        cancelText="Hủy"
        variant="info"
      />
    </div>
  );
};

/**
 * Mini calendar component for the sidebar.
 */
const MiniCalendar: React.FC<{
  year: number;
  month: number;
  onNavigate: (year: number, month: number) => void;
  onSelectDate: (date: Date) => void;
  selectedDate: Date;
}> = ({ year, month, onNavigate, onSelectDate, selectedDate }) => {
  const days = generateCalendarDays(year, month);
  const today = new Date();
  const isToday = (date: Date) =>
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  const isSelected = (date: Date) =>
    date.getDate() === selectedDate.getDate() &&
    date.getMonth() === selectedDate.getMonth() &&
    date.getFullYear() === selectedDate.getFullYear();

  const handlePrevMonth = () => {
    if (month === 0) {
      onNavigate(year - 1, 11);
    } else {
      onNavigate(year, month - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 11) {
      onNavigate(year + 1, 0);
    } else {
      onNavigate(year, month + 1);
    }
  };

  return (
    <div className="mini-calendar">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary">
          {VIETNAMESE_MONTHS[month]} {year}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={handlePrevMonth}
            title="Tháng trước"
            className="rounded p-1 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-micro"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            title="Tháng sau"
            className="rounded p-1 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-micro"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {VIETNAMESE_WEEKDAYS.map((day) => (
          <div
            key={day}
            className="py-1 text-xs font-medium text-text-muted"
          >
            {day}
          </div>
        ))}

        {days.slice(0, 35).map((dayInfo, index) => (
          <button
            key={index}
            type="button"
            onClick={() => onSelectDate(dayInfo.date)}
            className={clsx(
              "flex h-7 w-full items-center justify-center rounded text-xs transition-micro",
              !dayInfo.isCurrentMonth && "text-text-disabled",
              dayInfo.isCurrentMonth && !isToday(dayInfo.date) && !isSelected(dayInfo.date) && "text-text-primary hover:bg-surface-hover",
              isToday(dayInfo.date) && "bg-[#1565C0] text-white font-semibold",
              isSelected(dayInfo.date) && !isToday(dayInfo.date) && "bg-[#1976D2]/10 text-[#1565C0] font-medium ring-2 ring-[#1976D2]/40"
            )}
          >
            {dayInfo.date.getDate()}
          </button>
        ))}
      </div>
    </div>
  );
};

/**
 * Event badge component.
 */
const EventBadge: React.FC<{
  event: LocalCalendarEvent;
  onClick: (event: LocalCalendarEvent) => void;
  compact?: boolean;
  /** Vị trí trong dải trải khi là lịch nhiều ngày (render thanh trải ngang). */
  spanPosition?: MultiDayPosition | null;
}> = ({ event, onClick, compact = false, spanPosition = null }) => {
  // Lịch dài ngày → thanh TRẢI NGANG: ngày bắt đầu hiện tiêu đề, ngày giữa chỉ
  // là dây nối, ngày kết thúc tô đỏ (#DC2626). Margin âm để bar lấn vào padding
  // ô (p-1.5), nối liền thành dây qua các ngày.
  if (spanPosition) {
    const isEnd = spanPosition === "end";
    const isStart = spanPosition === "start";
    // Ngày GIỮA: chỉ một sợi chỉ mảnh căn giữa, nối liền hai badge to.
    if (!isStart && !isEnd) {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClick(event);
          }}
          title={event.title}
          className="-mx-1.5 flex h-5 w-full cursor-pointer items-center"
        >
          <span className="h-1 w-full bg-amber-400/80" />
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick(event);
        }}
        title={isEnd ? `${event.title} · Kết thúc` : event.title}
        className={clsx(
          "relative flex h-5 w-full cursor-pointer items-center text-left text-xs font-semibold transition-micro hover:brightness-95 dark:hover:brightness-110",
          isStart && "-mr-1.5 rounded-l pl-1.5",
          isEnd && "-ml-1.5 rounded-r pl-1.5",
          isEnd ? "bg-[#DC2626] text-white" : "bg-amber-400/80 text-amber-900 dark:text-amber-100",
        )}
      >
        {isStart && <span className="truncate">{event.title}</span>}
        {isEnd && <span className="truncate">Kết thúc</span>}
        {/* Node tròn ở đầu/cuối dây để nhìn rõ là một liên kết. */}
        <span
          className={clsx(
            "pointer-events-none absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-amber-500",
            isStart ? "right-0 translate-x-1/2" : "left-0 -translate-x-1/2",
          )}
        />
      </button>
    );
  }

  const colors = getEventColor(event.type);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick(event);
      }}
      className={clsx(
        "event-badge block w-full cursor-pointer rounded border text-left transition-micro",
        colors.bg,
        colors.border,
        compact ? "px-1.5 py-0.5" : "px-2 py-1",
        "text-xs",
      )}
      title={event.title}
    >
      <span className={clsx("block truncate font-medium", colors.text)}>
        {event.title}
      </span>
    </button>
  );
};

/**
 * Attendance badge component for calendar day cell
 */
const AttendanceBadge: React.FC<{
  attendance: AttendanceCalendarDay;
}> = ({ attendance }) => {
  const hasPunch = !!(attendance.firstPunch || attendance.lastPunch);

  return (
    <div
      className="attendance-badge block w-full rounded border border-border bg-surface px-1.5 py-0.5 text-left text-xs"
      title={hasPunch ? `Giờ đến: ${formatTime(attendance.firstPunch)} · Giờ về: ${formatTime(attendance.lastPunch)}` : "Chưa có dữ liệu chấm công"}
    >
      {hasPunch ? (
        <span className="block space-y-0.5">
          <span className="block truncate text-text-secondary">Giờ đến: <span className="font-medium text-text-primary">{formatTime(attendance.firstPunch)}</span></span>
          <span className="block truncate text-text-secondary">Giờ về: <span className="font-medium text-text-primary">{formatTime(attendance.lastPunch)}</span></span>
        </span>
      ) : (
        <span className="block truncate text-text-muted">Chưa chấm công</span>
      )}
    </div>
  );
};

interface MonthGridDay {
  date: Date;
  isCurrentMonth: boolean;
}

/**
 * Lưới lịch tháng (35 ô) — tách khỏi CalendarPage + memo hoá để mỗi lần mở/đóng
 * modal (state ở CalendarPage) KHÔNG re-render + re-filter lại toàn bộ ô. Việc
 * lọc/sắp event theo từng ngày gom vào 1 useMemo (chạy khi data đổi, không phải
 * mỗi render). Props đều stable (useCallback/useMemo ở parent).
 */
const MonthGrid: React.FC<{
  calendarDays: MonthGridDay[];
  events: (LocalCalendarEvent | ExtendedCalendarEvent)[];
  getAttendanceForDate: (date: Date) => AttendanceCalendarDay | undefined;
  isToday: (date: Date) => boolean;
  isSelected: (date: Date) => boolean;
  isAttendanceFilterActive: boolean;
  showAttendance: boolean;
  onOpenDay: (date: Date) => void;
  onEventClick: (event: LocalCalendarEvent | ExtendedCalendarEvent) => void;
}> = React.memo(
  ({
    calendarDays,
    events,
    getAttendanceForDate,
    isToday,
    isSelected,
    isAttendanceFilterActive,
    showAttendance,
    onOpenDay,
    onEventClick,
  }) => {
    // Lọc + sắp event cho từng ô 1 lần / khi data đổi (thay vì mỗi render × mỗi ô).
    const perDay = useMemo(
      () =>
        calendarDays.map((dayInfo) => {
          const dayEvents = events
            .filter((event) => eventOccursOnDay(event, dayInfo.date))
            .slice()
            .sort((a, b) => {
              const aSpan = getMultiDayPosition(a, dayInfo.date) !== null;
              const bSpan = getMultiDayPosition(b, dayInfo.date) !== null;
              if (aSpan !== bSpan) return aSpan ? -1 : 1;
              return (a.time ?? "").localeCompare(b.time ?? "");
            });
          return { dayInfo, dayEvents };
        }),
      [calendarDays, events],
    );

    return (
      <div className="flex-1 overflow-auto p-4">
        {/* Weekday headers */}
        <div className="mb-2 grid grid-cols-7 gap-px">
          {VIETNAMESE_WEEKDAYS.map((day, index) => (
            <div
              key={day}
              className={clsx(
                "py-2 text-center text-sm font-medium",
                index === 0 ? "text-rose-500 dark:text-rose-400" : "text-text-secondary",
              )}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar days grid */}
        <div className="grid grid-cols-7 gap-px rounded-lg border border-border bg-surface">
          {perDay.map(({ dayInfo, dayEvents }, index) => {
            const maxVisibleEvents = 2;
            const visibleEvents = dayEvents.slice(0, maxVisibleEvents);
            const remainingCount = dayEvents.length - maxVisibleEvents;
            const attendance = getAttendanceForDate(dayInfo.date);

            return (
              <div
                key={index}
                onClick={() => onOpenDay(dayInfo.date)}
                title="Mở lịch ngày"
                className={clsx(
                  "min-h-[120px] cursor-pointer border-border bg-surface p-1.5 transition-micro",
                  !dayInfo.isCurrentMonth && "bg-surface-overlay",
                  dayInfo.isCurrentMonth && !isToday(dayInfo.date) && "hover:bg-surface-hover",
                  isSelected(dayInfo.date) &&
                    !isToday(dayInfo.date) &&
                    "ring-1 ring-border-strong ring-inset",
                )}
              >
                {/* Date number */}
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={clsx(
                      "flex h-7 w-7 items-center justify-center rounded-full text-sm",
                      !dayInfo.isCurrentMonth && "text-text-disabled",
                      dayInfo.isCurrentMonth && !isToday(dayInfo.date) && "text-text-primary",
                      isToday(dayInfo.date) && "bg-[#1565C0] text-white font-semibold",
                    )}
                  >
                    {dayInfo.date.getDate()}
                  </span>
                </div>

                {/* Attendance badge — only show for own calendar */}
                {attendance && isAttendanceFilterActive && showAttendance && (
                  <div className="mb-1">
                    <AttendanceBadge attendance={attendance} />
                  </div>
                )}

                {/* Events */}
                <div className="space-y-0.5">
                  {visibleEvents.map((event) => (
                    <EventBadge
                      key={event.id}
                      event={event}
                      onClick={onEventClick}
                      compact
                      spanPosition={getMultiDayPosition(event, dayInfo.date)}
                    />
                  ))}
                  {remainingCount > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenDay(dayInfo.date);
                      }}
                      className="block w-full px-1.5 py-0.5 text-xs font-medium text-text-muted hover:text-[#1565C0] transition-micro"
                    >
                      +{remainingCount} sự kiện
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);

/**
 * Calendar page component.
 */
export const CalendarPage: React.FC = () => {
  const today = new Date();

  // Calendar store
  const storeState = useCalendarStore();
  const {
    mode,
    view: currentView,
    setView,
    events: apiEvents,
    viewingUserName,
    viewingUnitName,
    filters,
    setFilters,
    setViewingUser,
    fetchEvents,
    deleteEvent,
    isLoading: storeLoading,
  } = storeState;

  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedEvent, setSelectedEvent] = useState<LocalCalendarEvent | ExtendedCalendarEvent | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Khi navigate từ widget lịch tuần với state { openEventId, openEventSource, view }
  const location = useLocation();
  const handledNavState = useRef(false);
  const [pendingOpenEventId, setPendingOpenEventId] = useState<string | null>(null);

  // Attendance data state. (Loading/error state đã bỏ: giá trị chưa từng được
  // render — chỉ giữ data + log lỗi ra console cho dev.)
  const [attendanceData, setAttendanceData] = useState<AttendanceCalendarDay[]>([]);


  // Meeting form modal state
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [meetingModalDate, setMeetingModalDate] = useState<string | undefined>();
  const [meetingModalStart, setMeetingModalStart] = useState<string | undefined>();
  const [meetingModalEnd, setMeetingModalEnd] = useState<string | undefined>();

  // "Thêm lịch" type chooser — họp vs cá nhân. Giữ lại ngày/giờ điền sẵn để
  // chuyển sang đúng form sau khi user chọn loại.
  const [eventTypeChooserOpen, setEventTypeChooserOpen] = useState(false);

  // Personal event form modal state
  const [personalModalOpen, setPersonalModalOpen] = useState(false);
  const [personalModalDate, setPersonalModalDate] = useState<string | undefined>();
  const [personalModalStart, setPersonalModalStart] = useState<string | undefined>();
  const [personalModalEnd, setPersonalModalEnd] = useState<string | undefined>();

  // Edit event modal state
  const [editingEvent, setEditingEvent] = useState<MeetingFormData | null>(null);

  // Edit personal event modal state — lịch cá nhân sửa bằng form cá nhân, không
  // phải form họp (xem handleEditEvent: nhánh theo type).
  const [editingPersonalEvent, setEditingPersonalEvent] = useState<PersonalEventFormData | null>(null);

  // Delete confirmation dialog state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // User search modal state
  const [userSearchModalOpen, setUserSearchModalOpen] = useState(false);

  // Create event loading state
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);

  // Handle select user from search
  const handleSelectUser = (userId: string, userName: string) => {
    setViewingUser(userId, userName);
  };

  // Đọc navigation state từ widget lịch tuần → switch sang week view + mở event.
  // Effect hợp lệ: react theo location.state (router). set-state đồng bộ là chủ ý
  // (one-shot, guard bằng handledNavState) → theo convention repo, disable rule.
  useEffect(() => {
    if (handledNavState.current) return;
    const navState = location.state as { openEventId?: string; view?: string } | null;
    if (!navState?.openEventId) return;
    handledNavState.current = true;
    setView("week");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingOpenEventId(navState.openEventId);
    // Clear state khỏi history để back/refresh không mở lại
    window.history.replaceState({}, "");
  }, [location.state, setView]);

  // Khi apiEvents đã load và còn pending event id → tìm và mở. Effect hợp lệ:
  // react theo data async về (không phải derive thuần).
  useEffect(() => {
    if (!pendingOpenEventId || !apiEvents.length) return;
    const match = apiEvents.find((e) => e.id === pendingOpenEventId);
    if (match) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedEvent(mapHrmEventToCalendarEvent(match));
      setPendingOpenEventId(null);
    }
  }, [pendingOpenEventId, apiEvents]);

  // Quay về "Lịch của tôi" ngay tại chỗ (không cần reload trang).
  // setMode tự gọi fetchEvents() theo currentMonth của STORE — vốn không đồng bộ
  // với tháng đang xem của TRANG, gây load nhầm range. Đồng bộ range vào store
  // trước (setDate không fetch) rồi mới setMode để fetch đúng tháng đang xem.
  const handleBackToMyCalendar = useCallback(() => {
    const store = useCalendarStore.getState();
    store.setDate(currentYear, currentMonth);
    store.setMode("my");
  }, [currentYear, currentMonth]);

  // Refetch theo đúng tháng đang xem của TRANG (store có thể giữ tháng khác)
  const refetchCurrentMonth = useCallback(() => {
    const { from, to } = getMonthFetchRange(currentYear, currentMonth);
    void fetchEvents(from, to);
  }, [currentYear, currentMonth, fetchEvents]);

  // Handle create event from MeetingFormModal
  const handleCreateEvent = useCallback(async (data: MeetingFormData) => {
    try {
      setIsCreatingEvent(true);

      // Map MeetingFormData to hr-api-service CreateCalendarEventInput
      // Interpret the picked date+time as LOCAL wall-clock, then convert to an
      // absolute instant (UTC ISO). Appending "Z" directly would wrongly treat
      // local time as UTC (a 7h shift in Vietnam).
      const startAt = new Date(`${data.date}T${data.startTime}:00`).toISOString();
      const endAt = new Date(`${data.date}T${data.endTime}:00`).toISOString();
      const timezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Ho_Chi_Minh";

      // Người được tag phải nhận được lịch → gửi mọi ref backend resolve được
      // (employee cuid / employeeCode / authUserId). Tên free-text (không có
      // identity) lưu vào metadata.attendees để hiển thị.
      const { refs: participantIds, freeTextNames } = buildParticipantPayload(data);

      // Upload file đính kèm (nếu bật flag) TRƯỚC khi tạo event → lấy fileIds.
      const attachmentFileIds = await resolveAttachmentFileIds(data.attachments);

      const input = {
        title: data.title,
        description: data.notes || undefined,
        startAt,
        endAt,
        eventType: "MEETING" as const,
        // Quyền xem theo lựa chọn trên form (mặc định riêng tư → BUSY_ONLY).
        visibility: meetingVisibilityToApi(data.visibility),
        isAllDay: false,
        location: data.location || undefined,
        timezone,
        participantIds,
        attendees: freeTextNames.length > 0 ? freeTextNames : undefined,
        meetingChairman: data.chairman || undefined,
        meetingFormat: data.format,
        attachmentFileIds,
      };

      // Use store's createEvent which handles API call + state update (+ toast)
      const result = await useCalendarStore.getState().createEvent(input);

      if (result) {
        // MOCK: lưu mapping eventId → fileIds để list/detail hiển thị lại.
        await persistMockAttachmentMapping(result.id, attachmentFileIds);
        // Store chỉ chèn event nếu khớp range nội bộ của store (có thể lệch
        // với tháng đang xem của trang) → refetch theo range của trang.
        refetchCurrentMonth();
      }
    } catch (error) {
      console.error("Failed to create event:", error);
      toast.error(
        error instanceof CalendarAttachmentUploadError
          ? `Không tải được đính kèm${error.filename ? ` "${error.filename}"` : ""}. Vui lòng thử lại.`
          : "Không thể thêm lịch. Vui lòng thử lại.",
      );
    } finally {
      setIsCreatingEvent(false);
    }
  }, [refetchCurrentMonth]);

  // Handle create personal event from PersonalEventFormModal.
  // Lịch cá nhân: eventType PERSONAL, không có người tham gia/chủ trì.
  const handleCreatePersonalEvent = useCallback(async (data: PersonalEventFormData) => {
    try {
      setIsCreatingEvent(true);
      // Picked date+time là LOCAL wall-clock → convert sang UTC ISO.
      // endDate độc lập với date → hỗ trợ sự kiện qua đêm / nhiều ngày.
      const startAt = new Date(`${data.date}T${data.startTime}:00`).toISOString();
      const endAt = new Date(`${data.endDate}T${data.endTime}:00`).toISOString();
      const timezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Ho_Chi_Minh";

      const attachmentFileIds = await resolveAttachmentFileIds(data.attachments);

      const input = {
        title: data.title,
        description: data.notes || undefined,
        startAt,
        endAt,
        // Lịch cá nhân: eventType PERSONAL, không có participants (backend tự chặn).
        // Quyền xem theo lựa chọn trên form: riêng tư → PRIVATE (chỉ owner),
        // công khai → PUBLIC.
        eventType: "PERSONAL" as const,
        visibility: personalVisibilityToApi(data.visibility),
        isAllDay: false,
        timezone,
        attachmentFileIds,
      };

      const result = await useCalendarStore.getState().createEvent(input);
      if (result) {
        await persistMockAttachmentMapping(result.id, attachmentFileIds);
        refetchCurrentMonth();
      }
    } catch (error) {
      console.error("Failed to create personal event:", error);
      toast.error(
        error instanceof CalendarAttachmentUploadError
          ? `Không tải được đính kèm${error.filename ? ` "${error.filename}"` : ""}. Vui lòng thử lại.`
          : "Không thể thêm lịch. Vui lòng thử lại.",
      );
    } finally {
      setIsCreatingEvent(false);
    }
  }, [refetchCurrentMonth]);

  // Mở bộ chọn loại lịch (họp / cá nhân) với ngày + giờ điền sẵn.
  const openEventTypeChooser = useCallback(
    (date?: string, start?: string, end?: string) => {
      setMeetingModalDate(date);
      setMeetingModalStart(start);
      setMeetingModalEnd(end);
      setPersonalModalDate(date);
      setPersonalModalStart(start);
      setPersonalModalEnd(end);
      setEventTypeChooserOpen(true);
    },
    [],
  );

  // Fetch calendar events from API when month changes or mode changes.
  // Always pass explicit date range from component state so the store doesn't
  // use its own (potentially stale) currentYear/currentMonth.
  useEffect(() => {
    const { from, to } = getMonthFetchRange(currentYear, currentMonth);
    void fetchEvents(from, to);
  }, [currentYear, currentMonth, mode]);

  // Extended events map cho detail view — thuần derive từ apiEvents → useMemo
  // (trước là effect+setState gây cascading render + chặn React Compiler).
  const apiEventsMap = useMemo(() => buildExtendedEventMap(apiEvents), [apiEvents]);

  // Lịch họp đã tải trong tháng → dùng cho check trùng giờ khi tag người tham gia.
  // Chỉ phát hiện trùng trong phạm vi event mình thấy được (sở hữu / được mời).
  const meetingsForConflictCheck = useMemo((): MeetingFormData[] => {
    return apiEvents.map((event: HRCalendarEvent): MeetingFormData => {
      const meta = getMeetingMetadata(event);
      const participantNames = event.participants
        .map((p) => p.fullName ?? p.employee?.fullName ?? "")
        .filter(Boolean)
        .map((name) => ({ name }));
      const ownerName = event.ownerName ?? event.owner?.fullName;
      if (ownerName) participantNames.push({ name: ownerName });
      return {
        id: event.id,
        title: event.title,
        date: toLocalDateString(event.startAt),
        startTime: toLocalTimeString(event.startAt),
        endTime: toLocalTimeString(event.endAt),
        chairman: meta.meetingChairman ?? "",
        participants: participantNames,
        format: meta.meetingFormat === "online" ? "online" : "offline",
        visibility: apiVisibilityToForm(event.visibility),
        location: event.location ?? "",
        notes: "",
        attachments: [],
      };
    });
  }, [apiEvents]);

  // Convert API CalendarEvent to ExtendedCalendarEvent (giữ startAt/endAt để
  // Day/Week View dựng block theo thời lượng + overlap — xem utils/timeline.ts).
  const calendarEventsFromApi = useMemo((): ExtendedCalendarEvent[] => {
    return apiEvents.map(mapHrmEventToCalendarEvent);
  }, [apiEvents]);

  // MOCK attachments (khi BE chưa trả `attachments[]`): nạp từ IndexedDB theo
  // eventId để viewer + form sửa hiển thị lại. No-op khi nối BE thật.
  const [mockAttachmentsByEventId, setMockAttachmentsByEventId] = useState<
    Record<string, CalendarAttachmentDto[]>
  >({});
  useEffect(() => {
    if (!CALENDAR_ATTACHMENTS_USE_MOCK || apiEvents.length === 0) return;
    let cancelled = false;
    void mockGetAttachmentsForEvents(apiEvents.map((e) => e.id)).then((map) => {
      if (!cancelled) setMockAttachmentsByEventId(map);
    });
    return () => {
      cancelled = true;
    };
  }, [apiEvents]);

  // Avatar người tham gia lấy từ chat-web (/users/batch, GIỐNG Poll) bằng authUserId —
  // không phụ thuộc hr-api. Batch-load 1 lần cho mọi participant đang hiển thị.
  const [participantAvatars, setParticipantAvatars] = useState<Record<string, string | null>>({});
  useEffect(() => {
    const ids = [
      ...new Set(
        calendarEventsFromApi.flatMap((e) =>
          (e.attendeeAvatars ?? [])
            .map((a) => a.userId)
            .filter((id): id is string => !!id),
        ),
      ),
    ];
    if (ids.length === 0) return;
    void loadUserProfiles(ids).then((results) => {
      setParticipantAvatars((prev) => {
        const next = { ...prev };
        for (const [id, s] of Object.entries(results)) {
          next[id] =
            resolvePublicResourceUrl(
              (s as { avatar?: string })?.avatar || s?.avatarUrl || undefined,
            ) ?? null;
        }
        return next;
      });
    });
  }, [calendarEventsFromApi]);

  // Tiêm avatar đã resolve (chat-web) vào event trước khi đẩy xuống Day/Week/Widget.
  const calendarEventsWithAvatars = useMemo((): ExtendedCalendarEvent[] => {
    if (Object.keys(participantAvatars).length === 0) return calendarEventsFromApi;
    return calendarEventsFromApi.map((e) =>
      e.attendeeAvatars?.length
        ? {
            ...e,
            attendeeAvatars: e.attendeeAvatars.map((a) =>
              a.userId && participantAvatars[a.userId]
                ? { ...a, avatarUrl: participantAvatars[a.userId] }
                : a,
            ),
          }
        : e,
    );
  }, [calendarEventsFromApi, participantAvatars]);

  // Fetch attendance data when month changes.
  // Skip when viewing another user's calendar — never show current user's attendance
  // alongside someone else's events. A future phase can fetch target user's attendance here.
  useEffect(() => {
    // Xem lịch người khác → không hiển thị chấm công của mình. Clear nằm trong
    // async fn (không set-state đồng bộ trong effect body → tránh cascading render).
    const fetchAttendance = async () => {
      if (mode === "other") {
        setAttendanceData([]);
        return;
      }
      try {
        const fromDate = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
        const toDate = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${new Date(currentYear, currentMonth + 1, 0).getDate().toString().padStart(2, "0")}`;

        const data = await hrApi.getMyAttendanceCalendar({ from: fromDate, to: toDate });
        // reason EMPLOYEE_NOT_LINKED / NO_ATTENDANCE_DATA → items rỗng → lịch trống (không có badge).
        setAttendanceData(data.items ?? []);
      } catch (error: unknown) {
        console.error("Failed to fetch attendance:", error);
        setAttendanceData([]);
      }
    };

    void fetchAttendance();
  }, [currentYear, currentMonth, mode]);

  // Calendar type filters — local state for display
  const localFilters = useMemo((): CalendarTypeFilter[] => {
    const defaultFilters: CalendarTypeFilter[] = [
      { type: "meeting", label: "Lịch họp", color: "bg-teal-500", checked: true },
      { type: "personal", label: "Cá nhân", color: "bg-amber-500", checked: true },
      { type: "attendance", label: "Chấm công", color: "bg-emerald-500", checked: false },
    ];

    if (filters.types.length === 0) return defaultFilters;

    return defaultFilters.map(f => ({
      ...f,
      checked: filters.types.some(t => t.toLowerCase() === f.type || mapLocalTypeToApi(t) === f.type),
    }));
  }, [filters]);

  const handleFilterChange = (type: EventType) => {
    const currentTypes = filters.types.length > 0
      ? filters.types
      : ["meeting", "personal"] as EventType[];
    
    const newTypes = currentTypes.includes(type)
      ? currentTypes.filter(t => t !== type)
      : [...currentTypes, type];
    
    setFilters(newTypes);
  };

  // Calendar chỉ hiển thị sự kiện từ API (họp/cá nhân…); không còn nhiệm vụ & ngày lễ.
  const allEvents = calendarEventsWithAvatars;

  // Filter events based on selected filters
  const filteredEvents = useMemo(() => {
    const activeTypes = localFilters.filter((f) => f.checked).map((f) => f.type);
    return filterCalendarEventsByType(allEvents, activeTypes);
  }, [allEvents, localFilters]);

  // Search filtered events
  const searchedEvents = useMemo(() => {
    if (!searchQuery.trim()) return filteredEvents;
    const query = searchQuery.toLowerCase();
    return filteredEvents.filter(
      (event) =>
        event.title.toLowerCase().includes(query) ||
        event.description?.toLowerCase().includes(query)
    );
  }, [filteredEvents, searchQuery]);

  // Generate calendar days
  const calendarDays = useMemo(
    () => generateCalendarDays(currentYear, currentMonth),
    [currentYear, currentMonth]
  );

  // Get attendance for a specific date
  const getAttendanceForDate = useCallback(
    (date: Date): AttendanceCalendarDay | undefined => {
      const dateStr = formatDateString(date);
      return attendanceData.find((a) => a.date === dateStr);
    },
    [attendanceData]
  );

  // Check if a date is today
  const todaySnapshot = React.useMemo(() => new Date(), []);
  const isToday = useCallback(
    (date: Date) =>
      date.getDate() === todaySnapshot.getDate() &&
      date.getMonth() === todaySnapshot.getMonth() &&
      date.getFullYear() === todaySnapshot.getFullYear(),
    [todaySnapshot]
  );

  // Check if a date is selected
  const isSelected = useCallback(
    (date: Date) =>
      date.getDate() === selectedDate.getDate() &&
      date.getMonth() === selectedDate.getMonth() &&
      date.getFullYear() === selectedDate.getFullYear(),
    [selectedDate]
  );

  // Handlers thuần set-state: KHÔNG useCallback thủ công — để React Compiler tự
  // memo (deps thủ công lệch deps compiler suy ra → nó bỏ optimize cả component).
  const goToPrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentYear((y) => y - 1);
      setCurrentMonth(11);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentYear((y) => y + 1);
      setCurrentMonth(0);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const goToToday = () => {
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
    setSelectedDate(now);
  };

  // Dịch ngày đang chọn (day/week view) ±deltaDays, đồng bộ tháng/năm để refetch
  // đúng range (event của tháng kề tại biên tuần là giới hạn Phase 1).
  const shiftSelected = (deltaDays: number) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + deltaDays);
    setSelectedDate(next);
    setCurrentYear(next.getFullYear());
    setCurrentMonth(next.getMonth());
  };

  // Nhãn tiêu đề theo chế độ xem.
  const dayTitle = useMemo(() => {
    const wd = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
    return `${wd[selectedDate.getDay()]}, ${selectedDate.getDate()}/${selectedDate.getMonth() + 1}/${selectedDate.getFullYear()}`;
  }, [selectedDate]);

  const weekTitle = useMemo(() => {
    const days = getWeekDays(selectedDate);
    const start = days[0];
    const end = days[6];
    const fmt = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    return `Tuần ${getIsoWeekNumber(selectedDate)} · ${fmt(start)}–${fmt(end)}/${end.getFullYear()}`;
  }, [selectedDate]);

  // Handle mini calendar navigation
  const handleMiniCalendarNavigate = (year: number, month: number) => {
    setCurrentYear(year);
    setCurrentMonth(month);
    setSelectedDate(new Date(year, month, 1));
  };

  // Handle date selection — đồng bộ tháng/năm để ngày của tháng kề (ô mờ trong
  // lưới tháng) chuyển đúng tháng khi chọn, không chỉ set selectedDate.
  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    setCurrentYear(date.getFullYear());
    setCurrentMonth(date.getMonth());
  };

  // Mở Day view của một ngày (click ô ngày trong lưới Tháng / tiêu đề ngày Tuần).
  const handleOpenDay = (date: Date) => {
    handleDateClick(date);
    setView("day");
  };

  // Click ô khung giờ trên lưới Day/Week → mở form tạo lịch với giờ điền sẵn,
  // snap về mốc 30 phút (kiểu Teams), thời lượng mặc định 30 phút.
  const handleCreateAtSlot = useCallback(
    (date: Date, minutes: number) => {
      if (mode === "other") return; // xem lịch người khác → không tạo
      const fmt = (m: number) =>
        `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      const snapped = Math.max(0, Math.min(Math.floor(minutes / 30) * 30, 23 * 60 + 30));
      const endM = snapped + 30;
      openEventTypeChooser(
        formatDateString(date),
        fmt(snapped),
        endM >= 24 * 60 ? "23:59" : fmt(endM),
      );
    },
    [mode, openEventTypeChooser],
  );

  // Handle event click — open detail modal (extended data if available)
  const handleEventClick = useCallback(
    (event: LocalCalendarEvent) => {
      const extended = apiEventsMap[event.id];
      setSelectedEvent(extended ?? event);
    },
    [apiEventsMap]
  );

  // Raw HR event for the selected item — carries participant roster + response.
  const selectedHrEvent = useMemo(() => {
    if (!selectedEvent) return undefined;
    const found = apiEvents.find((e) => e.id === selectedEvent.id);
    if (!found) return undefined;
    // MOCK: overlay attachments từ IndexedDB nếu BE chưa trả (found.attachments rỗng).
    const mockAtts = mockAttachmentsByEventId[found.id];
    if (mockAtts && (!found.attachments || found.attachments.length === 0)) {
      return { ...found, attachments: mockAtts };
    }
    return found;
  }, [selectedEvent, apiEvents, mockAttachmentsByEventId]);

  // Handle edit event — open MeetingFormModal with pre-filled data
  const handleEditEvent = useCallback(() => {
    if (!selectedEvent) return;

    // Check if viewing others — don't allow edit
    if (mode === "other") {
      toast.warning("Bạn không có quyền chỉnh sửa sự kiện này.");
      return;
    }

    // Check if current user has edit permission (from API)
    const extended = apiEventsMap[selectedEvent.id];
    if (extended && extended.canEdit === false) {
      toast.warning("Bạn không có quyền chỉnh sửa sự kiện này.");
      return;
    }

    // Check if it's an extended event with startAt/endAt
    const isExtended = "startAt" in selectedEvent && selectedEvent.startAt;

    // Only allow editing API events (with startAt/endAt)
    if (!isExtended) {
      toast.warning("Chỉ có thể chỉnh sửa lịch tạo từ hệ thống");
      return;
    }

    const extEvent = selectedEvent as ExtendedCalendarEvent;

    // Lịch cá nhân (type "personal") → mở form cá nhân, không phải form họp.
    if (extEvent.type === "personal") {
      const personalStartDate = extEvent.startAt
        ? toLocalDateString(extEvent.startAt)
        : formatDateString(new Date());
      const personalData: PersonalEventFormData = {
        id: extEvent.id,
        title: extEvent.title,
        date: personalStartDate,
        // endAt có thể rơi vào ngày khác (qua đêm / nhiều ngày) → lấy ngày local của endAt.
        endDate: extEvent.endAt ? toLocalDateString(extEvent.endAt) : personalStartDate,
        startTime: extEvent.startAt ? toLocalTimeString(extEvent.startAt) : "08:00",
        endTime: extEvent.endAt ? toLocalTimeString(extEvent.endAt) : "09:00",
        notes: extEvent.description || "",
        visibility: apiVisibilityToForm(selectedHrEvent?.visibility ?? extEvent.visibility),
        attachments: remoteAttachmentsToForm(selectedHrEvent?.attachments),
      };
      setEditingPersonalEvent(personalData);
      return;
    }

    const meta = getMeetingMetadata(selectedHrEvent);

    // Người tham gia: ưu tiên roster HR (giữ employeeId để update giữ nguyên
    // liên kết); kèm khách mời free-text từ metadata. Fallback tên hiển thị.
    const participants: MeetingFormData["participants"] = selectedHrEvent
      ? [
          ...selectedHrEvent.participants.map((p) => ({
            name: p.fullName ?? p.employee?.fullName ?? p.employeeCode ?? "N/A",
            employeeId: p.employeeId,
            employeeCode: p.employeeCode ?? p.employee?.employeeCode ?? undefined,
            userId: p.authUserId ?? undefined,
          })),
          ...(meta.attendees ?? []).map((name) => ({ name })),
        ]
      : (extEvent.attendees || []).map((name) => ({ name }));

    // Build MeetingFormData from HR event (+ metadata) / ExtendedCalendarEvent
    const data: MeetingFormData = {
      id: extEvent.id,
      title: extEvent.title,
      date: extEvent.startAt ? toLocalDateString(extEvent.startAt) : formatDateString(new Date()),
      startTime: extEvent.startAt ? toLocalTimeString(extEvent.startAt) : "08:00",
      endTime: extEvent.endAt ? toLocalTimeString(extEvent.endAt) : "09:00",
      chairman: meta.meetingChairman ?? "",
      participants,
      format: meta.meetingFormat === "online" ? "online" : "offline",
      visibility: apiVisibilityToForm(selectedHrEvent?.visibility ?? extEvent.visibility),
      location: extEvent.meetingLocation || "",
      notes: extEvent.description || "",
      attachments: remoteAttachmentsToForm(selectedHrEvent?.attachments),
      createdById: extEvent.ownerId,
    };

    setEditingEvent(data);
  }, [selectedEvent, selectedHrEvent, mode, apiEventsMap]);

  // Invitee accepts/declines a meeting → persist via HR API, then refetch.
  const handleRespond = useCallback(
    async (response: "ACCEPTED" | "DECLINED") => {
      if (!selectedEvent) return;
      try {
        await hrCalendarApi.updateMyResponse(selectedEvent.id, response);
        toast.success(
          response === "ACCEPTED" ? "Bạn đã xác nhận tham gia" : "Bạn đã từ chối tham gia",
        );
        refetchCurrentMonth();
      } catch (error) {
        console.error("Failed to update participant response:", error);
        toast.error("Không thể cập nhật phản hồi");
      }
    },
    [selectedEvent, refetchCurrentMonth],
  );

  // Handle delete event
  const handleDeleteEvent = useCallback(async () => {
    if (!selectedEvent) return;

    try {
      const success = await deleteEvent(selectedEvent.id);
      if (success) {
        setSelectedEvent(null);
        setShowDeleteConfirm(false);
      }
    } catch (error) {
      console.error("Failed to delete event:", error);
      setShowDeleteConfirm(false);
    }
  }, [selectedEvent, deleteEvent]);

// Handle successful edit — close modal, refresh events
  const handleEditSuccess = useCallback(() => {
    setEditingEvent(null);
    setSelectedEvent(null);
    refetchCurrentMonth();
  }, [refetchCurrentMonth]);

  // Handle update event from edit form
  const handleUpdateEvent = useCallback(async (data: MeetingFormData) => {
    try {
      // Interpret the picked date+time as LOCAL wall-clock, then convert to an
      // absolute instant (UTC ISO). Appending "Z" directly would wrongly treat
      // local time as UTC (a 7h shift in Vietnam).
      const startAt = new Date(`${data.date}T${data.startTime}:00`).toISOString();
      const endAt = new Date(`${data.date}T${data.endTime}:00`).toISOString();
      const timezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Ho_Chi_Minh";

      // Gửi đủ participant refs + meeting fields để server reconcile danh sách
      // người tham gia (thêm người mới được tag, gỡ người bị bỏ tag).
      const { refs: participantIds, freeTextNames } = buildParticipantPayload(data);

      // Upload file mới + gộp fileId cũ (remote) = full desired set → BE reconcile
      // (giữ file cũ khi sửa, thêm file mới, gỡ file đã xóa khỏi form).
      const attachmentFileIds = await resolveAttachmentFileIds(data.attachments);

      // Gửi cả chuỗi rỗng (khác create): backend chỉ bỏ qua khi undefined,
      // nên "" mới xóa được ghi chú/địa điểm cũ.
      const input = {
        title: data.title,
        description: data.notes,
        startAt,
        endAt,
        location: data.location,
        timezone,
        visibility: meetingVisibilityToApi(data.visibility),
        participantIds,
        attendees: freeTextNames,
        meetingChairman: data.chairman || undefined,
        meetingFormat: data.format,
        attachmentFileIds,
      };

      const success = await useCalendarStore.getState().updateEvent(data.id, input);
      if (success) {
        await persistMockAttachmentMapping(data.id, attachmentFileIds);
        void handleEditSuccess();
      }
    } catch (error) {
      console.error("Failed to update event:", error);
      toast.error(
        error instanceof CalendarAttachmentUploadError
          ? `Không tải được đính kèm${error.filename ? ` "${error.filename}"` : ""}. Vui lòng thử lại.`
          : "Không thể cập nhật sự kiện",
      );
      throw error;
    }
  }, [handleEditSuccess]);

  // Handle update personal event from edit form (lịch cá nhân — không có người
  // tham gia/chủ trì/địa điểm). Giữ nguyên eventType OTHER ở backend.
  const handleUpdatePersonalEvent = useCallback(async (data: PersonalEventFormData) => {
    try {
      // Picked date+time là LOCAL wall-clock → convert sang UTC ISO.
      // endDate độc lập với date → hỗ trợ sự kiện qua đêm / nhiều ngày.
      const startAt = new Date(`${data.date}T${data.startTime}:00`).toISOString();
      const endAt = new Date(`${data.endDate}T${data.endTime}:00`).toISOString();
      const timezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Ho_Chi_Minh";

      const attachmentFileIds = await resolveAttachmentFileIds(data.attachments);

      // Gửi cả chuỗi rỗng để xóa được ghi chú cũ (backend bỏ qua undefined).
      const input = {
        title: data.title,
        description: data.notes,
        startAt,
        endAt,
        timezone,
        visibility: personalVisibilityToApi(data.visibility),
        attachmentFileIds,
      };

      const success = await useCalendarStore.getState().updateEvent(data.id, input);
      if (success) {
        await persistMockAttachmentMapping(data.id, attachmentFileIds);
        setEditingPersonalEvent(null);
        setSelectedEvent(null);
        refetchCurrentMonth();
      }
    } catch (error) {
      console.error("Failed to update personal event:", error);
      toast.error(
        error instanceof CalendarAttachmentUploadError
          ? `Không tải được đính kèm${error.filename ? ` "${error.filename}"` : ""}. Vui lòng thử lại.`
          : "Không thể cập nhật sự kiện",
      );
      throw error;
    }
  }, [refetchCurrentMonth]);

  // Check if attendance filter is active
  const isAttendanceFilterActive = localFilters.find(f => f.type === "attendance")?.checked ?? true;

  // View buttons
  const viewButtons: Array<{ id: CalendarView; label: string }> = [
    { id: "day", label: "Ngày" },
    { id: "week", label: "Tuần" },
    { id: "month", label: "Tháng" },
  ];

  return (
    <div className="calendar-page flex h-full min-h-0 flex-col bg-[var(--chat-shell-bg)]">
      {/* Main container */}
      <div className="flex flex-1 gap-4 overflow-hidden p-4 lg:p-6">
        {/* Left sidebar */}
        <aside className="w-60 shrink-0 overflow-y-auto rounded-xl border border-border bg-surface shadow-sm">
          <div className="p-4">
            {/* Search */}
            <div className="relative mb-4">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="Tìm kiếm sự kiện..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-[#1976D2]/60 focus:outline-none focus:ring-2 focus:ring-[#1976D2]/15"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  title="Xóa tìm kiếm"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Mini calendar */}
            <div className="mb-4 rounded-lg border border-border p-3">
              <MiniCalendar
                year={currentYear}
                month={currentMonth}
                onNavigate={handleMiniCalendarNavigate}
                onSelectDate={handleDateClick}
                selectedDate={selectedDate}
              />
            </div>

            {/* Calendar mode selector */}
            <div className="mb-4">
              <h3 className="mb-2 text-sm font-semibold text-text-primary">
                Chế độ xem
              </h3>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={handleBackToMyCalendar}
                  className={clsx(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm transition-micro",
                    mode === "my"
                      ? "bg-primary/10 text-primary"
                      : "text-text-secondary hover:bg-surface-hover"
                  )}
                >
                  <CalendarIcon className="h-4 w-4" />
                  Lịch của tôi
                </button>
                {mode === "other" && viewingUserName ? (
                  // Đang xem lịch người khác: bấm tên để đổi người, bấm X để quay
                  // về lịch của mình (không reload trang).
                  <div className="flex items-center gap-1 rounded-lg bg-blue-50 px-1 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                    <button
                      type="button"
                      onClick={() => setUserSearchModalOpen(true)}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-2 text-sm transition-micro hover:bg-blue-100/60 dark:hover:bg-blue-900/40"
                      title="Đổi người xem lịch"
                    >
                      <UserIcon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{viewingUserName}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleBackToMyCalendar}
                      title="Quay về lịch của tôi"
                      className="shrink-0 rounded-lg p-1.5 transition-micro hover:bg-blue-100 dark:hover:bg-blue-900/40"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setUserSearchModalOpen(true)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-text-secondary transition-micro hover:bg-surface-hover"
                  >
                    <UserIcon className="h-4 w-4" />
                    Xem lịch người khác
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => toast.info("Tính năng đang phát triển")}
                  className={clsx(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm transition-micro",
                    mode === "unit"
                      ? "bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400"
                      : "text-text-secondary hover:bg-surface-hover"
                  )}
                >
                  <BuildingOfficeIcon className="h-4 w-4" />
                  {mode === "unit" && viewingUnitName ? viewingUnitName : "Lịch đơn vị"}
                </button>
              </div>
            </div>

            {/* Calendar types */}
            <div className="mb-4">
              <h3 className="mb-2 text-sm font-semibold text-text-primary">
                Lịch của tôi
              </h3>
              <div className="space-y-2">
                {localFilters.map((filter) => (
                  <label
                    key={filter.type}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-hover transition-micro"
                  >
                    <input
                      type="checkbox"
                      checked={filter.checked}
                      onChange={() => handleFilterChange(filter.type)}
                      className="h-4 w-4 rounded border-border accent-[#1565C0] focus:ring-2 focus:ring-[#1976D2]/30"
                    />
                    <span
                      className={clsx("h-2.5 w-2.5 rounded-full", filter.color)}
                    />
                    <span className="text-sm text-text-primary">
                      {filter.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            {mode !== "other" && (
              <button
                type="button"
                onClick={() => openEventTypeChooser(formatDateString(selectedDate))}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary hover:border-[#1976D2]/60 hover:bg-[#1565C0]/5 hover:text-[#1565C0] transition-micro"
              >
                <PlusIcon className="h-4 w-4" />
                Thêm lịch
              </button>
            )}
          </div>
        </aside>

        {/* Main calendar area */}
        <div className="relative flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          {/* Loading overlay */}
          {storeLoading && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-surface/60">
              <div className="flex flex-col items-center gap-2 rounded-xl bg-surface p-4 shadow-lg">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-sm text-text-secondary">
                  Đang tải lịch...
                </span>
              </div>
            </div>
          )}
          {/* Header */}
          <header
            className={clsx(
              "shrink-0 border-b border-border px-4",
              mode === "other" ? "py-2" : "py-3",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Month/Year title and navigation */}
              <div className="flex items-center gap-3">
                {/* Viewing others indicator */}
                {mode === "other" && viewingUserName && (
                  <div className="flex items-center gap-1.5 rounded-md bg-blue-50 px-2 py-1 dark:bg-blue-900/30">
                    <EyeIcon className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                      Lịch của <span className="font-semibold">{viewingUserName}</span>
                    </span>
                    <span className="rounded bg-orange-100 px-1 py-0.5 text-[10px] font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                      Chỉ xem
                    </span>
                  </div>
                )}
                {(mode === "my" || mode === "other") && (
                  <h2
                    className={clsx(
                      "font-semibold text-text-primary",
                      mode === "other" ? "text-sm" : "text-lg",
                    )}
                  >
                    {currentView === "day"
                      ? dayTitle
                      : currentView === "week"
                        ? weekTitle
                        : `${VIETNAMESE_MONTHS[currentMonth]} ${currentYear}`}
                  </h2>
                )}
                {/* Điều hướng ‹ › cho cả lịch mình và lịch người khác (chỉ đổi
                    khoảng xem; effect tự refetch lịch người đó theo tháng). */}
                {(mode === "my" || mode === "other") && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={
                        currentView === "day"
                          ? () => shiftSelected(-1)
                          : currentView === "week"
                            ? () => shiftSelected(-7)
                            : goToPrevMonth
                      }
                      title={currentView === "day" ? "Ngày trước" : currentView === "week" ? "Tuần trước" : "Tháng trước"}
                      className="rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-micro"
                    >
                      <ChevronLeftIcon className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={
                        currentView === "day"
                          ? () => shiftSelected(1)
                          : currentView === "week"
                            ? () => shiftSelected(7)
                            : goToNextMonth
                      }
                      title={currentView === "day" ? "Ngày sau" : currentView === "week" ? "Tuần sau" : "Tháng sau"}
                      className="rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-micro"
                    >
                      <ChevronRightIcon className="h-5 w-5" />
                    </button>
                  </div>
                )}
                {(mode === "my" || mode === "other") && (
                  <button
                    type="button"
                    onClick={goToToday}
                    className="rounded-xl bg-[#1565C0] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#1976D2] active:scale-95 shadow-sm shadow-[#1565C0]/25 transition-micro"
                  >
                    Hôm nay
                  </button>
                )}
              </div>

              {/* Notifications + View switcher */}
              <div className="flex items-center gap-2">
              <HrNotificationBell />
              <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
                {viewButtons.map((view) => (
                  <button
                    key={view.id}
                    type="button"
                    onClick={() => setView(view.id)}
                    className={clsx(
                      "rounded-md px-3 py-1.5 text-sm font-medium transition-micro",
                      currentView === view.id
                        ? "bg-[#1565C0] text-white shadow-sm"
                        : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                    )}
                  >
                    {view.label}
                  </button>
                ))}
              </div>
              </div>
            </div>
          </header>

          {/* Calendar grid */}
          {currentView === "month" && (
            <MonthGrid
              calendarDays={calendarDays}
              events={searchedEvents}
              getAttendanceForDate={getAttendanceForDate}
              isToday={isToday}
              isSelected={isSelected}
              isAttendanceFilterActive={isAttendanceFilterActive}
              showAttendance={mode !== "other"}
              onOpenDay={handleOpenDay}
              onEventClick={handleEventClick}
            />
          )}

          {/* Day view */}
          {currentView === "day" && (
            <DayView
              date={selectedDate}
              events={searchedEvents}
              attendance={mode !== "other" ? getAttendanceForDate(selectedDate) : undefined}
              onEventClick={handleEventClick}
              onSlotClick={mode !== "other" ? handleCreateAtSlot : undefined}
            />
          )}

          {/* Week view */}
          {currentView === "week" && (
            <WeekView
              weekDate={selectedDate}
              events={searchedEvents}
              attendanceData={mode !== "other" ? attendanceData : []}
              onDateClick={handleOpenDay}
              onEventClick={handleEventClick}
              onSlotClick={mode !== "other" ? handleCreateAtSlot : undefined}
              isToday={isToday}
              isSelected={isSelected}
            />
          )}
        </div>
      </div>

      {/* Event detail modal */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onEdit={handleEditEvent}
          onDelete={handleDeleteEvent}
          isViewingOthers={mode === "other"}
          hrEvent={selectedHrEvent}
          onRespond={handleRespond}
        />
      )}

      {/* Bộ chọn loại lịch: họp vs cá nhân */}
      <Modal
        isOpen={eventTypeChooserOpen}
        onClose={() => setEventTypeChooserOpen(false)}
        title="Thêm lịch"
        size="sm"
      >
        <p className="mb-4 text-sm text-text-secondary">
          Chọn loại lịch bạn muốn thêm.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              setEventTypeChooserOpen(false);
              setMeetingModalOpen(true);
            }}
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-4 text-center transition-micro hover:border-[#1976D2]/60 hover:bg-[#1565C0]/5"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1976D2]/10 text-[#1565C0]">
              <UsersIcon className="h-6 w-6" />
            </span>
            <span className="text-sm font-medium text-text-primary">Lịch họp</span>
            <span className="text-[11px] text-text-muted">Mời người tham gia, chủ trì, địa điểm</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEventTypeChooserOpen(false);
              setPersonalModalOpen(true);
            }}
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-4 text-center transition-micro hover:border-amber-500/60 hover:bg-amber-500/5"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <UserIcon className="h-6 w-6" />
            </span>
            <span className="text-sm font-medium text-text-primary">Lịch cá nhân</span>
            <span className="text-[11px] text-text-muted">Chỉ mình bạn — ngày, giờ, nội dung</span>
          </button>
        </div>
      </Modal>

      {/* Meeting form modal */}
      <MeetingFormModal
        isOpen={meetingModalOpen}
        onClose={() => setMeetingModalOpen(false)}
        onBack={() => {
          setMeetingModalOpen(false);
          setEventTypeChooserOpen(true);
        }}
        onSave={handleCreateEvent}
        defaultDate={meetingModalDate}
        defaultStartTime={meetingModalStart}
        defaultEndTime={meetingModalEnd}
        existingMeetings={meetingsForConflictCheck}
        isLoading={isCreatingEvent}
      />

      {/* Personal event form modal */}
      <PersonalEventFormModal
        isOpen={personalModalOpen}
        onClose={() => setPersonalModalOpen(false)}
        onBack={() => {
          setPersonalModalOpen(false);
          setEventTypeChooserOpen(true);
        }}
        onSave={handleCreatePersonalEvent}
        defaultDate={personalModalDate}
        defaultStartTime={personalModalStart}
        defaultEndTime={personalModalEnd}
        isLoading={isCreatingEvent}
      />

      {/* Edit event modal — loại chính event đang sửa khỏi danh sách check trùng */}
      <MeetingFormModal
        isOpen={!!editingEvent}
        onClose={() => setEditingEvent(null)}
        onSave={handleUpdateEvent}
        initialData={editingEvent}
        existingMeetings={meetingsForConflictCheck.filter((m) => m.id !== editingEvent?.id)}
      />

      {/* Edit personal event modal — lịch cá nhân sửa bằng form cá nhân */}
      <PersonalEventFormModal
        isOpen={!!editingPersonalEvent}
        onClose={() => setEditingPersonalEvent(null)}
        onSave={handleUpdatePersonalEvent}
        initialData={editingPersonalEvent}
      />

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteEvent}
        title="Xóa sự kiện"
        message="Bạn có chắc muốn xóa sự kiện này? Hành động này không thể hoàn tác."
        confirmText="Xóa"
        cancelText="Hủy"
        variant="danger"
      />

      {/* User search modal */}
      <UserSearchModal
        isOpen={userSearchModalOpen}
        onClose={() => setUserSearchModalOpen(false)}
        onSelectUser={handleSelectUser}
      />

    </div>
  );
};

/**
 * Map local EventType to API CalendarEventType.
 */
const mapLocalTypeToApi = (localType: string): string => {
  switch (localType) {
    case "personal":
      return "PERSONAL";
    case "meeting":
      return "MEETING";
    case "attendance":
      return "ATTENDANCE";
    case "task":
      return "TASK";
    case "work":
    case "unit":
    case "leader":
      return "WORK";
    default:
      return "PERSONAL";
  }
};

export default CalendarPage;
