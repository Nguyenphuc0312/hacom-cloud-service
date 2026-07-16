/**
 * @fileoverview EventDetailModal — popup chi tiết sự kiện lịch (dùng chung cho
 * /calendar và WeeklyCalendarWidget ở màn chat trống). Hiển thị đầy đủ: loại,
 * thời gian, chủ trì, người tham gia (roster + phản hồi), quyền xem, đính kèm,
 * ghi chú; kèm hành động Xóa/Chỉnh sửa và phản hồi mời họp (Tham gia/Từ chối).
 */

import React from "react";
import clsx from "clsx";
import {
  XMarkIcon,
  UserIcon,
  UsersIcon,
  BuildingOfficeIcon,
  CalendarIcon,
  ClockIcon,
  MapPinIcon,
  VideoCameraIcon,
  PencilSquareIcon,
  TrashIcon,
  EyeIcon,
  DocumentTextIcon,
  PaperClipIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import {
  getEventColor,
  getEventTypeLabel,
  type CalendarEvent as LocalCalendarEvent,
  type ExtendedCalendarEvent,
} from "../data/calendarEvents";
import {
  type HRCalendarEvent,
  type HRCalendarParticipant,
} from "../../api/hrCalendarApi";
import {
  getMeetingMetadata,
  toLocalDateString,
  toLocalTimeString,
} from "../utils/calendarEventMapping";
import { ConfirmDialog } from "../../../components/ui/Modal";
import { resolvePublicResourceUrl } from "../../../config";
import { CalendarAttachmentList } from "../../../components/ui/CalendarAttachmentZone";
import { Avatar } from "../../../components/common/Avatar";
import { loadUserProfiles, type UserProfileSummary } from "../../../services/userBatchLoader";
import { useEnrichedProfileStore } from "../../../stores/enrichedProfileStore";

// Lazy: react-markdown (~100kB) tách chunk riêng, chỉ tải khi mở chi tiết lịch
// có ghi chú. Render ghi chú dạng markdown (bảng, danh sách…) cho đẹp.
const MarkdownContent = React.lazy(
  () => import("../../../components/message/MarkdownContent"),
);

/** Format an ISO/date string to a long Vietnamese date. */
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

/** Human duration between two ISO timestamps (vi). */
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

/** Status badge palette + label. */
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

export const EventDetailModal: React.FC<{
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

  // Người tạo (owner) — có thể khác chủ trì. Avatar tra theo roster (đã ghép owner
  // lên đầu hrParticipants) + profile batch-load.
  const creatorName = hrEvent?.owner?.fullName ?? hrEvent?.ownerName ?? null;
  const avatarForRow = (p: HRCalendarParticipant | undefined): string | undefined =>
    resolvePublicResourceUrl(
      (p?.authUserId ? participantProfiles[p.authUserId]?.avatarUrl : undefined) ??
        p?.avatarUrl ??
        undefined,
    );
  const findByName = (name: string | null | undefined) => {
    const key = name?.trim().toLowerCase();
    if (!key) return undefined;
    return hrParticipants.find(
      (p) =>
        (p.fullName ?? p.employee?.fullName ?? "").trim().toLowerCase() === key,
    );
  };
  const creatorRow =
    (hrEvent?.ownerAuthUserId
      ? hrParticipants.find((p) => p.authUserId === hrEvent.ownerAuthUserId)
      : undefined) ?? findByName(creatorName);
  const chairmanRow = findByName(chairman);

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

            {/* Người tạo — trên Chủ trì, vì hai người có thể khác nhau */}
            {creatorName && (
              <div className="flex items-start gap-3">
                <UserIcon className="mt-0.5 h-5 w-5 shrink-0 text-text-muted" />
                <div>
                  <p className="text-xs font-medium text-text-muted">Người tạo</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <Avatar src={avatarForRow(creatorRow)} alt={creatorName} size="sm" />
                    <p className="text-sm text-text-primary">{creatorName}</p>
                  </div>
                </div>
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
                  <div className="mt-0.5 flex items-center gap-2">
                    <Avatar src={avatarForRow(chairmanRow)} alt={chairman} size="sm" />
                    <p className="text-sm text-text-primary">{chairman}</p>
                  </div>
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
                  <CalendarAttachmentList eventId={hrEvent.id} attachments={hrEvent.attachments} />
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
