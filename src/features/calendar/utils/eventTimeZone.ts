/**
 * @fileoverview Đọc ngày/giờ của một sự kiện lịch theo ĐÚNG múi giờ của sự kiện
 * đó, không theo múi giờ của máy đang mở app.
 *
 * Vì sao cần: `Date#getHours()` / `getFullYear()` luôn trả về giờ TƯỜNG của máy.
 * Một cuộc họp 08:00 giờ VN mở trên máy đặt UTC sẽ hiện 01:00, mở ở New York sẽ
 * hiện 21:00 hôm trước — sai cả giờ lẫn NGÀY. Trước đây không ai thấy vì máy dev
 * đều ở +07, nên giờ máy tình cờ trùng giờ nghiệp vụ.
 *
 * Nguồn sự thật là `HRCalendarEvent.timezone` (bắt buộc; hr-api-service mặc định
 * 'Asia/Ho_Chi_Minh'), nên lịch đọc giống nhau ở mọi nơi trên thế giới.
 */

/** Múi giờ nghiệp vụ mặc định khi sự kiện không kèm timezone. */
export const DEFAULT_EVENT_TIME_ZONE = "Asia/Ho_Chi_Minh";

/**
 * IANA zone không hợp lệ (dữ liệu cũ/hỏng) sẽ làm `Intl` ném lỗi và đánh sập cả
 * màn lịch. Kiểm tra một lần rồi nhớ kết quả — `Intl.DateTimeFormat` khá đắt.
 */
const zoneValidity = new Map<string, boolean>();

const isValidTimeZone = (timeZone: string): boolean => {
  const cached = zoneValidity.get(timeZone);
  if (cached !== undefined) return cached;

  let valid = true;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    valid = false;
  }
  zoneValidity.set(timeZone, valid);
  return valid;
};

export const resolveEventTimeZone = (
  timeZone: string | null | undefined,
): string => {
  const normalized = timeZone?.trim();
  if (!normalized || !isValidTimeZone(normalized)) {
    return DEFAULT_EVENT_TIME_ZONE;
  }
  return normalized;
};

const partsCache = new Map<string, Intl.DateTimeFormat>();

const getFormatter = (timeZone: string): Intl.DateTimeFormat => {
  const cached = partsCache.get(timeZone);
  if (cached) return cached;

  // en-CA + `formatToParts` cho ra số 2 chữ số ổn định, không phụ thuộc locale
  // hiển thị của người dùng. `hourCycle: "h23"` để 00:00 không thành 24:00.
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  partsCache.set(timeZone, formatter);
  return formatter;
};

export interface EventWallClock {
  /**
   * YYYY-MM-DD theo múi giờ sự kiện.
   *
   * ⚠️ Đây là giá trị KỸ THUẬT, không phải chuỗi hiển thị: `<input type="date">`
   * bắt buộc dùng đúng định dạng này. Mọi chỗ hiện ra cho người dùng vẫn phải là
   * **dd/mm/yyyy** — dùng `formatEventDateVi` bên dưới, đừng in thẳng field này.
   */
  date: string;
  /** HH:mm (24h) theo múi giờ sự kiện. */
  time: string;
}

/**
 * Đổi `YYYY-MM-DD` (giá trị kỹ thuật) sang **dd/mm/yyyy** để hiển thị.
 * Giữ nguyên chuỗi vào nếu không đúng dạng, để không nuốt mất dữ liệu lạ.
 */
export const formatEventDateVi = (isoDate: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
};

/**
 * Đổi một mốc tuyệt đối (ISO/UTC từ API) thành ngày+giờ tường theo `timeZone`.
 * Trả `null` khi ISO hỏng để nơi gọi tự quyết định hiển thị gì.
 */
export const getEventWallClock = (
  iso: string | null | undefined,
  timeZone: string | null | undefined,
): EventWallClock | null => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const parts = getFormatter(resolveEventTimeZone(timeZone)).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  const year = pick("year");
  const month = pick("month");
  const day = pick("day");
  const hour = pick("hour");
  const minute = pick("minute");

  if (!year || !month || !day || !hour || !minute) return null;

  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
};
