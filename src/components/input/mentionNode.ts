import { Node, mergeAttributes } from "@tiptap/core";
import type { Editor } from "@tiptap/core";

/**
 * Atomic inline "@mention" chip for the composer (Zalo-style blue pill).
 *
 * **Hai nhãn, hai việc khác nhau — đừng gộp lại:**
 * - `label` = chữ NGƯỜI GÕ NHÌN THẤY. Là "tên gợi nhớ" của họ khi có đặt, nên ô
 *   nhập đọc giống hệt bong bóng chat sau khi gửi.
 * - `sendLabel` = chữ THỰC SỰ GỬI ĐI (tên chung cả nhóm cùng thấy). `renderText`
 *   trả về cái này, nên `editor.getText()` — nguồn truth cho send / draft /
 *   extractMentionDetails — không hề đổi so với trước.
 *
 * Tách ra là bắt buộc: gộp làm một thì hoặc ô nhập hiện tên thật (lệch với bong
 * bóng chat), hoặc nhãn riêng tư của người gõ lọt vào nội dung cả nhóm đọc được.
 * Không đặt alias → `sendLabel` bằng `label`, y như cũ.
 *
 * atom+inline+selectable means the cursor treats it as one unit: arrow keys step
 * over it and Backspace removes the whole chip, never half a name.
 */
export interface MentionChipAttrs {
  id: string;
  label: string;
  /** Chữ ghi vào nội dung tin nhắn. Thiếu thì dùng `label`. */
  sendLabel?: string;
}

export const MentionChip = Node.create({
  name: "mentionChip",
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      id: { default: null },
      label: { default: "" },
      // Rỗng = không có alias → gửi đúng `label`.
      sendLabel: { default: "" },
      // "@all" gets an amber pill (matches the sent-bubble styling); a real user
      // gets the blue pill.
      variant: { default: "user" },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-mention-chip]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const isAll = node.attrs.variant === "all";
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-mention-chip": "",
        "data-mention-id": node.attrs.id ?? "",
        // Rounded pill. Inline styles + a class so it renders even outside the
        // composer's Tailwind scope (e.g. copied HTML).
        class: isAll
          ? "composer-mention-chip composer-mention-chip--all"
          : "composer-mention-chip",
      }),
      `@${node.attrs.label}`,
    ];
  },

  // What editor.getText() emits for this node — MUST match the typed form so the
  // send pipeline and extractMentionDetails resolve it unchanged. Đây là chữ đi
  // vào tin nhắn, nên luôn là tên chung, KHÔNG BAO GIỜ là alias riêng.
  renderText({ node }) {
    return `@${node.attrs.sendLabel || node.attrs.label}`;
  },
});

/** Chữ một chip đóng góp vào `getText()`. Một nguồn duy nhất cho cả `renderText`
 *  lẫn phép đo offset — hai chỗ này lệch nhau là offset trỏ sai. */
const chipText = (attrs: { sendLabel?: string; label?: string }): string =>
  `@${attrs.sendLabel || attrs.label || ""}`;

export interface MentionRange {
  userId: string;
  /** Code point, gồm cả '@'. */
  offset: number;
  length: number;
}

/**
 * Vị trí từng chip trong chuỗi mà `editor.getText()` trả về.
 *
 * Contract: `FE__mention-structured-ranges__contract__30-07-26` — đơn vị **code
 * point**, tính cả '@'. Đo bằng chính `blockSeparator` + `leafText` mà `getText()`
 * dùng; sai một trong hai là mọi tag đứng sau trỏ lệch.
 *
 * Vì sao dùng cái này thay vì dò tên: editor biết chắc chip nằm đâu và trỏ tới ai,
 * không phải đoán ngược từ chữ — nên trùng tên, đổi tên, alias đều không phá được.
 */
export const collectMentionRanges = (
  editor: Editor,
  blockSeparator: string,
): MentionRange[] => {
  const ranges: MentionRange[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== MentionChip.name || !node.attrs.id) return;
    const before = editor.state.doc.textBetween(0, pos, blockSeparator, (leaf) =>
      leaf.type.name === MentionChip.name ? chipText(leaf.attrs) : "",
    );
    ranges.push({
      userId: String(node.attrs.id),
      // Array.from đếm code point. `String.length` là UTF-16 nên emoji ngoài BMP
      // tính 2 và đẩy lệch mọi tag phía sau.
      offset: Array.from(before).length,
      length: Array.from(chipText(node.attrs)).length,
    });
  });
  return ranges;
};
