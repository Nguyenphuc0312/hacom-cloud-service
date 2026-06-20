/**
 * DayView - Lịch theo ngày, timeline 24h.
 *
 * Phase 1 (xem docs/CALENDAR_SPEC.md):
 *  - Event cao theo thời lượng (startAt/endAt), không còn block cố định.
 *  - Event trùng giờ chia cột overlap (tối đa 3).
 *  - Hàng "ALL DAY" cho event không có giờ (lễ, task theo ngày, all-day).
 *  - Current-time line tick mỗi phút + auto-scroll tới giờ hiện tại khi mở.
 */

import React, { useEffect, useMemo, useRef } from "react";
import clsx from "clsx";
import { getEventColor, MULTI_DAY_EVENT_COLOR, type CalendarEvent } from "../data/calendarEvents";
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

interface DayViewProps {
  date: Date;
  events: CalendarEvent[];
  attendance?: {
    firstPunch?: string | null;
    lastPunch?: string | null;
    totalTime?: string | null;
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
const formatTime = (time: string | null | undefined): string => (time ? time : "--:--");
const fmtMin = (min: number): string => {
  const clamped = Math.max(0, Math.min(min, MINUTES_PER_DAY));
  const h = Math.floor(clamped / 60) % 24;
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const sameDay = (a: Date, b: Date): boolean => a.toDateString() === b.toDateString();

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
  const showTime = height >= 34 && !isLong;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onEventClick(event);
      }}
      title={`${event.title} · ${fmtMin(startMin)}–${fmtMin(endMin)}`}
      className={clsx(
        "absolute overflow-hidden rounded-md border px-2 py-0.5 text-left transition-micro hover:z-20 hover:opacity-90 hover:shadow-md",
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
          isLong ? "font-semibold" : "font-medium",
        )}
      >
        {event.title}
      </span>
      {showTime && (
        <span className="block truncate text-[10px] opacity-70">
          {formatEventTimeRange(event) ?? `${fmtMin(startMin)} — ${fmtMin(endMin)}`}
        </span>
      )}
    </button>
  );
};

export const DayView: React.FC<DayViewProps> = ({
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

  const formatDateDisplay = (d: Date): string => {
    const weekdays = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
    return `${weekdays[d.getDay()]}, ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`;
  };

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
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-lg font-semibold text-text-primary">
          {formatDateDisplay(date)}
        </h2>
        {isToday && (
          <span className="shrink-0 rounded-full bg-[#1565C0] px-2.5 py-1 text-xs font-bold text-white">
            Hôm nay
          </span>
        )}
      </div>

      {/* Attendance summary */}
      {attendance && (
        <div className="border-b border-border bg-emerald-50 px-4 py-2 dark:bg-emerald-900/20">
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1">
              <span className="font-medium text-emerald-700 dark:text-emerald-300">Giờ đến:</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400">
                {formatTime(attendance.firstPunch)}
              </span>
            </span>
            <span className="flex items-center gap-1">
              <span className="font-medium text-emerald-700 dark:text-emerald-300">Giờ về:</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400">
                {formatTime(attendance.lastPunch)}
              </span>
            </span>
            {attendance.totalTime && (
              <span className="flex items-center gap-1">
                <span className="font-medium text-emerald-700 dark:text-emerald-300">Tổng:</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400">
                  {attendance.totalTime}
                </span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* All-day row */}
      {allDay.length > 0 && (
        <div className="flex border-b border-border bg-surface-overlay/40">
          <div className="w-16 shrink-0 py-1.5 pr-2 text-right text-[10px] font-medium uppercase tracking-wide text-text-muted">
            All day
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
                className="border-b border-border px-2 py-0.5 text-right text-xs text-text-muted"
                style={{ height: `${HOUR_HEIGHT}px` }}
              >
                {formatHour(hour)}
              </div>
            ))}
          </div>

          {/* Day body — mỗi giờ = 2 slot 30 phút, hover & click tạo lịch (kiểu Teams) */}
          <div className="relative flex-1">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="border-b border-border"
                style={{ height: `${HOUR_HEIGHT}px` }}
              >
                <button
                  type="button"
                  disabled={!onSlotClick}
                  onClick={onSlotClick ? () => onSlotClick(date, hour * 60) : undefined}
                  title={onSlotClick ? "Tạo lịch" : undefined}
                  className={clsx(
                    "block h-1/2 w-full border-b border-border/40",
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
                <div className="h-2 w-2 -translate-x-1 rounded-full bg-danger" />
                <div className="h-0.5 flex-1 bg-danger" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DayView;
