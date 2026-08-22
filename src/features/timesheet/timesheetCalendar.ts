/**
 * Lịch tháng của bảng công: thứ trong tuần và vị trí cột.
 *
 * Lưới cũ chỉ in số 1…31 nên không đọc được ngày đó là thứ mấy, mà với bảng
 * công thì "thứ mấy" chính là thứ giải thích vì sao ô này nghỉ, ô kia đủ công.
 * Tách riêng khỏi trang để test được mà không cần dựng cả màn hình.
 */

/** Nhãn thứ theo chỉ số của `Date.getUTCDay()` — 0 là Chủ nhật. */
export const WEEKDAY_LABELS = [
  "CN",
  "T2",
  "T3",
  "T4",
  "T5",
  "T6",
  "T7",
] as const;

/** Thứ tự cột của lưới: tuần bắt đầu từ Thứ 2 như lịch Việt Nam. */
export const WEEK_COLUMNS = [
  "T2",
  "T3",
  "T4",
  "T5",
  "T6",
  "T7",
  "CN",
] as const;

/**
 * Thứ trong tuần của một ngày ISO (`YYYY-MM-DD`), 0 = Chủ nhật.
 *
 * Cắt chuỗi rồi dựng ngày theo UTC: `new Date("2026-08-22")` ở múi giờ âm sẽ
 * lùi về hôm trước và trả sai thứ.
 */
export const weekdayIndex = (date: string): number => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

/** Cột (1–7) của một ngày trong lưới bắt đầu từ Thứ 2. */
export const gridColumnFor = (date: string): number => {
  const weekday = weekdayIndex(date);
  return weekday === 0 ? 7 : weekday;
};

/**
 * Đẩy ô đầu tháng vào đúng cột thứ của nó — chỉ ở lưới 7 cột (`lg`).
 *
 * Viết đủ từng lớp thay vì ghép chuỗi động vì Tailwind quét class theo văn bản
 * tĩnh: `lg:col-start-${n}` sẽ không được sinh ra trong CSS cuối cùng.
 */
export const LG_COLUMN_START: Record<number, string> = {
  2: "lg:col-start-2",
  3: "lg:col-start-3",
  4: "lg:col-start-4",
  5: "lg:col-start-5",
  6: "lg:col-start-6",
  7: "lg:col-start-7",
};

/** Hôm nay dạng `YYYY-MM-DD` theo lịch máy người dùng. */
export const todayIso = (): string => {
  const value = new Date();
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
};
