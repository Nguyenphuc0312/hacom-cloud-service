/**
 * timeline.ts — Helpers dùng chung cho Day/Week View timeline.
 *
 * Cung cấp:
 *  - Trích phút bắt đầu/kết thúc của event theo GIỜ ĐỊA PHƯƠNG (ưu tiên startAt/endAt
 *    ISO; fallback chuỗi "HH:mm"); event không có giờ ⇒ all-day.
 *  - Xếp event trùng giờ vào các cột (overlap layout, tối đa `maxCols` cột).
 *  - Tiện ích tuần (Monday-based) + số tuần ISO.
 *
 * Quy ước thời gian: render ISO (UTC) → local qua `new Date(...).getHours()/getMinutes()`,
 * KHÔNG slice chuỗi (lệch 7h ở VN). Xem APIcalendar.md mục 8.
 */

import type { CalendarEvent, ExtendedCalendarEvent } from "../data/calendarEvents";

export const MINUTES_PER_DAY = 24 * 60;
export const HOURS = Array.from({ length: 24 }, (_, i) => i);

const TIME_RE = /^(\d{1,2}):(\d{2})/;

const sameLocalDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/** Mốc 00:00 local (ms) của một ngày — để so sánh khoảng ngày. */
const localDayStartMs = (d: Date): number =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Date bắt đầu của event (ưu tiên ISO startAt; fallback chuỗi `event.date`). */
const eventStartDate = (event: CalendarEvent): Date | null => {
  const ext = event as ExtendedCalendarEvent;
  const d = ext.startAt ? new Date(ext.startAt) : new Date(`${event.date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Date kết thúc của event (ưu tiên ISO endAt; fallback = ngày bắt đầu). */
const eventEndDate = (event: CalendarEvent): Date | null => {
  const ext = event as ExtendedCalendarEvent;
  if (ext.endAt) {
    const d = new Date(ext.endAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return eventStartDate(event);
};

/**
 * Event có diễn ra (một phần) trong ngày `day` không — hỗ trợ sự kiện nhiều ngày
 * (qua đêm / công tác). Loại trừ trường hợp kết thúc đúng 00:00 của ngày đang xét
 * (thực chất đã hết ở ngày trước).
 */
export const eventOccursOnDay = (event: CalendarEvent, day: Date): boolean => {
  const start = eventStartDate(event);
  if (!start) return false;
  const end = eventEndDate(event) ?? start;
  const dayMs = localDayStartMs(day);
  const startMs = localDayStartMs(start);
  const endMs = localDayStartMs(end);
  if (dayMs === endMs && dayMs > startMs && end.getHours() === 0 && end.getMinutes() === 0) {
    return false;
  }
  return dayMs >= startMs && dayMs <= endMs;
};

/** Event kéo dài qua nhiều ngày local (qua đêm / nhiều ngày liên tiếp). */
export const isMultiDayEvent = (event: CalendarEvent): boolean => {
  const start = eventStartDate(event);
  const end = eventEndDate(event);
  if (!start || !end) return false;
  return localDayStartMs(end) > localDayStartMs(start);
};

/**
 * Phút-từ-nửa-đêm của thời điểm bắt đầu, tính theo ngày `day` (nếu truyền).
 * Trả `null` nếu event là all-day hoặc không xác định được giờ (lễ tĩnh, task theo ngày…).
 * Với event nhiều ngày: các ngày sau ngày bắt đầu ⇒ bắt đầu từ 00:00.
 */
export const getStartMinutes = (event: CalendarEvent, day?: Date): number | null => {
  const ext = event as ExtendedCalendarEvent;
  if (ext.isAllDay) return null;
  if (ext.startAt) {
    const d = new Date(ext.startAt);
    if (!Number.isNaN(d.getTime())) {
      if (day && !sameLocalDay(d, day)) return 0;
      return d.getHours() * 60 + d.getMinutes();
    }
  }
  if (event.time) {
    const m = TIME_RE.exec(event.time);
    if (m) {
      const h = Number(m[1]);
      const min = Number(m[2]);
      if (h >= 0 && h < 24 && min >= 0 && min < 60) return h * 60 + min;
    }
  }
  return null;
};

/**
 * Phút-từ-nửa-đêm của thời điểm kết thúc, clamp trong ngày `day` (nếu truyền).
 * Mặc định +60 phút khi không có endAt. Với event nhiều ngày: ngày kết thúc dùng
 * giờ kết thúc thật; các ngày trước đó ⇒ hết ngày (24:00).
 */
export const getEndMinutes = (event: CalendarEvent, startMin: number, day?: Date): number => {
  const ext = event as ExtendedCalendarEvent;
  if (ext.startAt && ext.endAt) {
    const start = new Date(ext.startAt);
    const end = new Date(ext.endAt);
    if (!Number.isNaN(end.getTime())) {
      if (day) {
        if (sameLocalDay(end, day)) {
          const m = end.getHours() * 60 + end.getMinutes();
          return Math.min(Math.max(m, startMin), MINUTES_PER_DAY);
        }
        return MINUTES_PER_DAY;
      }
      if (!sameLocalDay(start, end) && end > start) return MINUTES_PER_DAY;
      const m = end.getHours() * 60 + end.getMinutes();
      if (m > startMin) return Math.min(m, MINUTES_PER_DAY);
    }
  }
  return Math.min(startMin + 60, MINUTES_PER_DAY);
};

export interface PositionedEvent {
  event: CalendarEvent;
  startMin: number;
  endMin: number;
  /** Cột hiển thị (0-based), đã clamp theo maxCols. */
  col: number;
  /** Tổng số cột hiển thị của cụm, đã clamp theo maxCols. */
  colCount: number;
}

export interface DayLayout {
  /** Event có giờ, đã xếp cột overlap. */
  timed: PositionedEvent[];
  /** Event all-day / không có giờ. */
  allDay: CalendarEvent[];
}

interface RawItem {
  event: CalendarEvent;
  startMin: number;
  endMin: number;
}

/**
 * Xếp danh sách event của MỘT ngày thành các cột overlap.
 * Thuật toán: gom thành cụm (cluster) các event nối nhau qua trùng giờ, trong mỗi
 * cụm gán cột tham lam (greedy). `maxCols` giới hạn số cột hiển thị (Teams = 3).
 */
export const layoutDayEvents = (
  events: CalendarEvent[],
  maxCols = 3,
  day?: Date,
): DayLayout => {
  const allDay: CalendarEvent[] = [];
  const raw: RawItem[] = [];

  for (const event of events) {
    const startMin = getStartMinutes(event, day);
    if (startMin === null) {
      allDay.push(event);
      continue;
    }
    raw.push({ event, startMin, endMin: getEndMinutes(event, startMin, day) });
  }

  raw.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const timed: PositionedEvent[] = [];
  let cluster: RawItem[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (cluster.length === 0) return;
    const colEnds: number[] = []; // phút kết thúc của event cuối ở mỗi cột
    const assigned: Array<{ item: RawItem; col: number }> = [];
    for (const item of cluster) {
      let placed = false;
      for (let c = 0; c < colEnds.length; c++) {
        if (colEnds[c] <= item.startMin) {
          colEnds[c] = item.endMin;
          assigned.push({ item, col: c });
          placed = true;
          break;
        }
      }
      if (!placed) {
        colEnds.push(item.endMin);
        assigned.push({ item, col: colEnds.length - 1 });
      }
    }
    const colCount = Math.min(colEnds.length, maxCols);
    for (const { item, col } of assigned) {
      timed.push({
        event: item.event,
        startMin: item.startMin,
        endMin: item.endMin,
        col: Math.min(col, maxCols - 1),
        colCount,
      });
    }
    cluster = [];
  };

  for (const item of raw) {
    if (cluster.length > 0 && item.startMin >= clusterEnd) {
      flush();
      clusterEnd = -1;
    }
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.endMin);
  }
  flush();

  return { timed, allDay };
};

/** Thứ Hai (00:00 local) của tuần chứa `date`. */
export const startOfWeekMonday = (date: Date): Date => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0=CN..6=T7
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
};

/** 7 ngày T2→CN của tuần chứa `date`. */
export const getWeekDays = (date: Date): Date[] => {
  const monday = startOfWeekMonday(date);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
};

/** Số tuần theo chuẩn ISO-8601. */
export const getIsoWeekNumber = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // CN=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // về thứ Năm trong tuần
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
};

/** Phút hiện tại tính từ nửa đêm local. */
export const nowMinutes = (): number => {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
};
