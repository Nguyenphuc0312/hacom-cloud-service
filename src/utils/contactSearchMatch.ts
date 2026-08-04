/**
 * Khớp tên danh bạ dùng chung cho tab "Bạn bè" và tab "Khám phá".
 *
 * Lý do tồn tại: hai tab trước đây khớp khác nhau. Tab Bạn bè lọc client-side
 * bằng `includes()` có dấu; tab Khám phá nhận thẳng kết quả `/users/search` —
 * mà endpoint đó khớp bằng `subsequence_match` (LIKE '%c%h%i%ê%n%'), nghĩa là
 * các ký tự chỉ cần đúng THỨ TỰ chứ không cần liền nhau. Với từ khóa tiếng Việt
 * phổ biến, gõ "chiến" ra cả "Trần Chung", "Nguyễn Thị Nhung", "Bùi Văn Đức".
 *
 * Module này là hàm thuần, KHÔNG import store/service — nếu không sẽ tạo import
 * vòng (xem CLAUDE.md mục 13: services → utils → stores → services làm trắng app).
 */

/** Bỏ dấu tiếng Việt + hạ chữ thường. "Chiến" → "chien". */
export const normalizeSearchText = (value: string | null | undefined): string =>
  (value ?? "")
    .normalize("NFD")
    // Bỏ dấu thanh/dấu mũ (combining diacritical marks).
    .replace(/[̀-ͯ]/g, "")
    // đ/Đ không phải tổ hợp dấu nên NFD không tách được, phải map tay.
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .trim();

/**
 * Khớp khi từ khóa là chuỗi con LIỀN NHAU của một trong các trường.
 * Cố ý không dùng subsequence: đó chính là thứ gây nhiễu ở `/users/search`.
 *
 * Từ khóa nhiều chữ ("van duc") khớp theo từng từ, mỗi từ đều phải xuất hiện —
 * để gõ họ + tên vẫn ra đúng người dù thứ tự hiển thị khác.
 */
export const matchesContactQuery = (
  query: string,
  fields: Array<string | null | undefined>,
): boolean => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const haystack = fields
    .map((field) => normalizeSearchText(field))
    .filter(Boolean)
    .join(" ");
  if (!haystack) return false;

  return normalizedQuery
    .split(/\s+/)
    .every((term) => haystack.includes(term));
};
