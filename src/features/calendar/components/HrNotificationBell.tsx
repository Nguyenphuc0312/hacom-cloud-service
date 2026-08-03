/**
 * HrNotificationBell — surfaces hr-api-service in-app notifications (calendar
 * meeting invites / responses) inside chat-web-client via short polling.
 * The HR calendar is an optional feature, so all fetches fail silently.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BellIcon } from "@heroicons/react/24/outline";
import {
  CalendarDaysIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
} from "@heroicons/react/24/solid";
import clsx from "clsx";

import {
  hrNotificationApi,
  type HrAppNotification,
} from "../../api/hrNotificationApi";
import { refreshHrUnreadCount, useHrUnreadCount } from "../useHrUnreadCount";
import {
  filterHrNotifications,
  type HrNotificationKindFilter,
  type HrNotificationTimeFilter,
} from "../utils/filterHrNotifications";
import {
  eventTitleOf,
  parseNotificationBody,
} from "../utils/parseNotificationBody";

const POLL_MS = 30_000;

const TIME_TABS: Array<{ id: HrNotificationTimeFilter; label: string }> = [
  { id: "all", label: "Tất cả" },
  { id: "today", label: "Hôm nay" },
  { id: "week", label: "Tuần này" },
];

const KIND_TABS: Array<{ id: HrNotificationKindFilter; label: string }> = [
  { id: "all", label: "Tất cả" },
  { id: "invited", label: "Mời họp" },
  { id: "accepted", label: "Đã xác nhận" },
  { id: "declined", label: "Đã từ chối" },
  { id: "changed", label: "Đổi / huỷ" },
];

const relativeTime = (iso: string): string => {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "Vừa xong";
  if (diffMin < 60) return `${diffMin} phút trước`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} ngày trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
};

/**
 * Trạng thái hiển thị của một thông báo — mã hoá bằng MÀU + ICON + nhãn, không
 * chỉ bằng chữ. Danh sách toàn tiêu đề "Cập nhật phản hồi lịch họp" giống hệt
 * nhau thì mắt không lướt được; phải nhìn ra ngay ai từ chối, ai đồng ý.
 */
type NotificationTone = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Vạch màu bên trái + nền chip + màu chữ/icon. Dùng token semantic của app. */
  stripe: string;
  chip: string;
  text: string;
};

const TONE_ACCEPTED: NotificationTone = {
  label: "Đồng ý",
  icon: CheckCircleIcon,
  stripe: "bg-[hsl(var(--color-success))]",
  chip: "bg-[hsl(var(--color-success)/0.12)]",
  text: "text-[hsl(var(--color-success))]",
};
const TONE_DECLINED: NotificationTone = {
  label: "Từ chối",
  icon: XCircleIcon,
  stripe: "bg-[hsl(var(--color-danger))]",
  chip: "bg-[hsl(var(--color-danger)/0.12)]",
  text: "text-[hsl(var(--color-danger))]",
};
const TONE_INVITED: NotificationTone = {
  label: "Mời họp",
  icon: CalendarDaysIcon,
  stripe: "bg-[#1565C0]",
  chip: "bg-[#1565C0]/[0.12]",
  text: "text-[#1565C0]",
};
const TONE_CHANGED: NotificationTone = {
  label: "Thay đổi",
  icon: ExclamationTriangleIcon,
  stripe: "bg-[hsl(var(--color-warning))]",
  chip: "bg-[hsl(var(--color-warning)/0.14)]",
  text: "text-[hsl(var(--color-warning))]",
};

const toneOf = (n: HrAppNotification): NotificationTone => {
  if (n.type === "calendar.meeting.participant_responded") {
    return n.payload?.["response"] === "DECLINED"
      ? TONE_DECLINED
      : TONE_ACCEPTED;
  }
  if (n.type === "calendar.meeting.cancelled") {
    return { ...TONE_CHANGED, label: "Đã huỷ" };
  }
  if (n.type === "calendar.meeting.updated") {
    return { ...TONE_CHANGED, label: "Đổi lịch" };
  }
  return TONE_INVITED;
};

const actionUrlOf = (n: HrAppNotification): string | null => {
  const fromPayload =
    n.payload && typeof n.payload["actionUrl"] === "string"
      ? (n.payload["actionUrl"] as string)
      : null;
  if (fromPayload) return fromPayload;
  if (n.entityType === "CALENDAR_EVENT" && n.entityId) {
    return `/calendar?eventId=${n.entityId}`;
  }
  return null;
};

const FilterChip: React.FC<{
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={clsx(
      "shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium transition-micro",
      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#1565C0]",
      active
        ? "bg-[#1565C0] text-white"
        : "bg-surface-hover text-text-muted hover:text-text-primary",
    )}
  >
    {label}
  </button>
);

