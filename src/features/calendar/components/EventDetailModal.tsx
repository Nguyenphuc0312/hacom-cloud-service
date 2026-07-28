/**
 * @fileoverview EventDetailModal — popup chi tiết sự kiện lịch (dùng chung cho
 * /calendar và WeeklyCalendarWidget ở màn chat trống). Hiển thị đầy đủ: loại,
 * thời gian, chủ trì, người tham gia (roster + phản hồi), quyền xem, đính kèm,
 * ghi chú; kèm hành động Xóa/Chỉnh sửa và phản hồi mời họp (Tham gia/Từ chối).
 */

import React from "react";
import clsx from "clsx";
import { useNavigate } from "react-router-dom";
import {
  XMarkIcon,
  UserIcon,
  UserPlusIcon,
  UsersIcon,
  BuildingOfficeIcon,
  CalendarIcon,
  ChatBubbleLeftRightIcon,
  ClockIcon,
  MapPinIcon,
  VideoCameraIcon,
  PencilSquareIcon,
  TrashIcon,
  EyeIcon,
  DocumentTextIcon,
  PaperClipIcon,
  ChevronRightIcon,
  LinkIcon,
} from "@heroicons/react/24/outline";
import {
  getEventColor,
  getEventTypeLabel,
  type CalendarEvent as LocalCalendarEvent,
  type ExtendedCalendarEvent,
} from "../data/calendarEvents";
import {
  hrCalendarApi,
  type HRCalendarEvent,
  type HRCalendarParticipant,
  type HRCalendarVisibility,
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
import { useFriendship } from "../../../hooks/useFriendship";
import {
  extractSearchRows,
  normalizeSearchUser,
} from "../../chat/hooks/useChatUserSearch";
import { searchUsersUseCase } from "../../chat/usecases/searchUsers";
import { pickUniqueUserIdByName } from "../utils/pickUniqueUserIdByName";
import { useAuthStore } from "../../../stores/authStore";
import { conversationApi } from "../../../services/api";
import { unwrapApiSuccess, extractApiError } from "../../../lib/apiContract";
import { ROUTE_PATHS } from "../../../router/paths";
import { toast } from "../../../utils/toast";

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

/** Địa điểm dạng URL (Meet/Zoom/Teams…) → render clickable link thay vì text thô. */
const isMeetingUrl = (value: string): boolean => /^https?:\/\/\S+$/i.test(value.trim());

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

/** Khớp @MaxLength(500) của UpdateParticipantDto (hr-api) — cắt ở FE để không
 *  gõ xong mới ăn 422. */
const DECLINE_REASON_MAX = 500;

/** URL link chia sẻ do máy này tạo, cache theo eventId. BE chỉ trả token thô
 *  đúng lần tạo đầu (sau đó chỉ còn hash), nên không cache thì mở modal lần sau
 *  chỉ còn nước thu hồi + tạo lại. localStorage có thể ném (private mode/quota). */
/**
 * Kết quả dò tên chủ trì → userId, nhớ theo tên đã chuẩn hoá cho cả phiên.
 *
 * Dò tên là đường CHÓT cho lịch cũ, và phần lớn lần dò là *hụt* (tên tự do,
 * người đã nghỉ, trùng tên). Không nhớ lại thì mỗi lần mở modal — kể cả mở lại
 * đúng cái lịch vừa xem — lại bắn thêm một request tìm kiếm cho một câu trả lời
 * đã biết. `null` = đã dò và không ra, vẫn phải nhớ, nếu không sẽ retry mãi.
 * ponytail: Map cả phiên, không TTL — danh bạ đổi giữa phiên là hiếm và hậu quả
 * chỉ là thiếu 1 avatar; cần tươi hơn thì clear khi logout.
 */
const chairmanLookupMemo = new Map<string, string | null>();

const readShareLinkCache = (key: string | null): string | null => {
  if (!key) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeShareLinkCache = (key: string | null, url: string | null): void => {
  if (!key) return;
  try {
    if (url) localStorage.setItem(key, url);
    else localStorage.removeItem(key);
  } catch {
    /* mất cache thôi, không chặn luồng chia sẻ */
  }
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
  /** Called when the current user (an invitee) accepts/declines. `reason` chỉ
   *  gửi kèm khi DECLINED — BE lưu vào participant.responseNote và trả lại trong
   *  roster, nên người tạo lịch đọc được. */
  onRespond?: (response: "ACCEPTED" | "DECLINED", reason?: string) => Promise<void> | void;
}> = ({ event, onClose, onEdit, onDelete, isViewingOthers = false, hrEvent, onRespond }) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [showEditConfirm, setShowEditConfirm] = React.useState(false);
  const [responding, setResponding] = React.useState<null | "ACCEPTED" | "DECLINED">(null);
  // Ô nhập lý do — chỉ mở khi bấm "Không tham gia", không bắt buộc điền.
  const [declineReasonOpen, setDeclineReasonOpen] = React.useState(false);
  const [declineReason, setDeclineReason] = React.useState("");
  // Khối đính kèm collapse — mặc định đóng cho gọn modal.
  const [attachmentsOpen, setAttachmentsOpen] = React.useState(false);
  // Link chia sẻ lịch họp — panel chỉ mở khi bấm "Chia sẻ". BE chỉ trả token thô
  // đúng lần TẠO MỚI (sau đó chỉ còn hash — xem calendar.service.createShareLink),
  // nên FE cache URL vào localStorage theo eventId để mở lại modal vẫn sao chép
  // được ngay thay vì rơi vào panel "chỉ thu hồi được".
  // ponytail: localStorage = per-máy; đổi máy thì thu hồi + tạo lại, chấp nhận được.
  const shareLinkCacheKey = hrEvent ? `calendar.shareLink.${hrEvent.id}` : null;
  const [shareLinkOpen, setShareLinkOpen] = React.useState(false);
  const [shareLinkLoading, setShareLinkLoading] = React.useState(false);
  // Khởi tạo thẳng từ cache — modal luôn mount lại theo từng event nên không cần
  // effect đồng bộ lại (effect + setState = cascading render, eslint chặn đúng).
  const [shareLinkUrl, setShareLinkUrl] = React.useState<string | null>(() =>
    readShareLinkCache(shareLinkCacheKey),
  );
  const [shareLinkExists, setShareLinkExists] = React.useState(
    () => !!readShareLinkCache(shareLinkCacheKey),
  );
  const [shareLinkRevoking, setShareLinkRevoking] = React.useState(false);
  const colors = getEventColor(event.type);
  const isExtended = "startAt" in event && event.startAt;

  // Người tham gia = ĐÚNG những gì API trả về, không thêm bớt.
  //
  // Trước đây FE tự chèn người tạo vào roster với response "ACCEPTED" → đếm sai
  // ("Người tham gia (4)" / "1 tham gia" trong khi người tạo chưa hề phản hồi).
  // Người tạo KHÔNG mặc nhiên là người tham gia: muốn dự thì tự thêm mình vào ô
  // "Người tham gia" lúc tạo/sửa. Người tạo vẫn thấy lịch mình tạo nhờ query BE
  // khớp theo owner (calendar.service.ts → buildOwnerWhereClause), không phải nhờ
  // hàng participant bịa ra ở FE.
  // useMemo để tham chiếu ổn định — effect tra avatar phụ thuộc mảng này.
  const hrParticipants = React.useMemo(
    () => hrEvent?.participants ?? [],
    [hrEvent],
  );
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
  // Người tạo & chủ trì có thể KHÔNG nằm trong roster (người tạo không bắt buộc
  // tham gia) → phải nạp thêm authUserId của họ, nếu không hai hàng này mất avatar.
  const ownerAuthUserId = hrEvent?.ownerAuthUserId ?? null;
  const chairmanAuthUserId =
    getMeetingMetadata(hrEvent).meetingChairmanAuthUserId ?? null;
  // Id chủ trì dò được từ danh bạ theo tên — chỉ dùng cho lịch CŨ không có
  // identity (xem effect dò tên bên dưới). Khai báo sớm để batch-load nạp luôn
  // avatar của người này trong cùng một lượt. Khởi tạo từ memo phiên trước: mở
  // lại lịch cũ là có id ngay từ render đầu, batch-load nạp avatar cùng lượt với
  // roster thay vì phải chờ thêm một vòng effect.
  const chairmanNameKey =
    getMeetingMetadata(hrEvent).meetingChairman?.trim().toLowerCase() || null;
  const [chairmanLookupUserId, setChairmanLookupUserId] = React.useState<string | null>(
    () => (chairmanNameKey ? (chairmanLookupMemo.get(chairmanNameKey) ?? null) : null),
  );
  React.useEffect(() => {
    const ids = [
      ...new Set(
        [
          ...hrParticipants.map((p) => p.authUserId),
          ownerAuthUserId,
          chairmanAuthUserId,
          chairmanLookupUserId,
        ].filter((id): id is string => !!id),
      ),
    ];
    if (ids.length === 0) return;
    // Sau khi Cập nhật, roster đổi → effect chạy lại. GỘP kết quả thay vì thay cả
    // map: replace làm mất avatar đã tra được của những người vẫn còn trong lịch
    // (avatar "nháy" mất rồi mới hiện lại). `cancelled` chặn response về trễ của
    // lần fetch cũ ghi đè lần mới.
    let cancelled = false;
    void loadUserProfiles(ids).then((profiles) => {
      if (cancelled) return;
      setParticipantProfiles((prev) => ({ ...prev, ...profiles }));
    });
    return () => {
      cancelled = true;
    };
  }, [hrParticipants, ownerAuthUserId, chairmanAuthUserId, chairmanLookupUserId]);
  // Tên gợi nhớ (alias) đã được friendshipStore inject vào enrichedProfileStore
  // theo userId (= authUserId). Ưu tiên alias hơn tên thật khi hiển thị.
  const aliasByUserId = useEnrichedProfileStore((s) => s.nameByUserId);
  const handleRespondClick = async (response: "ACCEPTED" | "DECLINED", reason?: string) => {
    if (!onRespond) return;
    // Bấm lại đúng trạng thái đang có = no-op: không gọi BE, không toast lặp.
    // DECLINED vẫn cho gửi lại vì có thể user chỉ đang sửa lý do.
    if (response === "ACCEPTED" && myResponse === "ACCEPTED") return;
    setResponding(response);
    try {
      await onRespond(response, reason);
      if (response === "DECLINED") setDeclineReasonOpen(false);
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

  // Chỉ lịch họp (MEETING) với quyền xem Nhóm/Đơn vị/Công khai mới chia sẻ được
  // — Riêng tư/Bận cố tình ẩn nội dung với người ngoài, join qua link sẽ cấp
  // canViewFullDetails nên sẽ phá mục đích đó nếu cho phép (BE cũng chặn, đây
  // chỉ là ẩn nút cho gọn UI — xem calendar.service.ts assertEventShareable).
  const SHAREABLE_VISIBILITY: HRCalendarVisibility[] = ["TEAM", "UNIT", "PUBLIC"];
  const canShareLink =
    canEdit &&
    !!hrEvent &&
    hrEvent.eventType === "MEETING" &&
    SHAREABLE_VISIBILITY.includes(hrEvent.visibility);

  const handleOpenShareLink = async () => {
    if (!hrEvent) return;
    setShareLinkOpen(true);
    // Đã có link cache sẵn → mở panel là sao chép được ngay, không gọi lại BE.
    if (shareLinkUrl) return;
    setShareLinkLoading(true);
    try {
      const link = await hrCalendarApi.createShareLink(hrEvent.id);
      setShareLinkExists(true);
      const url = link.token
        ? `${window.location.origin}${ROUTE_PATHS.CALENDAR_JOIN_BY_SHARE_LINK.replace(":token", encodeURIComponent(link.token))}`
        : null;
      setShareLinkUrl(url);
      writeShareLinkCache(shareLinkCacheKey, url);
    } catch (error) {
      toast.error(extractApiError(error).message);
      setShareLinkOpen(false);
    } finally {
      setShareLinkLoading(false);
    }
  };

  const handleCopyShareLink = async () => {
    if (!shareLinkUrl) return;
    try {
      await navigator.clipboard.writeText(shareLinkUrl);
      toast.success("Đã sao chép link chia sẻ");
    } catch {
      toast.error("Không sao chép được, hãy tự chọn và sao chép link");
    }
  };

  const handleRevokeShareLink = async () => {
    if (!hrEvent) return;
    setShareLinkRevoking(true);
    try {
      await hrCalendarApi.revokeShareLink(hrEvent.id);
      toast.success("Đã thu hồi link chia sẻ");
      setShareLinkExists(false);
      setShareLinkUrl(null);
      setShareLinkOpen(false);
      writeShareLinkCache(shareLinkCacheKey, null);
    } catch (error) {
      toast.error(extractApiError(error).message);
    } finally {
      setShareLinkRevoking(false);
    }
  };

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
  const avatarForRow = (
    p: HRCalendarParticipant | undefined,
    /** userId dự phòng khi người này không nằm trong roster (người tạo/chủ trì
     *  không bắt buộc là người tham gia). */
    fallbackUserId?: string | null,
  ): string | undefined => {
    const userId = p?.authUserId ?? fallbackUserId ?? undefined;
    return resolvePublicResourceUrl(
      (userId ? participantProfiles[userId]?.avatarUrl : undefined) ??
        p?.avatarUrl ??
        undefined,
    );
  };
  // Dò người theo TÊN — chỉ dùng làm phương án chót cho event CŨ (tạo trước khi BE
  // lưu identity chủ trì). Dò theo mọi tên một người có thể mang: fullName, tên
  // trong employee, mã NV, và alias ("tên gợi nhớ").
  const findByName = (name: string | null | undefined) => {
    const key = name?.trim().toLowerCase();
    if (!key) return undefined;
    return hrParticipants.find((p) => {
      const alias = p.authUserId ? aliasByUserId[p.authUserId] : undefined;
      return [p.fullName, p.employee?.fullName, p.employeeCode, alias].some(
        (candidate) => (candidate ?? "").trim().toLowerCase() === key,
      );
    });
  };
  const findByAuthUserId = (id: string | null | undefined) =>
    id ? hrParticipants.find((p) => p.authUserId === id) : undefined;

  // Người tạo & chủ trì KHÔNG nhất thiết nằm trong roster (người tạo không bắt
  // buộc tham gia). Nên lấy authUserId từ identity của event trước, roster chỉ để
  // nhặt sẵn avatar nếu tình cờ người đó cũng là người tham gia.
  const creatorRow = findByAuthUserId(hrEvent?.ownerAuthUserId) ?? findByName(creatorName);
  const creatorUserId = hrEvent?.ownerAuthUserId ?? creatorRow?.authUserId ?? null;
  const chairmanIdentityUserId = meetingMeta.meetingChairmanAuthUserId ?? null;
  const chairmanRow =
    findByAuthUserId(chairmanIdentityUserId) ?? findByName(chairman);
  // Chủ trì không nằm trong roster và event cũ không lưu identity → mất avatar.
  // Trùng tên người tạo thì dùng luôn identity của người tạo (đã nạp avatar).
  const chairmanIsCreator =
    !!chairman &&
    !!creatorName &&
    chairman.trim().toLowerCase() === creatorName.trim().toLowerCase();
  const chairmanUserId =
    chairmanIdentityUserId ??
    chairmanRow?.authUserId ??
    (chairmanIsCreator ? creatorUserId : null);

  // Chặng chót cho lịch CŨ (tạo trước khi BE lưu meetingChairmanRef): chủ trì
  // không có identity, không nằm trong roster, cũng không phải người tạo → dò
  // tên trong danh bạ để lấy avatar. Chỉ chấp nhận khi khớp ĐÚNG 1 người: trùng
  // tên mà đoán bừa thì hiện nhầm mặt người khác, tệ hơn là để chữ cái đầu.
  // Tên đã chuẩn hoá làm khoá memo — null khi không cần dò (đã có identity từ
  // metadata/roster/người tạo), để effect không chạy gì ở đường thường.
  const chairmanLookupName =
    chairman && !chairmanUserId && chairman.trim().length >= 2
      ? chairman.trim().toLowerCase()
      : null;
  React.useEffect(() => {
    if (!chairmanLookupName) return;
    // Đã dò tên này rồi (kể cả dò hụt) → không bắn request nữa. Giá trị đọc
    // thẳng lúc render (memoHit bên dưới), không setState trong effect.
    if (chairmanLookupMemo.has(chairmanLookupName)) return;
    let cancelled = false;
    void searchUsersUseCase(chairmanLookupName, 1, 5)
      .then((response) => {
        const users = extractSearchRows(response)
          .map(normalizeSearchUser)
          .filter((u): u is NonNullable<typeof u> => !!u);
        const id = pickUniqueUserIdByName(users, chairmanLookupName);
        // Ghi memo cả khi hụt, kể cả lần này đã bị huỷ — kết quả vẫn đúng cho
        // lần sau, chỉ có setState là phải bỏ.
        chairmanLookupMemo.set(chairmanLookupName, id);
        if (!cancelled && id) setChairmanLookupUserId(id);
      })
      .catch(() => {
        /* dò avatar là tiện ích, hỏng thì rơi về chữ cái đầu */
      });
    return () => {
      cancelled = true;
    };
  }, [chairmanLookupName]);

  // Avatar của người dò được nằm ở participantProfiles (effect batch-load ở trên
  // đã nạp theo id này).
  const chairmanResolvedUserId = chairmanUserId ?? chairmanLookupUserId;

  // Hành động nhanh trên dòng Người tạo / Chủ trì: đã là bạn → Nhắn tin (mở DM);
  // chưa là bạn → Kết bạn (có lời mời đến từ họ thì "Kết bạn" = chấp nhận luôn).
  const navigate = useNavigate();
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const { getRelationshipState, sendFriendRequest, acceptFriendRequest } = useFriendship();
  const [personActionLoading, setPersonActionLoading] = React.useState<string | null>(null);

  // Phản hồi hiện tại của CHÍNH mình trong roster — dùng để tô đậm đúng nút
  // (Tham gia/Không tham gia) đang được chọn, và biết đây là đổi ý hay lần đầu.
  const myParticipantRow = currentUserId
    ? hrParticipants.find((p) => p.authUserId === currentUserId)
    : undefined;
  const myResponse = myParticipantRow?.response;
  // Lý do từ chối lấy thẳng từ roster server — mọi người cùng thấy một nội dung.
  const myDeclineReason =
    myResponse === "DECLINED" ? (myParticipantRow?.responseNote ?? null) : null;

  const handleMessagePerson = async (userId: string) => {
    setPersonActionLoading(`msg:${userId}`);
    try {
      const response = await conversationApi.createPrivateConversation(userId);
      const room = unwrapApiSuccess(response) as { id?: string };
      if (room.id) {
        onClose();
        navigate(`${ROUTE_PATHS.CHAT}/${room.id}`);
      }
    } catch (error) {
      toast.error(extractApiError(error).message);
    } finally {
      setPersonActionLoading(null);
    }
  };

  const handleAddFriendPerson = async (userId: string) => {
    setPersonActionLoading(`add:${userId}`);
    try {
      const rel = getRelationshipState(userId, currentUserId);
      const ok =
        rel.kind === "incoming_request"
          ? await acceptFriendRequest(rel.requestId)
          : await sendFriendRequest(userId);
      if (ok) {
        toast.success(
          rel.kind === "incoming_request"
            ? "Hai bạn đã trở thành bạn bè"
            : "Đã gửi lời mời kết bạn",
        );
      } else {
        toast.error("Không thể gửi lời mời kết bạn. Vui lòng thử lại.");
      }
    } finally {
      setPersonActionLoading(null);
    }
  };

  const renderPersonAction = (userId: string | null) => {
    if (!userId || userId === currentUserId) return null;
    const rel = getRelationshipState(userId, currentUserId);
    if (rel.kind === "self") return null;
    const btnBase =
      "ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-micro";
    if (rel.kind === "friend") {
      const loading = personActionLoading === `msg:${userId}`;
      return (
        <button
          type="button"
          disabled={loading}
          onClick={() => void handleMessagePerson(userId)}
          className={clsx(
            btnBase,
            "border-[#1976D2]/60 bg-[#1976D2]/10 text-[#1565C0] hover:bg-[#1976D2]/20 disabled:opacity-60",
          )}
        >
          <ChatBubbleLeftRightIcon className="h-3.5 w-3.5" />
          {loading ? "Đang mở..." : "Nhắn tin"}
        </button>
      );
    }
    if (rel.kind === "outgoing_request") {
      return (
        <span className={clsx(btnBase, "cursor-default border-border bg-surface-overlay text-text-muted")}>
          Đã gửi lời mời
        </span>
      );
    }
    const loading = personActionLoading === `add:${userId}`;
    return (
      <button
        type="button"
        disabled={loading}
        onClick={() => void handleAddFriendPerson(userId)}
        className={clsx(
          btnBase,
          "border-[#1976D2]/60 bg-[#1976D2]/10 text-[#1565C0] hover:bg-[#1976D2]/20 disabled:opacity-60",
        )}
      >
        <UserPlusIcon className="h-3.5 w-3.5" />
        {loading ? "Đang gửi..." : "Kết bạn"}
      </button>
    );
  };

  // Tham gia/Không tham gia là TOGGLE, không phải hành động 1 chiều: từ chối
  // KHÔNG xóa lịch và cũng không thu hồi quyền xem (xem getEventPermissions bên
  // hr-api), chỉ đổi trạng thái phản hồi. Nút của trạng thái hiện tại được tô
  // đậm để rõ đây là toggle, bấm lại đổi ý bất cứ lúc nào.
  // Cả hai nút ở footer cùng hàng, "Tham gia" bên phải (vị trí hành động chính),
  // "Không tham gia" bên trái cạnh ô nhập lý do vì hai thứ đó đi liền nhau.
  const acceptButton = (
    <button
      type="button"
      disabled={responding !== null}
      onClick={() => {
        setDeclineReasonOpen(false);
        void handleRespondClick("ACCEPTED");
      }}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-micro disabled:opacity-60",
        myResponse === "ACCEPTED"
          ? "bg-emerald-600 text-white ring-2 ring-emerald-300 hover:bg-emerald-700 dark:ring-emerald-800"
          : "border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300",
      )}
    >
      {responding === "ACCEPTED" ? "Đang lưu..." : "Tham gia"}
    </button>
  );

  const declineButton = (
    <button
      type="button"
      disabled={responding !== null}
      onClick={() => {
        // Mở ra thì nạp sẵn lý do đã gửi để sửa, không bắt gõ lại.
        if (!declineReasonOpen) setDeclineReason(myDeclineReason ?? "");
        setDeclineReasonOpen((v) => !v);
      }}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-micro disabled:opacity-60",
        myResponse === "DECLINED"
          ? "bg-rose-600 text-white ring-2 ring-rose-300 hover:bg-rose-700 dark:ring-rose-800"
          : "border border-rose-300 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:border-rose-700 dark:bg-rose-900/20 dark:text-rose-300",
      )}
    >
      {responding === "DECLINED"
        ? "Đang lưu..."
        : declineReasonOpen
          ? "Đóng ô lý do"
          : myResponse === "DECLINED"
            ? "Sửa lý do"
            : "Không tham gia"}
    </button>
  );

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* flex-col + body cuộn + footer ghim — cùng pattern với ui/Modal, để các
          nút hành động luôn thấy được, không bị trôi theo nội dung dài. */}
      <div className="relative z-10 flex max-h-[min(90vh,48rem)] w-full max-w-lg animate-scale-in flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
        <button
          type="button"
          onClick={onClose}
          title="Đóng"
          className="absolute right-4 top-4 z-10 rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-micro"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>

        <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto p-6">
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

            {/* Location / Meeting Link — location là URL (Meet/Zoom/Teams…) → hiện
                như link bấm được kèm nút "Tham gia họp", thay vì text thô. */}
            {location && (
              <div className="flex items-start gap-3">
                {format === "online" ? (
                  <VideoCameraIcon className="mt-0.5 h-5 w-5 shrink-0 text-[#1565C0] dark:text-[#6BA8F0]" />
                ) : (
                  <MapPinIcon className="mt-0.5 h-5 w-5 shrink-0 text-text-muted" />
                )}
                {isMeetingUrl(location) ? (
                  <div className="min-w-0 flex-1">
                    <a
                      href={location}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-sm text-[#1565C0] underline decoration-[#1565C0]/40 underline-offset-2 hover:text-[#0D47A1] dark:text-[#6BA8F0]"
                    >
                      {location}
                    </a>
                    <a
                      href={location}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-[#1565C0] px-3 py-1.5 text-xs font-medium text-white transition-micro hover:bg-[#1976D2]"
                    >
                      <VideoCameraIcon className="h-3.5 w-3.5" />
                      Tham gia họp
                    </a>
                  </div>
                ) : (
                  <p className="text-sm text-text-primary break-all">{location}</p>
                )}
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
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-text-muted">Người tạo</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <Avatar
                      src={avatarForRow(creatorRow, creatorUserId)}
                      alt={creatorName}
                      size="sm"
                    />
                    <p className="truncate text-sm text-text-primary">{creatorName}</p>
                    {renderPersonAction(creatorUserId)}
                  </div>
                </div>
              </div>
            )}

            {/* Chairman */}
            {chairman && (
              <div className="flex items-start gap-3">
                <UserIcon className="mt-0.5 h-5 w-5 shrink-0 text-[#1565C0] dark:text-[#6BA8F0]" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[#1565C0] dark:text-[#6BA8F0]">
                    Chủ trì
                  </p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <Avatar
                      src={avatarForRow(chairmanRow, chairmanResolvedUserId)}
                      alt={chairman}
                      size="sm"
                    />
                    <p className="truncate text-sm text-text-primary">{chairman}</p>
                    {renderPersonAction(chairmanResolvedUserId)}
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
                        {/* Lý do từ chối — thứ người tạo lịch cần biết nhất khi
                            thấy ai đó không tham gia. Hiện trọn, không cắt dòng.
                            break-all vì lý do có thể là 1 chuỗi liền không dấu
                            cách — break-words không cắt được, đẩy vỡ layout. */}
                        {p.response === "DECLINED" && p.responseNote && (
                          <p className="mt-0.5 break-all text-[11px] italic text-rose-600 dark:text-rose-300">
                            Lý do: {p.responseNote}
                          </p>
                        )}
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

        </div>

        {/* Footer ghim — luôn thấy được, nội dung phía trên tự cuộn. */}
        {(canRespond || canEdit || canDelete) && (
          <div className="flex-shrink-0 border-t border-border px-6 py-4">
            {/* Hai nút phản hồi nằm cùng hàng ở footer (không tách lên tiêu đề
                nữa — trông rời rạc), cách nhau một khoảng để đỡ bấm nhầm. */}
            {canRespond && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="text-sm font-medium text-text-primary">
                      {myResponse === "ACCEPTED"
                        ? "Bạn đã xác nhận tham gia"
                        : myResponse === "DECLINED"
                          ? "Bạn đã từ chối tham gia"
                          : "Bạn được mời tham gia lịch họp này"}
                    </p>
                    {myDeclineReason && (
                      <p className="mt-0.5 line-clamp-2 break-all text-xs italic text-text-muted">
                        Lý do đã gửi: “{myDeclineReason}”
                      </p>
                    )}
                  </div>
                  {/* gap-6 giữa 2 nút: đủ xa để không bấm nhầm Tham gia ↔ Không tham gia */}
                  <div className="flex shrink-0 items-center gap-6">
                    {declineButton}
                    {acceptButton}
                  </div>
                </div>
                {/* Lý do từ chối (không bắt buộc) — gửi kèm response, BE lưu vào
                    participant.responseNote nên cả phòng cùng đọc được. */}
                {declineReasonOpen && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-2.5 dark:border-rose-800 dark:bg-rose-900/10">
                    <label className="mb-1 block text-xs font-medium text-rose-700 dark:text-rose-300">
                      Lý do không tham gia (không bắt buộc)
                    </label>
                    <textarea
                      value={declineReason}
                      onChange={(e) => setDeclineReason(e.target.value.slice(0, DECLINE_REASON_MAX))}
                      rows={4}
                      autoFocus
                      placeholder="VD: Trùng lịch khác, đang nghỉ phép…"
                      className="w-full resize-y rounded-md border border-rose-200 bg-surface px-2 py-1.5 text-xs leading-relaxed text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-rose-300/40 dark:border-rose-800"
                    />
                    <div className="mt-1.5 flex items-center justify-end gap-2">
                      <span className="mr-auto text-[11px] text-text-muted">
                        {declineReason.length}/{DECLINE_REASON_MAX}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setDeclineReasonOpen(false);
                          setDeclineReason("");
                        }}
                        className="rounded-md px-2 py-1 text-[11px] font-medium text-text-muted hover:bg-surface-hover"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        disabled={responding !== null}
                        onClick={() => void handleRespondClick("DECLINED", declineReason.trim() || undefined)}
                        className="rounded-md bg-rose-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-rose-700 disabled:opacity-60"
                      >
                        {responding === "DECLINED"
                          ? "Đang lưu..."
                          : myResponse === "DECLINED"
                            ? "Cập nhật lý do"
                            : "Gửi lý do & không tham gia"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Chia sẻ link tham gia — chỉ MEETING + visibility Nhóm/Đơn vị/Công khai. */}
            {canShareLink && (
              <div className={clsx(canRespond && "mt-3")}>
                {!shareLinkOpen ? (
                  <button
                    type="button"
                    onClick={() => {
                      // Đã có link → bấm 1 phát là chép luôn, không mở panel.
                      if (shareLinkUrl) {
                        setShareLinkOpen(true);
                        void handleCopyShareLink();
                        return;
                      }
                      void handleOpenShareLink();
                    }}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#1976D2]/60 bg-[#1976D2]/10 px-3 py-1.5 text-xs font-medium text-[#1565C0] transition-micro hover:bg-[#1976D2]/20"
                  >
                    <LinkIcon className="h-4 w-4" />
                    {shareLinkUrl ? "Sao chép link tham gia" : "Chia sẻ link tham gia"}
                  </button>
                ) : (
                  <div className="rounded-lg border border-[#1976D2]/40 bg-[#1976D2]/5 p-2.5">
                    {shareLinkLoading ? (
                      <p className="text-xs text-text-muted">Đang tạo link...</p>
                    ) : shareLinkUrl ? (
                      <>
                        {/* Hiện tên cuộc họp thay cho chuỗi token dài loằng
                            ngoằng — vẫn là link thật (href = shareLinkUrl), và
                            nút Sao chép vẫn chép nguyên URL. */}
                        <a
                          href={shareLinkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={shareLinkUrl}
                          className="mb-1.5 flex items-center gap-1.5 rounded-md bg-surface px-2 py-1.5 transition-micro hover:bg-surface-hover"
                        >
                          <LinkIcon className="h-3.5 w-3.5 shrink-0 text-[#1565C0] dark:text-[#6BA8F0]" />
                          <span className="truncate text-[11px] font-medium text-[#1565C0] underline decoration-[#1565C0]/40 underline-offset-2 dark:text-[#6BA8F0]">
                            {event.title}
                          </span>
                        </a>
                        <p className="mb-2 text-[11px] text-text-muted">
                          Ai bấm vào link này (đã đăng nhập) sẽ tự động tham gia lịch họp. Link tự hết hạn khi lịch kết thúc.
                        </p>
                      </>
                    ) : (
                      <p className="mb-2 text-[11px] text-text-muted">
                        Lịch này đã có link chia sẻ đang hoạt động — link cũ không hiện lại được, chỉ có thể thu hồi rồi tạo mới.
                      </p>
                    )}
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShareLinkOpen(false)}
                        className="rounded-md px-2 py-1 text-[11px] font-medium text-text-muted hover:bg-surface-hover"
                      >
                        Đóng
                      </button>
                      {shareLinkExists && (
                        <button
                          type="button"
                          disabled={shareLinkRevoking}
                          onClick={() => void handleRevokeShareLink()}
                          className="rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-600 hover:bg-rose-100 disabled:opacity-60 dark:border-rose-700 dark:bg-rose-900/20 dark:text-rose-300"
                        >
                          {shareLinkRevoking ? "Đang thu hồi..." : "Thu hồi link"}
                        </button>
                      )}
                      {shareLinkUrl && (
                        <button
                          type="button"
                          onClick={() => void handleCopyShareLink()}
                          className="inline-flex items-center gap-1.5 rounded-md bg-[#1565C0] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-[#1976D2]"
                        >
                          <LinkIcon className="h-3.5 w-3.5" />
                          Sao chép
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Action buttons — Xóa (phá hoại) ở góc trái, Chỉnh sửa ở góc phải,
                tách xa nhau để tránh bấm nhầm. */}
            {(canEdit || canDelete) && (
              <div className={clsx("flex items-center justify-between gap-2", (canRespond || canShareLink) && "mt-3")}>
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
        )}
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
