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

export interface TagSegment {
  text: string;
  isTag: boolean;
}

/** Ứng viên tag ở dạng thô — lọc lại bằng danh sách lệnh có thật. */
const TAG_CANDIDATE_RE = /#[A-Za-z0-9_]+/g;

/**
 * Tag khớp ĐÚNG một lệnh có thật thì mới tô.
 *
 * Không tô mọi chuỗi bắt đầu bằng `#`: gõ thêm chữ sau tag (`#congviectuan` →
 * `#congviectuanad`) thì phần thừa cũng bị nuốt vào chip, nhìn như tag hợp lệ
 * trong khi BE sẽ không hiểu. Chỉ tô khi đúng tên lệnh, người gõ nhìn màu là
 * biết mình gõ đúng hay sai.
 *
 * So khớp không phân biệt hoa thường vì BE nhận `#TBP_baocao` lẫn `#tbp_baocao`.
 */
function matchExactTag(candidate: string, tags: readonly string[]): boolean {
  const lower = candidate.toLowerCase();
  return tags.some((t) => t.toLowerCase() === lower);
}

/**
 * Cắt chuỗi thành đoạn thường + đoạn tag để lớp phủ tô màu.
 *
 * Ghép lại các `text` theo thứ tự luôn ra đúng chuỗi gốc — lớp phủ phải khớp
 * từng ký tự với textarea nằm đè lên, thiếu hay thừa một ký tự là lệch chữ.
 *
 * `tags` rỗng → không tô gì (chưa tải xong quyền thì đừng tô bừa).
 */
export function splitTagSegments(
  text: string,
  tags: readonly string[],
): TagSegment[] {
  const out: TagSegment[] = [];
  let last = 0;

  const push = (t: string, isTag: boolean) => {
    if (!t) return;
    const prev = out[out.length - 1];
    // Gộp đoạn thường liền nhau để lớp phủ ít node hơn.
    if (prev && !prev.isTag && !isTag) prev.text += t;
    else out.push({ text: t, isTag });
  };

  for (const m of text.matchAll(TAG_CANDIDATE_RE)) {
    const start = m.index ?? 0;
    if (!matchExactTag(m[0], tags)) continue;
    if (start > last) push(text.slice(last, start), false);
    push(m[0], true);
    last = start + m[0].length;
  }
  if (last < text.length) push(text.slice(last), false);
  return out;
}

/**
 * Tag đứng NGAY TRƯỚC con trỏ, trả vị trí bắt đầu của nó để Backspace xóa trọn
 * một nhát như chip `@`. `null` khi không có tag hoàn chỉnh ở đó — lúc đó cứ để
 * Backspace chạy mặc định (gõ dở `#congvie` vẫn xóa từng ký tự như thường).
 */
export function tagBeforeCursor(
  value: string,
  caret: number,
  tags: readonly string[],
): { start: number } | null {
  const m = value.slice(0, caret).match(/#[A-Za-z0-9_]+$/);
  if (!m || !matchExactTag(m[0], tags)) return null;
  return { start: caret - m[0].length };
}
