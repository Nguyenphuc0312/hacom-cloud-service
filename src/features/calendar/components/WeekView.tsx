/**
 * WeekView - Lịch theo tuần (T2→CN), timeline 24h.
 *
 * Phase 1 (xem docs/CALENDAR_SPEC.md):
 *  - Neo theo TUẦN chứa `weekDate` (không còn khóa "tuần đầu của tháng").
 *  - Event cao theo thời lượng + chia cột overlap (tối đa 3) trong từng ngày.
 *  - Hàng "ALL DAY" cho event không có giờ.
 *  - Current-time line trên cột hôm nay, tick mỗi phút + auto-scroll khi mở.
 */

import React, { useEffect, useMemo, useRef } from "react";
import clsx from "clsx";
import { getEventColor, MULTI_DAY_EVENT_COLOR, type CalendarEvent } from "../data/calendarEvents";
import {
  HOURS,
  MINUTES_PER_DAY,
  eventOccursOnDay,
  getWeekDays,
  isMultiDayEvent,
  layoutDayEvents,
  nowMinutes,
} from "../utils/timeline";
import { useNowMinute } from "../hooks/useNowMinute";

interface AttendanceDay {
  date: string;
  firstPunch?: string | null;
  lastPunch?: string | null;
  totalTime?: string | null;
}

interface WeekViewProps {
  /** Ngày bất kỳ trong tuần cần hiển thị. */
  weekDate: Date;
  events: CalendarEvent[];
  attendanceData: AttendanceDay[];
  onDateClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
  /** Click ô khung giờ trống → tạo lịch tại thời điểm đó (phút từ nửa đêm). */
  onSlotClick?: (date: Date, minutes: number) => void;
  isToday: (date: Date) => boolean;
  isSelected: (date: Date) => boolean;
}

/** px mỗi giờ trên lưới tuần. */
const HOUR_HEIGHT = 48;
const PX_PER_MIN = HOUR_HEIGHT / 60;
const MIN_BLOCK_HEIGHT = 16;

const WEEKDAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

