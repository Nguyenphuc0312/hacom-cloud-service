/**
 * @fileoverview Dò 1 người trong kết quả tìm kiếm danh bạ theo TÊN CHÍNH XÁC.
 *
 * Dùng cho lịch họp CŨ (tạo trước khi BE lưu `meetingChairmanRef`): chủ trì chỉ
 * còn lại cái tên trơn trong metadata, không có authUserId nào để tra avatar.
 * Dò theo tên là phương án chót — nên quy tắc phải chặt: khớp ĐÚNG 1 người mới
 * nhận. Trùng tên (công ty rất hay có) mà đoán bừa thì modal hiện nhầm mặt người
 * khác — sai nghiêm trọng hơn hẳn việc để avatar chữ cái đầu.
 */

/** Chỉ cần đúng phần định danh + tên — nhận cả ChatSearchUser lẫn shape rút gọn. */
export interface NameMatchCandidate {
  id: string;
  fullName?: string | null;
  displayName?: string | null;
}

const normalize = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase();

/**
 * Trả về userId khi và chỉ khi đúng MỘT người (theo id) khớp chính xác `name`.
 * Không ai khớp, hoặc từ hai người trở lên → `null` (chịu thua, để fallback).
 */
export const pickUniqueUserIdByName = (
  users: readonly NameMatchCandidate[],
  name: string,
): string | null => {
  const key = normalize(name);
  if (!key) return null;

  const matched = users.filter((u) =>
    [u.fullName, u.displayName].some((candidate) => normalize(candidate) === key),
  );
  // Cùng một người có thể xuất hiện 2 hàng (khớp cả fullName lẫn displayName) —
  // gom theo id trước khi kết luận "trùng tên", nếu không sẽ tự loại oan.
  const uniqueIds = new Set(matched.map((u) => u.id));
  return uniqueIds.size === 1 ? [...uniqueIds][0] : null;
};