export const HrNotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<HrAppNotification[]>([]);
  const [timeFilter, setTimeFilter] = useState<HrNotificationTimeFilter>("all");
  const [kindFilter, setKindFilter] = useState<HrNotificationKindFilter>("all");
  // Count is shared with the SideRail badge so both show the same number.
  const unread = useHrUnreadCount();
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    refreshHrUnreadCount();
    try {
      const list = await hrNotificationApi.list({ page: 1, pageSize: 20 });
      if (!mountedRef.current) return;
      setItems(list);
    } catch {
      // Optional feature — ignore (HR not linked, network, 401/403, etc.)
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    // refresh() is async — setState runs after `await`, not synchronously — so
    // this is a genuine data-fetch/poll, not the cascading-render pattern the
    // rule targets.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [refresh]);

  const handleOpen = async (n: HrAppNotification) => {
    setOpen(false);
    if (!n.readAt) {
      try {
        await hrNotificationApi.markRead(n.id);
      } catch {
        /* ignore */
      }
      void refresh();
    }
    const url = actionUrlOf(n);
    if (url) navigate(url);
  };

  const visibleItems = useMemo(
    () => filterHrNotifications(items, timeFilter, kindFilter),
    [items, timeFilter, kindFilter],
  );

  const handleMarkAll = async () => {
    try {
      await hrNotificationApi.markAllRead();
    } catch {
      /* ignore */
    }
    void refresh();
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Thông báo lịch họp"
        className="relative rounded-lg p-1.5 text-text-muted transition-micro hover:bg-surface-hover hover:text-text-primary"
      >
        <BellIcon className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Đóng"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-2 w-96 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm font-semibold text-text-primary">
                Thông báo
              </span>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => void handleMarkAll()}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Đánh dấu đã đọc
                </button>
              )}
            </div>

            <div className="space-y-2 border-t border-border px-3 pb-2.5 pt-2.5">
              {/* Thời gian: segmented control — 3 lựa chọn loại trừ nhau, chia
                  đều một dải liền để mắt đọc là "một nhóm", không phải 3 nút rời. */}
              <div className="flex rounded-lg bg-surface-hover p-0.5">
                {TIME_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTimeFilter(tab.id)}
                    aria-pressed={timeFilter === tab.id}
                    className={clsx(
                      "flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-micro",
                      timeFilter === tab.id
                        ? "bg-surface text-text-primary shadow-sm"
                        : "text-text-muted hover:text-text-primary",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {/* Loại: 5 mục, cuộn ngang một hàng thay vì xuống dòng lởm chởm. */}
              <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {KIND_TABS.map((tab) => (
                  <FilterChip
                    key={tab.id}
                    label={tab.label}
                    active={kindFilter === tab.id}
                    onClick={() => setKindFilter(tab.id)}
                  />
                ))}
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {visibleItems.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-text-muted">
                  {items.length === 0
                    ? "Không có thông báo"
                    : "Không có thông báo khớp bộ lọc"}
                </p>
              ) : (
                visibleItems.map((n) => {
                  const tone = toneOf(n);
                  const ToneIcon = tone.icon;
                  const event = eventTitleOf(n.payload, n.body);
                  const { reason } = parseNotificationBody(n.body);
                  const actor = n.actorName;
                  // Thông báo CŨ (trước khi BE gửi isOwnEvent) không có field
                  // này → không đoán bừa, ẩn nhãn đi thay vì gán sai.
                  const ownership = n.payload?.["isOwnEvent"];
                  const ownerLabel =
                    ownership === true
                      ? "Lịch của tôi"
                      : ownership === false
                        ? "Được mời"
                        : null;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => void handleOpen(n)}
                      className={clsx(
                        "relative flex w-full gap-2.5 border-t border-border py-2.5 pl-4 pr-3 text-left transition-micro hover:bg-surface-hover",
                        !n.readAt && "bg-[#1976D2]/[0.04]",
                      )}
                    >
                      {/* Vạch trạng thái: đọc được màu trước cả khi đọc chữ. */}
                      <span
                        aria-hidden="true"
                        className={clsx(
                          "absolute inset-y-0 left-0 w-[3px]",
                          tone.stripe,
                          n.readAt && "opacity-40",
                        )}
                      />
                      <ToneIcon
                        className={clsx(
                          "mt-0.5 h-4 w-4 shrink-0",
                          tone.text,
                          n.readAt && "opacity-60",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        {/* Tên cuộc họp là thứ người ta tìm → cho lên đầu. */}
                        <span
                          className={clsx(
                            "block truncate text-sm text-text-primary",
                            n.readAt ? "font-medium" : "font-semibold",
                          )}
                        >
                          {event ?? n.title}
                        </span>

                        <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                          <span
                            className={clsx(
                              "rounded-full px-1.5 py-px text-[10px] font-semibold",
                              tone.chip,
                              tone.text,
                            )}
                          >
                            {tone.label}
                          </span>
                          {/* Lịch mình tạo hay người khác tạo — hai việc khác
                              hẳn nhau: một bên là người ta trả lời MÌNH, bên
                              kia là mình được mời. */}
                          {ownerLabel && (
                            <span className="rounded-full border border-border px-1.5 py-px text-[10px] font-medium text-text-muted">
                              {ownerLabel}
                            </span>
                          )}
                          {actor && (
                            <span className="min-w-0 truncate text-xs text-text-primary/80">
                              {actor}
                            </span>
                          )}
                        </span>

                        {reason && (
                          <span className="mt-1 block line-clamp-2 border-l-2 border-border pl-2 text-xs italic text-text-muted">
                            {reason}
                          </span>
                        )}

                        <span className="mt-1 block text-[11px] text-text-muted">
                          {relativeTime(n.createdAt)}
                        </span>
                      </span>

                      {!n.readAt && (
                        <span
                          aria-label="Chưa đọc"
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#1976D2]"
                        />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default HrNotificationBell;
