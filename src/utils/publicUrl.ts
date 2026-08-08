/**
 * @fileoverview Kiểm tra URL có để **máy chủ bên ngoài** tải được không.
 *
 * Dùng cho Microsoft Office Online viewer: Microsoft tự tải file từ server của
 * họ, nên URL trỏ về localhost / mạng nội bộ sẽ ra trang trắng. Tách riêng khỏi
 * component để test được và không kéo React vào.
 */

/**
 * URL có khả năng cho máy chủ ngoài internet tải được không: phải là http(s)
 * tuyệt đối và không trỏ về máy cục bộ / dải IP nội bộ.
 *
 * Lưu ý: đây chỉ là sàng lọc phía client. URL công khai vẫn có thể hỏng vì
 * tường lửa hay quyền truy cập — nên phía gọi vẫn cần đường dự phòng.
 */
export function isPubliclyFetchableUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "0.0.0.0" ||
      host.endsWith(".local") ||
      host.endsWith(".localhost")
    ) {
      return false;
    }

    // Dải IP nội bộ (RFC1918) + loopback: máy chủ ngoài internet không với tới.
    if (
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
