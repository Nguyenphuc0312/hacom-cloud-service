/**
 * DayView - Lịch theo ngày, timeline 24h.
 *
 * Phase 1 (xem docs/CALENDAR_SPEC.md):
 *  - Event cao theo thời lượng (startAt/endAt), không còn block cố định.
 *  - Event trùng giờ chia cột overlap (tối đa 3).
 *  - Hàng "Cả ngày" cho event không có giờ (lễ, task theo ngày, all-day).
 *  - Current-time line tick mỗi phút + auto-scroll tới giờ hiện tại khi mở.
 */

import React, { useEffect, useMemo, useRef } from "react";
import clsx from "clsx";
import {
  getEventColor,
  MULTI_DAY_EVENT_COLOR,
  type CalendarEvent,
  type ExtendedCalendarEvent,
} from "../data/calendarEvents";
import {
  HOURS,
  MINUTES_PER_DAY,
  eventOccursOnDay,
  formatEventTimeRange,
  getMultiDayPosition,
  isMultiDayEvent,
  layoutDayEvents,
  type PositionedEvent,
} from "../utils/timeline";

/** Màu ngày KẾT THÚC của lịch nhiều ngày (đồng bộ thanh trải ở Tháng/widget). */
const MULTI_DAY_END_COLOR = {
  bg: "bg-[#DC2626]",
  text: "text-white",
  border: "border-[#DC2626]",
} as const;
import { useNowMinute } from "../hooks/useNowMinute";
import { attendanceCalendarLabel } from "../utils/attendanceCalendarPresentation";

interface DayViewProps {
  date: Date;
  events: CalendarEvent[];
  attendance?: {
    displaySymbol?: string | null;
    shiftCode?: string | null;
    shiftName?: string | null;
    lateMinutes?: number | null;
  };
  onEventClick: (event: CalendarEvent) => void;
  /** Click ô khung giờ trống → tạo lịch tại thời điểm đó (phút từ nửa đêm). */
  onSlotClick?: (date: Date, minutes: number) => void;
}

/** px mỗi giờ trên lưới ngày (1px = 1 phút). */
const HOUR_HEIGHT = 60;
const PX_PER_MIN = HOUR_HEIGHT / 60;
const MIN_BLOCK_HEIGHT = 22;

const formatHour = (hour: number): string => `${hour.toString().padStart(2, "0")}:00`;
const fmtMin = (min: number): string => {
  const clamped = Math.max(0, Math.min(min, MINUTES_PER_DAY));
  const h = Math.floor(clamped / 60) % 24;
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const sameDay = (a: Date, b: Date): boolean => a.toDateString() === b.toDateString();

/** Chữ cái đầu cho avatar (tên VN: lấy chữ cái của 2 từ cuối). */
const initials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

/** Màu nền avatar ổn định theo tên. */
const AVATAR_BG = ["bg-[#1565C0]", "bg-rose-500", "bg-amber-500", "bg-teal-500", "bg-purple-500", "bg-emerald-500"];
const avatarBg = (name: string): string => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_BG[h % AVATAR_BG.length];
};

/** Chồng avatar (ảnh thật → fallback initials) + +N, kiểu Dribbble. */
export type Attendee = { name: string; avatarUrl?: string | null; userId?: string | null };
export const AvatarStack: React.FC<{ people: Attendee[]; max?: number }> = ({ people, max = 3 }) => {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="flex items-center">
      <div className="flex -space-x-1.5">
        {shown.map((p, i) =>
          p.avatarUrl ? (
            <img
              key={`${p.name}-${i}`}
              src={p.avatarUrl}
              alt={p.name}
              title={p.name}
              loading="lazy"
              className="h-5 w-5 rounded-full object-cover ring-1 ring-surface"
            />
          ) : (
            <span
              key={`${p.name}-${i}`}
              title={p.name}
              className={clsx(
                "flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold text-white ring-1 ring-surface",
                avatarBg(p.name),
              )}
            >
              {initials(p.name)}
            </span>
          ),
        )}
      </div>
      {extra > 0 && (
        <span className="ml-1 rounded-full bg-surface/80 px-1 text-[9px] font-semibold text-text-secondary ring-1 ring-border">
          +{extra}
        </span>
      )}
    </div>
  );
};

