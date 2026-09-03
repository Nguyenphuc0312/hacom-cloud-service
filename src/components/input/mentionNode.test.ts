import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { MentionChip, collectMentionRanges } from "./mentionNode";
import type { JSONContent } from "@tiptap/core";

// The one invariant that must never break: a mention chip must serialise back to
// "@label" in getText(), because that plain text is what the send pipeline and
// extractMentionDetails resolve to a userId. If this drifts, tags silently stop
// resolving.
describe("MentionChip", () => {
  const makeEditor = () =>
    new Editor({
      extensions: [Document, Paragraph, Text, MentionChip],
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "hi " },
              {
                type: MentionChip.name,
                attrs: { id: "u1", label: "Đậu Cao Minh Nhật" },
              },
              { type: "text", text: " ok" },
            ],
          },
        ],
      },
    });

  it("serialises to plain @label in getText()", () => {
    const editor = makeEditor();
    expect(editor.getText()).toBe("hi @Đậu Cao Minh Nhật ok");
    editor.destroy();
  });

  // Đây là bất biến giữ cho "tên gợi nhớ" không lọt ra ngoài: ô nhập hiện nhãn
  // riêng của người gõ, nhưng chữ GỬI ĐI phải là tên chung cả nhóm cùng đọc.
  it("gửi đi sendLabel (tên chung), không phải label đang hiện (alias)", () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, MentionChip],
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: MentionChip.name,
                attrs: {
                  id: "u1",
                  label: "Sếp deadline",
                  sendLabel: "Nguyễn Minh Quang",
                },
              },
              { type: "text", text: " ơi" },
            ],
          },
        ],
      },
    });
    expect(editor.getText()).toBe("@Nguyễn Minh Quang ơi");
    editor.destroy();
  });

  // Chốt chặn quyền riêng tư: alias CHỈ được nằm trong `label` (hiển thị tại
  // máy người gõ). Mọi thứ đi ra ngoài — hôm nay là getText() — phải là
  // `sendLabel`. Nếu sau này có ai dùng getJSON()/getHTML() làm nguồn để GỬI,
  // phải strip `label` trước, không thì nhãn riêng lọt cho cả nhóm đọc.
  it("alias không rò qua getText() — đường duy nhất đang dùng để gửi", () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, MentionChip],
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: MentionChip.name,
                attrs: {
                  id: "u1",
                  label: "Sếp deadline",
                  sendLabel: "Nguyễn Minh Quang",
                },
              },
            ],
          },
        ],
      },
    });

    expect(editor.getText()).not.toContain("Sếp deadline");
    expect(editor.getText()).toContain("Nguyễn Minh Quang");
    editor.destroy();
  });

  it("serialises the @all variant to @all (bubble renderer matches this token)", () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, MentionChip],
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: MentionChip.name,
                attrs: { id: "all", label: "all", variant: "all" },
              },
              { type: "text", text: " hi" },
            ],
          },
        ],
      },
    });
    expect(editor.getText()).toBe("@all hi");
    editor.destroy();
  });
});

/**
 * Bất biến DUY NHẤT đáng chặn ở đây: cắt `getText()` theo `offset`/`length` phải
 * ra đúng chữ của chip. Đó chính là phép mà BE validate và mọi client dùng để
 * render — sai là tag cắt lẹm vào chữ bên cạnh.
 *
 * Kiểm bằng cách cắt thật, không so số cứng: số cứng chỉ nói "khác lần trước",
 * còn cắt thật nói "đúng hay sai".
 */
describe("collectMentionRanges", () => {
  const BLOCK_SEPARATOR = "\n\n";

  const withEditor = <T,>(doc: JSONContent, run: (editor: Editor) => T): T => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, MentionChip],
      content: doc,
    });
    try {
      return run(editor);
    } finally {
      editor.destroy();
    }
  };

  /** Cắt theo code point, đúng đơn vị contract đã chốt. */
  const sliceByRange = (
    text: string,
    range: { offset: number; length: number },
  ): string =>
    Array.from(text)
      .slice(range.offset, range.offset + range.length)
      .join("");

  const paragraph = (...content: JSONContent[]): JSONContent => ({
    type: "paragraph",
    content,
  });
  const chip = (id: string, label: string, sendLabel?: string): JSONContent => ({
    type: MentionChip.name,
    attrs: { id, label, ...(sendLabel ? { sendLabel } : {}) },
  });
  const text = (value: string): JSONContent => ({ type: "text", text: value });

  it("range cắt ra đúng chữ của chip", () => {
    withEditor(
      { type: "doc", content: [paragraph(text("hi "), chip("u1", "Đậu Cao Minh Nhật"), text(" ok"))] },
      (editor) => {
        const [range] = collectMentionRanges(editor, BLOCK_SEPARATOR);
        expect(range.userId).toBe("u1");
        expect(sliceByRange(editor.getText(), range)).toBe("@Đậu Cao Minh Nhật");
      },
    );
  });

  it("tag ở đầu tin → offset 0 (không được coi là 'thiếu range')", () => {
    withEditor(
      { type: "doc", content: [paragraph(chip("u1", "Nam"), text(" ơi"))] },
      (editor) => {
        const [range] = collectMentionRanges(editor, BLOCK_SEPARATOR);
        expect(range.offset).toBe(0);
        expect(sliceByRange(editor.getText(), range)).toBe("@Nam");
      },
    );
  });

  it("đo bằng code point: emoji ngoài BMP không đẩy lệch tag đứng sau", () => {
    withEditor(
      { type: "doc", content: [paragraph(text("🎉🎉 "), chip("u1", "Nam"))] },
      (editor) => {
        const [range] = collectMentionRanges(editor, BLOCK_SEPARATOR);
        expect(sliceByRange(editor.getText(), range)).toBe("@Nam");
        // Ăn theo String.length (UTF-16) thì offset thành 5 và cắt lẹm mất '@'.
        expect(range.offset).toBe(3);
      },
    );
  });

  it("nhiều tag, nhiều dòng — mỗi range vẫn cắt đúng chữ của nó", () => {
    withEditor(
      {
        type: "doc",
        content: [
          paragraph(chip("u1", "Nam"), text(" và "), chip("u2", "Bình")),
          paragraph(text("nhắc "), chip("u3", "Huy Hoàng")),
        ],
      },
      (editor) => {
        const ranges = collectMentionRanges(editor, BLOCK_SEPARATOR);
        const content = editor.getText();
        expect(ranges.map((r) => sliceByRange(content, r))).toEqual([
          "@Nam",
          "@Bình",
          "@Huy Hoàng",
        ]);
      },
    );
  });

  it("đo theo sendLabel (tên chung), không theo alias đang hiện", () => {
    withEditor(
      {
        type: "doc",
        content: [paragraph(chip("u1", "Sếp deadline", "Nguyễn Minh Quang"), text(" ơi"))],
      },
      (editor) => {
        const [range] = collectMentionRanges(editor, BLOCK_SEPARATOR);
        // Đo theo alias (dài 12) sẽ cắt lẹm mất "uang" của tên thật.
        expect(sliceByRange(editor.getText(), range)).toBe("@Nguyễn Minh Quang");
      },
    );
  });
});
