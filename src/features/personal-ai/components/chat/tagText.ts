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
 * Độ dài tên lệnh DÀI NHẤT khớp phần đầu của `candidate`; 0 nếu không lệnh nào
 * khớp.
 *
 * Khớp theo TIỀN TỐ chứ không đòi khớp trọn cụm: gõ lỡ một ký tự sau tag
 * (`#congviectuan` → `#congviectuana`) thì tag vẫn giữ chip và chỉ ký tự thừa
 * là chữ thường. Nếu đòi khớp trọn, cả chip biến mất chỉ vì một phím — nhìn như
 * tag hỏng hẳn.
 *
 * Lấy DÀI NHẤT để khi có hai lệnh cùng tiền tố thì không cắt nhầm cái ngắn.
 * So khớp không phân biệt hoa thường vì BE nhận `#TBP_baocao` lẫn `#tbp_baocao`.
 */
function matchedTagLength(candidate: string, tags: readonly string[]): number {
  const lower = candidate.toLowerCase();
  let best = 0;
  for (const t of tags) {
    const tl = t.toLowerCase();
    if (tl.length > best && lower.startsWith(tl)) best = tl.length;
  }
  return best;
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
    const len = matchedTagLength(m[0], tags);
    if (len === 0) continue;
    if (start > last) push(text.slice(last, start), false);
    // Chỉ phần đúng tên lệnh vào chip; ký tự gõ thừa phía sau là chữ thường.
    push(m[0].slice(0, len), true);
    last = start + len;
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
  if (!m) return null;
  // Phải đứng ngay sau ĐÚNG tên lệnh. Có ký tự gõ thừa phía sau (`#congviectuana`)
  // thì Backspace xoá từng ký tự như thường — xoá trọn cả cụm là xoá oan.
  const lower = m[0].toLowerCase();
  if (!tags.some((t) => t.toLowerCase() === lower)) return null;
  return { start: caret - m[0].length };
}