const TimedEventBlock: React.FC<{
  positioned: PositionedEvent;
  date: Date;
  onEventClick: (event: CalendarEvent) => void;
}> = ({ positioned, date, onEventClick }) => {
  const { event, startMin, endMin, col, colCount } = positioned;
  // Lịch dài hạn (nhiều ngày) → màu vàng nổi bật + chữ to & đậm hơn cho dễ thấy;
  // riêng ngày KẾT THÚC tô đỏ (#DC2626) đồng bộ với view Tháng.
  const isLong = isMultiDayEvent(event);
  const span = isLong ? getMultiDayPosition(event, date) : null;
  const colors =
    span === "end" ? MULTI_DAY_END_COLOR : isLong ? MULTI_DAY_EVENT_COLOR : getEventColor(event.type);
  const top = startMin * PX_PER_MIN;
  const height = Math.max((endMin - startMin) * PX_PER_MIN, MIN_BLOCK_HEIGHT);
  const widthPct = 100 / colCount;
  // Không hiện giờ clamp theo ngày cho event nhiều ngày (tránh "00:00–24:00" gây rối).
  const showTime = height >= 40 && !isLong;
  const ext = event as ExtendedCalendarEvent;
  // Ưu tiên roster có avatar; fallback danh sách tên free-text.
  const people: Attendee[] =
    ext.attendeeAvatars?.length
      ? ext.attendeeAvatars
      : (ext.attendees ?? []).map((name) => ({ name }));
  // Avatar stack chỉ khi đủ cao + đủ rộng (1 cột) để không vỡ layout.
  const showAvatars = people.length > 0 && height >= 64 && colCount === 1;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onEventClick(event);
      }}
      title={`${event.title} · ${fmtMin(startMin)}–${fmtMin(endMin)}`}
      className={clsx(
        "absolute flex flex-col overflow-hidden rounded-xl border px-2.5 py-1.5 text-left transition-micro hover:z-20 hover:shadow-md",
        isLong ? "text-sm" : "text-xs",
        colors.bg,
        colors.border,
        colors.text,
      )}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        left: `calc(${col * widthPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
      }}
    >
      <span
        className={clsx(
          "block truncate leading-tight",
          isLong ? "font-semibold" : "font-semibold",
        )}
      >
        {event.title}
      </span>
      {showTime && (
        <span className="block truncate text-[10px] font-medium opacity-70">
          {formatEventTimeRange(event) ?? `${fmtMin(startMin)} — ${fmtMin(endMin)}`}
        </span>
      )}
      {showAvatars && (
        <div className="mt-auto pt-1">
          <AvatarStack people={people} />
        </div>
      )}
    </button>
  );
};

// memo: parent (CalendarPage) re-renders on every modal toggle; props are
// stable (useCallback handlers) so memo lets Day view skip those re-renders.
const DayViewImpl: React.FC<DayViewProps> = ({
  date,
  events,
  attendance,
  onEventClick,
  onSlotClick,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const nowMin = useNowMinute();
  const isToday = sameDay(date, new Date());

  const dayEvents = useMemo(
    () => events.filter((event) => eventOccursOnDay(event, date)),
    [events, date],
  );

  const { timed, allDay } = useMemo(() => layoutDayEvents(dayEvents, 3, date), [dayEvents, date]);

  const weekdays = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
  const attendanceLabel = attendanceCalendarLabel(attendance);
  const isLate = (attendance?.lateMinutes ?? 0) > 0;

  // Auto-scroll tới giờ hiện tại (today) hoặc 07:00 (ngày khác) khi mở/đổi ngày.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = isToday ? nowMin : 7 * 60;
    el.scrollTop = Math.max(0, target * PX_PER_MIN - 200);
    // Chỉ chạy khi đổi ngày — không phụ thuộc nowMin để tránh giật khi tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header — số ngày to kiểu date-picker, thứ + tháng/năm xếp cạnh */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            className={clsx(
              "flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl",
              isToday
                ? "bg-[#1565C0] text-white shadow-sm shadow-[#1565C0]/25"
                : isWeekend
                  ? "bg-rose-500/10 text-rose-500"
                  : "bg-[#DBEAFE]/40 text-[#1565C0]",
            )}
          >
            <span className="text-xl font-bold leading-none">{date.getDate()}</span>
            <span className="mt-0.5 text-[9px] font-medium uppercase tracking-wide opacity-80">
              Th{date.getMonth() + 1}
            </span>
          </div>
          <div className="min-w-0">
            <div
              className={clsx(
                "text-base font-semibold",
                isWeekend ? "text-rose-500" : "text-text-primary",
              )}
            >
              {weekdays[date.getDay()]}
            </div>
            <div className="text-xs text-text-muted">
              Ngày {date.getDate()} tháng {date.getMonth() + 1} năm {date.getFullYear()}
            </div>
          </div>
        </div>
        {isToday && (
          <span className="shrink-0 rounded-full bg-[#1565C0] px-2.5 py-1 text-xs font-bold text-white">
            Hôm nay
          </span>
        )}
      </div>

      {/* Ca/phép đồng bộ từ HRM; giờ chấm chỉ xem ở màn Công phép. */}
      {attendanceLabel && attendance && (
        <div className="border-b border-border bg-surface-overlay px-4 py-2">
          <div className="flex items-center gap-1 text-sm">
            <span className="font-medium text-text-secondary">
              {attendanceLabel === attendance.shiftCode?.trim() ? "Ca:" : "Ký hiệu:"}
            </span>
            <span
              className={clsx(
                "rounded border border-border bg-surface px-2 py-0.5 font-semibold",
                isLate ? "text-rose-600 dark:text-rose-400" : "text-text-primary",
              )}
              title={attendance.shiftName ?? undefined}
            >
              {attendanceLabel}
            </span>
          </div>
        </div>
      )}

      {/* All-day row */}
      {allDay.length > 0 && (
        <div className="flex border-b border-border bg-surface-overlay/40">
          <div className="w-16 shrink-0 py-1.5 pr-2 text-right text-[10px] font-medium uppercase tracking-wide text-text-muted">
            Cả ngày
          </div>
          <div className="flex flex-1 flex-wrap gap-1 px-1 py-1.5">
            {allDay.map((event) => {
              // Lịch nhiều ngày → màu vàng nổi bật; riêng ngày KẾT THÚC tô đỏ
              // (#DC2626), đồng bộ với view Tuần/Tháng/widget.
              const span = isMultiDayEvent(event) ? getMultiDayPosition(event, date) : null;
              const colors =
                span === "end"
                  ? MULTI_DAY_END_COLOR
                  : span
                    ? MULTI_DAY_EVENT_COLOR
                    : getEventColor(event.type);
              return (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => onEventClick(event)}
                  title={span === "end" ? `${event.title} · Kết thúc` : event.title}
                  className={clsx(
                    "max-w-full truncate rounded-md border px-2 py-0.5 text-xs font-medium transition-micro hover:opacity-90",
                    colors.bg,
                    colors.border,
                    colors.text,
                  )}
                >
                  {event.title}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Hourly timeline */}
      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div className="relative flex" style={{ height: `${MINUTES_PER_DAY * PX_PER_MIN}px` }}>
          {/* Hour labels */}
          <div className="w-16 shrink-0 border-r border-border">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="-translate-y-1.5 px-2 text-right text-[11px] font-medium text-text-muted"
                style={{ height: `${HOUR_HEIGHT}px` }}
              >
                {hour > 0 && formatHour(hour)}
              </div>
            ))}
          </div>

          {/* Day body — mỗi giờ = 2 slot 30 phút, hover & click tạo lịch (kiểu Teams) */}
          <div className="relative flex-1">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="border-b border-border/70"
                style={{ height: `${HOUR_HEIGHT}px` }}
              >
                <button
                  type="button"
                  disabled={!onSlotClick}
                  onClick={onSlotClick ? () => onSlotClick(date, hour * 60) : undefined}
                  title={onSlotClick ? "Tạo lịch" : undefined}
                  className={clsx(
                    "block h-1/2 w-full border-b border-dashed border-border/30",
                    onSlotClick && "cursor-pointer hover:bg-[#1976D2]/10",
                  )}
                />
                <button
                  type="button"
                  disabled={!onSlotClick}
                  onClick={onSlotClick ? () => onSlotClick(date, hour * 60 + 30) : undefined}
                  title={onSlotClick ? "Tạo lịch" : undefined}
                  className={clsx(
                    "block h-1/2 w-full",
                    onSlotClick && "cursor-pointer hover:bg-[#1976D2]/10",
                  )}
                />
              </div>
            ))}

            {/* Timed events */}
            {timed.map((positioned) => (
              <TimedEventBlock
                key={positioned.event.id}
                positioned={positioned}
                date={date}
                onEventClick={onEventClick}
              />
            ))}

            {/* Current time indicator */}
            {isToday && (
              <div
                className="pointer-events-none absolute left-0 right-0 z-30 flex items-center"
                style={{ top: `${nowMin * PX_PER_MIN}px` }}
              >
                <span className="-translate-x-1/2 rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-sm">
                  {fmtMin(nowMin)}
                </span>
                <div className="h-0.5 flex-1 bg-danger" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const DayView = React.memo(DayViewImpl);

export default DayView;
