/**
 * Body từ hr-api là một câu dài kể lại sự việc:
 *   "<Tên> đã từ chối tham gia lịch họp: <Tên lịch> — Lý do: <lý do>"
 * Hiện nguyên câu ở mọi dòng thì danh sách toàn chữ giống nhau, mà TÊN CUỘC HỌP
 * — thứ người ta thực sự tìm — lại nằm lọt giữa câu. Tách ra để dựng lại phân
 * cấp: tên cuộc họp lên tiêu đề, người + trạng thái xuống dưới, lý do tách riêng.
 */

export interface ParsedNotificationBody {
  /** Tên cuộc họp, null khi body không theo mẫu (rơi về title). */
  event: string | null;
  /** Lý do từ chối, chỉ có ở phản hồi DECLINED. */
  reason: string | null;
}

const EVENT_MARKERS = [
  "lịch họp:", // phản hồi / cập nhật / tham gia qua link
  "đã mời bạn tham gia:", // mời họp
  "đã gỡ bạn khỏi:", // gỡ khỏi lịch
];
const REASON_MARKER = " — Lý do:";

export const parseNotificationBody = (
  body: string | null | undefined,
): ParsedNotificationBody => {
  if (!body) return { event: null, reason: null };

  // Lý do có thể chứa dấu "—" nên nối lại phần đuôi thay vì lấy mỗi phần tử [1].
  const [main, ...reasonParts] = body.split(REASON_MARKER);
  const reason = reasonParts.length
    ? reasonParts.join(REASON_MARKER).trim() || null
    : null;

  // hr-api dùng vài cách dẫn khác nhau tuỳ loại thông báo (phản hồi, mời,
  // cập nhật, gỡ, tham gia qua link). Lấy mốc khớp SỚM NHẤT trong câu.
  let event: string | null = null;
  let best = Number.POSITIVE_INFINITY;
  for (const marker of EVENT_MARKERS) {
    const at = main.indexOf(marker);
    if (at >= 0 && at < best) {
      best = at;
      event = main.slice(at + marker.length).trim() || null;
    }
  }

  return { event, reason };
};

/**
 * Ưu tiên payload.eventTitle do hr-api gửi kèm; chỉ cắt chuỗi khi không có.
 * Thông báo CŨ tạo trước khi BE thêm field vẫn hiện đúng nhờ nhánh dự phòng.
 */
export const eventTitleOf = (
  payload: Record<string, unknown> | null | undefined,
  body: string | null | undefined,
): string | null => {
  const fromPayload = payload?.["eventTitle"];
  if (typeof fromPayload === "string" && fromPayload.trim()) {
    return fromPayload.trim();
  }
  return parseNotificationBody(body).event;
};
