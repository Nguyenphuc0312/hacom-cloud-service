/**
 * Khớp tên danh bạ dùng chung cho tab "Bạn bè" và tab "Khám phá".
 *
 * Lý do tồn tại: hai tab trước đây khớp khác nhau. Tab Bạn bè lọc client-side
 * bằng `includes()` có dấu; tab Khám phá nhận thẳng kết quả `/users/search` —
 * mà endpoint đó khớp gần đúng bằng trigram, nên gõ "chiến" ra cả "Trần Chung",
 * "Nguyễn Thị Nhung", "Bùi Văn Đức" (similarity('nhung','hung') = 0.375).
 *
 * Ngưỡng phía BE đã siết lên 0.5 (user-directory.service.ts). Lớp lọc này vẫn
 * giữ để hai tab khớp CÙNG một luật và để UI không phụ thuộc ngưỡng của BE.
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

const normalizeQuery = (query: string): string =>
  normalizeSearchText(query).replace(/^@+/, "");

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
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return true;

  const haystack = fields
    .map((field) => normalizeSearchText(field))
    .filter(Boolean)
    .join(" ");
  if (!haystack) return false;

  return normalizedQuery.split(/\s+/).every((term) => haystack.includes(term));
};

/**
 * Xếp hạng các kết quả khớp có chủ đích. Không dùng subsequence vì kiểu khớp
 * đó khiến một mã nhân viên hoặc vài ký tự ngắn kéo theo hàng loạt kết quả sai.
 */
export const scoreSearchMatch = (
  query: string,
  fields: Array<string | null | undefined>,
): number => {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return 0;

  const normalizedFields = fields
    .map((field) => normalizeSearchText(field))
    .filter(Boolean);
  if (!normalizedFields.length) return -1;

  if (normalizedFields.some((field) => field === normalizedQuery)) return 100;
  if (normalizedFields.some((field) => field.startsWith(normalizedQuery)))
    return 80;
  if (
    normalizedFields.some((field) =>
      field.split(/\s+/).some((word) => word.startsWith(normalizedQuery)),
    )
  ) {
    return 65;
  }
  if (normalizedFields.some((field) => field.includes(normalizedQuery)))
    return 50;

  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  const haystack = normalizedFields.join(" ");
  return terms.every((term) => haystack.includes(term)) ? 35 : -1;
};
