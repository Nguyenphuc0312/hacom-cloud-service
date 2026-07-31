/**
 * Xử lý tag lệnh (`#congviectuan`, `#TBP_baocao`…) trong ô nhập của AI cá nhân.
 *
 * Ô nhập là `<textarea>` thuần, không phải Tiptap như composer chat, nên tag
 * không thể là atomic node. Hai hàm ở đây bù lại phần thiếu: tô màu tag bằng
 * một lớp phủ vẽ song song, và cho Backspace xóa trọn tag như chip `@`.
 *
 * Tách khỏi component để test được mà không dính
 * `react-refresh/only-export-components`.
 */

/**
 * Khớp cả tag chưa gõ xong (`#`, `#congvie`) để chữ đang gõ cũng lên màu ngay,
 * không nhảy màu lúc gõ xong ký tự cuối.
 */
const TAG_RE = /#[\w]*/g;

export interface TagSegment {
  text: string;
  isTag: boolean;
}

/**
 * Cắt chuỗi thành đoạn thường + đoạn tag để lớp phủ tô màu.
 *
 * Ghép lại các `text` theo thứ tự luôn ra đúng chuỗi gốc — lớp phủ phải khớp
 * từng ký tự với textarea nằm đè lên, thiếu hay thừa một ký tự là lệch chữ.
 */
export function splitTagSegments(text: string): TagSegment[] {
  const out: TagSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(TAG_RE)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ text: text.slice(last, start), isTag: false });
    out.push({ text: m[0], isTag: true });
    last = start + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), isTag: false });
  return out;
}

/**
 * Tag đứng NGAY TRƯỚC con trỏ, trả về vị trí bắt đầu của nó để xóa trọn một
 * nhát. `null` khi không có gì để xóa nguyên khối — lúc đó cứ để Backspace chạy
 * mặc định.
 *
 * Riêng `#` trơ trọi (dài 1) trả `null`: xóa nó là hành vi bình thường của một
 * ký tự, không cần can thiệp.
 */
export function tagBeforeCursor(
  value: string,
  caret: number,
): { start: number } | null {
  const m = value.slice(0, caret).match(/#[\w]*$/);
  if (!m || m[0].length <= 1) return null;
  return { start: caret - m[0].length };
}