const formatHour = (hour: number): string => `${hour.toString().padStart(2, "0")}:00`;
const fmtMin = (min: number): string => {
  const clamped = Math.max(0, Math.min(min, MINUTES_PER_DAY));
  const h = Math.floor(clamped / 60) % 24;
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const dateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const WeekView: React.FC<WeekViewProps> = ({
  weekDate,
  events,
  attendanceData,
  onDateClick,
  onEventClick,
  onSlotClick,
  isToday,
  isSelected,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const nowMin = useNowMinute();
  const weekDays = useMemo(() => getWeekDays(weekDate), [weekDate]);

  const eventsByDay = useMemo(
    () =>
      weekDays.map((date) =>
        layoutDayEvents(
          events.filter((event) => eventOccursOnDay(event, date)),
          3,
          date,
        ),
      ),
    [weekDays, events],
  );

  const hasAllDay = eventsByDay.some((d) => d.allDay.length > 0);

  const getAttendanceForDay = (date: Date): AttendanceDay | undefined =>
    attendanceData.find((a) => a.date === dateKey(date));

  // Auto-scroll tới giờ hiện tại khi mở/đổi tuần.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = Math.max(0, nowMinutes() * PX_PER_MIN - 160);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekDate]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header + all-day + lưới giờ nằm CHUNG một vùng cuộn để cột thẳng hàng
          (tránh lệch do thanh cuộn chỉ ảnh hưởng phần lưới). Header dùng sticky. */}
      <div ref={scrollRef} className="flex-1 overflow-auto">
      {/* Day headers */}
      <div className="sticky top-0 z-40 flex border-b border-border bg-surface">
        <div className="w-16 shrink-0 border-r border-border" />
        {weekDays.map((date, index) => {
          const attendance = getAttendanceForDay(date);
          return (
            <button
              type="button"
              key={date.toISOString()}
              onClick={() => onDateClick(date)}
              className={clsx(
                "flex-1 border-r border-border px-2 py-2 text-center transition-micro hover:bg-surface-hover",
                isToday(date) && "bg-primary/5",
              )}
            >
              <div className="text-xs text-text-muted">{WEEKDAY_LABELS[index]}</div>
              <div
                className={clsx(
                  "mx-auto flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium",
                  !isToday(date) && "text-text-primary",
                  isToday(date) && "bg-primary text-white",
                  isSelected(date) && !isToday(date) && "bg-primary/10 ring-2 ring-primary/30",
                )}
              >
                {date.getDate()}
              </div>
              {/* Luôn giữ chỗ cho vùng chấm công để các cột cao bằng nhau (cân đối header) */}
              <div className="mt-0.5 h-[22px] space-y-px text-[9px] leading-tight text-emerald-600 dark:text-emerald-400">
                {attendance?.firstPunch || attendance?.lastPunch ? (
                  <>
                    <div className="truncate">Giờ đến {attendance?.firstPunch ?? "--:--"}</div>
                    <div className="truncate">Giờ về {attendance?.lastPunch ?? "--:--"}</div>
                  </>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      {/* All-day band */}
      {hasAllDay && (
        <div className="flex border-b border-border bg-surface-overlay/40">
          <div className="w-16 shrink-0 border-r border-border py-1 pr-2 text-right text-[10px] font-medium uppercase tracking-wide text-text-muted">
            All day
          </div>
          {weekDays.map((date, index) => (
            <div
              key={date.toISOString()}
              className="flex min-h-[28px] flex-1 flex-col gap-0.5 border-r border-border p-0.5"
            >
              {eventsByDay[index].allDay.map((event) => {
                const colors = getEventColor(event.type);
                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => onEventClick(event)}
                    title={event.title}
                    className={clsx(
                      "truncate rounded border px-1 py-0.5 text-left text-[10px] font-medium transition-micro hover:opacity-90",
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
          ))}
        </div>
      )}

      {/* Hourly grid */}
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

          {/* Day columns */}
          <div className="flex flex-1">
            {weekDays.map((date, index) => {
              const { timed } = eventsByDay[index];
              return (
                <div
                  key={date.toISOString()}
                  className="relative flex-1 border-r border-border"
                >
                  {/* Mỗi giờ = 2 slot 30 phút, hover & click tạo lịch (kiểu Teams) */}
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
                        className={clsx(
                          "block h-1/2 w-full border-b border-border/40",
                          onSlotClick && "cursor-pointer hover:bg-[#1976D2]/10",
                        )}
                      />
                      <button
                        type="button"
                        disabled={!onSlotClick}
                        onClick={onSlotClick ? () => onSlotClick(date, hour * 60 + 30) : undefined}
                        className={clsx(
                          "block h-1/2 w-full",
                          onSlotClick && "cursor-pointer hover:bg-[#1976D2]/10",
                        )}
                      />
                    </div>
                  ))}

                  {/* Current time line — chỉ cột hôm nay */}
                  {isToday(date) && (
                    <div
                      className="pointer-events-none absolute left-0 right-0 z-30 flex items-center"
                      style={{ top: `${nowMin * PX_PER_MIN}px` }}
                    >
                      <div className="h-1.5 w-1.5 rounded-full bg-danger" />
                      <div className="h-0.5 flex-1 bg-danger" />
                    </div>
                  )}

                  {/* Timed events */}
                  {timed.map(({ event, startMin, endMin, col, colCount }) => {
                    // Lịch dài hạn (nhiều ngày) → màu vàng + chữ to & đậm hơn.
                    const isLong = isMultiDayEvent(event);
                    const colors = isLong ? MULTI_DAY_EVENT_COLOR : getEventColor(event.type);
                    const top = startMin * PX_PER_MIN;
                    const height = Math.max((endMin - startMin) * PX_PER_MIN, MIN_BLOCK_HEIGHT);
                    const widthPct = 100 / colCount;
                    return (
                      <button
                        key={event.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEventClick(event);
                        }}
                        title={`${event.title} · ${fmtMin(startMin)}–${fmtMin(endMin)}`}
                        className={clsx(
                          "absolute overflow-hidden rounded border px-1 py-0.5 text-left transition-micro hover:z-20 hover:opacity-90 hover:shadow-md",
                          isLong ? "text-xs" : "text-[10px]",
                          colors.bg,
                          colors.border,
                          colors.text,
                        )}
                        style={{
                          top: `${top}px`,
                          height: `${height}px`,
                          left: `calc(${col * widthPct}% + 1px)`,
                          width: `calc(${widthPct}% - 2px)`,
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
                        {height >= 28 && !isLong && (
                          <span className="block truncate opacity-70">{fmtMin(startMin)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};


export default WeekView;
