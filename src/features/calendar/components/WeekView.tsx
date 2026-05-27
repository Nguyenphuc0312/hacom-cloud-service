/**
 * WeekView - Shows a week with daily columns
 */

import React from "react";
import clsx from "clsx";
import { getEventColor, type CalendarEvent } from "../data/calendarEvents";

interface AttendanceDay {
  date: string;
  firstPunch?: string | null;
  lastPunch?: string | null;
  totalTime?: string | null;
}

interface WeekViewProps {
  year: number;
  month: number;
  events: CalendarEvent[];
  attendanceData: AttendanceDay[];
  onDateClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
  isToday: (date: Date) => boolean;
  isSelected: (date: Date) => boolean;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

const formatHour = (hour: number): string => {
  return `${hour.toString().padStart(2, "0")}:00`;
};

const getWeekDays = (year: number, month: number): Date[] => {
  const firstDayOfMonth = new Date(year, month, 1);
  
  // Get the Monday of the first week of the month
  const dayOfWeek = firstDayOfMonth.getDay();
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const firstMonday = new Date(firstDayOfMonth);
  firstMonday.setDate(firstDayOfMonth.getDate() + daysToMonday);
  
  // Get 7 days for the week view
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(firstMonday);
    day.setDate(firstMonday.getDate() + i);
    days.push(day);
  }
  
  return days;
};

export const WeekView: React.FC<WeekViewProps> = ({
  year,
  month,
  events,
  attendanceData,
  onDateClick,
  onEventClick,
  isToday,
  isSelected,
}) => {
  const weekDays = getWeekDays(year, month);
  const weekdays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

  const getEventsForDay = (date: Date): CalendarEvent[] => {
    return events.filter((event) => {
      const eventDate = new Date(event.date);
      return eventDate.toDateString() === date.toDateString();
    });
  };

  const getAttendanceForDay = (date: Date): AttendanceDay | undefined => {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return attendanceData.find((a) => a.date === dateStr);
  };

  const isCurrentMonth = (date: Date): boolean => {
    return date.getMonth() === month;
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Day headers */}
      <div className="flex border-b border-border bg-surface">
        <div className="w-16 shrink-0 border-r border-border" />
        {weekDays.map((date, index) => {
          const attendance = getAttendanceForDay(date);
          return (
            <div
              key={date.toISOString()}
              className={clsx(
                "flex-1 border-r border-border px-2 py-2 text-center",
                !isCurrentMonth(date) && "bg-surface-overlay",
                isToday(date) && "bg-primary/5"
              )}
            >
              <div className="text-xs text-text-muted">{weekdays[index]}</div>
              <div
                className={clsx(
                  "mx-auto flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium",
                  !isCurrentMonth(date) && "text-text-disabled",
                  isCurrentMonth(date) && !isToday(date) && "text-text-primary",
                  isToday(date) && "bg-primary text-white",
                  isSelected(date) && !isToday(date) && "ring-2 ring-primary/30 bg-primary/10"
                )}
              >
                {date.getDate()}
              </div>
              {attendance && (
                <div className="mt-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                  {attendance.firstPunch ? `${attendance.firstPunch}` : "Chưa CC"}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Hourly grid */}
      <div className="flex-1 overflow-auto">
        <div className="relative flex">
          {/* Hour labels */}
          <div className="w-16 shrink-0 border-r border-border">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="relative h-[48px] border-b border-border px-2 py-1 text-right text-xs text-text-muted"
              >
                {formatHour(hour)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          <div className="flex flex-1">
            {weekDays.map((date) => {
              const dayEvents = getEventsForDay(date);
              return (
                <div
                  key={date.toISOString()}
                  className={clsx(
                    "relative flex-1 border-r border-border",
                    !isCurrentMonth(date) && "bg-surface-overlay"
                  )}
                >
                  {/* Hour lines */}
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="h-[48px] border-b border-border"
                    />
                  ))}

                  {/* Current time line */}
                  {isToday(date) && (
                    <div
                      className="absolute left-0 right-0 z-10 flex items-center"
                      style={{
                        top: `${new Date().getHours() * 48 + new Date().getMinutes()}px`,
                      }}
                    >
                      <div className="h-0.5 w-3 rounded-l-full bg-danger" />
                      <div className="h-0.5 flex-1 bg-danger/30" />
                    </div>
                  )}

                  {/* Events */}
                  <div className="absolute inset-0 p-0.5">
                    {dayEvents.map((event) => {
                      const eventHour = event.time ? parseInt(event.time.split(":")[0], 10) : 8;
                      const eventMinute = event.time ? parseInt(event.time.split(":")[1], 10) : 0;
                      const top = eventHour * 48 + (eventMinute / 60) * 48;
                      const colors = getEventColor(event.type);

                      return (
                        <button
                          key={event.id}
                          type="button"
                          onClick={() => onEventClick(event)}
                          className={clsx(
                            "absolute left-0.5 right-0.5 rounded border px-1 py-0.5 text-left text-[10px] transition-micro",
                            colors.bg,
                            colors.border,
                            colors.text,
                            "hover:opacity-80 cursor-pointer overflow-hidden"
                          )}
                          style={{ top: `${top}px`, maxHeight: "44px" }}
                        >
                          <span className="block truncate font-medium">{event.title}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Click handler */}
                  <div
                    className="absolute inset-0 cursor-pointer"
                    onClick={() => onDateClick(date)}
                  />
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
