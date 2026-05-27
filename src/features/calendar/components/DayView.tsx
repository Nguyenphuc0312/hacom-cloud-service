/**
 * DayView - Shows a single day with hourly timeline
 */

import React from "react";
import clsx from "clsx";
import { getEventColor, type CalendarEvent } from "../data/calendarEvents";

interface DayViewProps {
  date: Date;
  events: CalendarEvent[];
  attendance?: {
    firstPunch?: string | null;
    lastPunch?: string | null;
    totalTime?: string | null;
  };
  onEventClick: (event: CalendarEvent) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

const formatHour = (hour: number): string => {
  return `${hour.toString().padStart(2, "0")}:00`;
};

const formatTime = (time: string | null | undefined): string => {
  if (!time) return "--:--";
  return time;
};

export const DayView: React.FC<DayViewProps> = ({
  date,
  events,
  attendance,
  onEventClick,
}) => {
  const dayEvents = events.filter((event) => {
    const eventDate = new Date(event.date);
    return eventDate.toDateString() === date.toDateString();
  });

  const formatDateDisplay = (d: Date): string => {
    const weekdays = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
    return `${weekdays[d.getDay()]}, ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`;
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-lg font-semibold text-text-primary">
          {formatDateDisplay(date)}
        </h2>
      </div>

      {/* Attendance summary */}
      {attendance && (
        <div className="border-b border-border bg-emerald-50 px-4 py-2 dark:bg-emerald-900/20">
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1">
              <span className="font-medium text-emerald-700 dark:text-emerald-300">Giờ đến:</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400">
                {formatTime(attendance.firstPunch) || "--:--"}
              </span>
            </span>
            <span className="flex items-center gap-1">
              <span className="font-medium text-emerald-700 dark:text-emerald-300">Giờ về:</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400">
                {formatTime(attendance.lastPunch) || "--:--"}
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

      {/* Hourly timeline */}
      <div className="flex-1 overflow-auto">
        <div className="relative min-h-[1440px]">
          {/* Hour lines */}
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="absolute left-0 right-0 flex border-t border-border"
              style={{ top: `${hour * 60}px` }}
            >
              <div className="w-16 shrink-0 py-1 pr-2 text-right text-xs text-text-muted">
                {formatHour(hour)}
              </div>
              <div className="flex-1 h-[60px]" />
            </div>
          ))}

          {/* Current time indicator */}
          <div
            className="absolute left-16 right-0 z-10 flex items-center"
            style={{
              top: `${new Date().getHours() * 60 + new Date().getMinutes()}px`,
            }}
          >
            <div className="h-0.5 w-3 rounded-l-full bg-danger" />
            <div className="h-0.5 flex-1 bg-danger/30" />
          </div>

          {/* Events */}
          <div className="absolute left-16 right-0">
            {dayEvents.map((event) => {
              const eventHour = event.time ? parseInt(event.time.split(":")[0], 10) : 8;
              const eventMinute = event.time ? parseInt(event.time.split(":")[1], 10) : 0;
              const top = eventHour * 60 + eventMinute;
              const colors = getEventColor(event.type);

              return (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => onEventClick(event)}
                  className={clsx(
                    "absolute left-1 right-1 rounded-md border px-2 py-1 text-left text-xs transition-micro",
                    colors.bg,
                    colors.border,
                    colors.text,
                    "hover:opacity-80 cursor-pointer"
                  )}
                  style={{ top: `${top}px` }}
                >
                  <span className="block truncate font-medium">{event.title}</span>
                  {event.time && (
                    <span className="block truncate text-[10px] opacity-70">{event.time}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DayView;
