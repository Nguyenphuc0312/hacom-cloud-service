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

const EVENT_MARKER = "lịch họp:";
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

  const at = main.indexOf(EVENT_MARKER);
  const event =
    at >= 0 ? main.slice(at + EVENT_MARKER.length).trim() || null : null;

  return { event, reason };
};
