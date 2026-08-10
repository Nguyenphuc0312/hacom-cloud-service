import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TipTapEditor, type TipTapEditorHandle } from "./TipTapEditor";
import { buildMentionMatch } from "./MessageInput/utils";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TipTapEditor", () => {
  it("does not register duplicate link extensions across remounts", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const first = render(<TipTapEditor placeholder="First conversation" />);
    first.unmount();

    render(<TipTapEditor placeholder="Second conversation" />);

    await vi.waitFor(() => {
      expect(
        warnSpy.mock.calls.some(([message]) =>
          String(message).includes("Duplicate extension names found"),
        ),
      ).toBe(false);
    });
  });

  it("reports the caret on plain typing, so the mention panel can open", async () => {
    const onSelectionChange = vi.fn();
    const ref = React.createRef<TipTapEditorHandle>();

    render(<TipTapEditor ref={ref} onSelectionChange={onSelectionChange} />);
    await vi.waitFor(() => expect(ref.current?.getEditor()).toBeTruthy());

    onSelectionChange.mockClear();
    ref.current!.insertAtCursor("liên hệ trực tiếp bạn @");

    await vi.waitFor(() => expect(onSelectionChange).toHaveBeenCalled());
    const [text, caret] = onSelectionChange.mock.calls.at(-1)!;
    expect(text).toBe("liên hệ trực tiếp bạn @");
    expect(caret).toBe(text.length);
  });

  it("keeps the caret aligned with getText() when a chip carries an alias", async () => {
    const onSelectionChange = vi.fn();
    const ref = React.createRef<TipTapEditorHandle>();

    render(<TipTapEditor ref={ref} onSelectionChange={onSelectionChange} />);
    await vi.waitFor(() => expect(ref.current?.getEditor()).toBeTruthy());

    // label (shown) and sendLabel (sent) differ in length — the caret must follow
    // sendLabel, because that is what getText() serialises.
    ref.current!.insertMentionChip(
      { from: 0, to: 0 },
      { id: "u1", label: "Cu", sendLabel: "Nguyễn Minh Quốc" },
    );
    onSelectionChange.mockClear();
    ref.current!.insertAtCursor("@");

    await vi.waitFor(() => expect(onSelectionChange).toHaveBeenCalled());
    const [text, caret] = onSelectionChange.mock.calls.at(-1)!;
    expect(text.endsWith("@")).toBe(true);
    expect(caret).toBe(text.length);
  });

  // Bug 10-08-26: tag gõ tiếng Việt để lại mảnh chữ quanh chip
  // ("@Trần Đăng Công Đăng Công"). `handleMentionSelect` lấy độ dài query từ
  // `mentionMatch` trong state — chụp ở nhịp onSelectionChange TRƯỚC — rồi trừ
  // vào caret hiện tại. IME (Unikey bỏ dấu "Côn"→"Công") commit thêm ký tự sau
  // nhịp đó, nên deleteRange cắt trượt đúng phần chênh. Phép tính đúng là đo
  // lại '@' ngay lúc chèn; đây là bản sao của nó, ba ca cùng phải sạch.
  describe("vị trí xoá khi chèn chip", () => {
    const insertAtRealAt = (
      ref: React.RefObject<TipTapEditorHandle | null>,
      attrs: { id: string; label: string; sendLabel: string },
    ) => {
      const editor = ref.current!.getEditor()!;
      const to = editor.state.selection.anchor;
      const $pos = editor.state.doc.resolve(to);
      const atOffset = $pos.parent
        .textBetween(0, $pos.parentOffset, undefined, " ")
        .lastIndexOf("@");
      if (atOffset < 0) return;
      ref.current!.insertMentionChip({ from: $pos.start() + atOffset, to }, attrs);
    };

    const setup = async () => {
      const ref = React.createRef<TipTapEditorHandle>();
      render(<TipTapEditor ref={ref} />);
      await vi.waitFor(() => expect(ref.current?.getEditor()).toBeTruthy());
      return ref;
    };

    const cong = { id: "u2", label: "Trần Đăng Công", sendLabel: "Trần Đăng Công" };

    it("IME commit thêm ký tự sau khi panel mở", async () => {
      const ref = await setup();
      ref.current!.insertAtCursor("Em báo cáo thầy @Trần Đăng Cô");
      ref.current!.insertAtCursor("ng"); // Unikey ghép dấu ở nhịp sau
      insertAtRealAt(ref, cong);

      expect(ref.current!.getEditor()!.getText()).toBe(
        "Em báo cáo thầy @Trần Đăng Công ",
      );
    });

    it("gõ liền rồi chọn ngay", async () => {
      const ref = await setup();
      ref.current!.insertAtCursor("Em báo cáo thầy @Trần Đăng Công");
      insertAtRealAt(ref, cong);

      expect(ref.current!.getEditor()!.getText()).toBe(
        "Em báo cáo thầy @Trần Đăng Công ",
      );
    });

    it("tag thứ hai khi đã có một chip", async () => {
      const ref = await setup();
      ref.current!.insertMentionChip(
        { from: 0, to: 0 },
        { id: "u1", label: "Huy Hoàng", sendLabel: "Nguyễn Thế Huy Hoàng" },
      );
      ref.current!.insertAtCursor("và @Trần Đăng Công");
      insertAtRealAt(ref, cong);

      expect(ref.current!.getEditor()!.getText()).toBe(
        "@Nguyễn Thế Huy Hoàng và @Trần Đăng Công ",
      );
    });
  });

  // The real report: a multi-line announcement whose first line already holds a
  // mention chip. Typing "@" mid-message did nothing until you pressed space a
  // couple of times, because the reported caret drifted one char per line break
  // and only "accidentally" realigned after extra typing.
  describe("multi-line message with a mention chip", () => {
    const setup = async () => {
      const onSelectionChange = vi.fn<(text: string, caret: number) => void>();
      const ref = React.createRef<TipTapEditorHandle>();
      render(<TipTapEditor ref={ref} onSelectionChange={onSelectionChange} />);
      await vi.waitFor(() => expect(ref.current?.getEditor()).toBeTruthy());
      return { onSelectionChange, ref };
    };

    /** Latest caret report, fed through the real matcher the panel uses. */
    const lastMatch = (
      onSelectionChange: ReturnType<typeof vi.fn>,
    ) => {
      const [text, caret] = onSelectionChange.mock.calls.at(-1)! as [string, number];
      return { text, caret, match: buildMentionMatch(text, caret) };
    };

    /**
     * Each `<p>` is a separate block, which is what pressing Enter produces and
     * what makes getText() emit its block separator. A single paragraph with
     * "\n" inside would not exercise the separator at all.
     */
    const seedParagraphs = (ref: React.RefObject<TipTapEditorHandle | null>, html: string) => {
      ref.current!.getEditor()!.commands.setContent(html, { emitUpdate: false });
    };

    it("opens on the FIRST @ typed mid-message, with no extra spaces", async () => {
      const { onSelectionChange, ref } = await setup();

      seedParagraphs(
        ref,
        [
          '<p>Kính gửi HCNS các Đơn vị <span data-type="mentionChip" data-id="u1" data-label="VPTCT-Nguyễn Minh Quangg"></span> </p>',
          "<p>- Hiện tại đội phát triển phần mềm đã xử lí và phân quyền.</p>",
          "<p>- VP TCT gửi lại hướng dẫn thực hiện bản PDF </p>",
        ].join(""),
      );
      // Caret at the very end of the last paragraph, as if the user clicked there.
      ref.current!.getEditor()!.commands.focus("end");

      onSelectionChange.mockClear();
      ref.current!.insertAtCursor("@");
      await vi.waitFor(() => expect(onSelectionChange).toHaveBeenCalled());

      const { text, caret, match } = lastMatch(onSelectionChange);
      expect(text[caret - 1]).toBe("@"); // caret really sits right after the "@"
      expect(match).not.toBeNull();
      expect(match!.query).toBe("");
    });

    it("keeps the caret exact across every block break", async () => {
      const { onSelectionChange, ref } = await setup();

      seedParagraphs(
        ref,
        "<p>dòng 1</p><p>dòng 2</p><p>dòng 3</p><p>dòng 4</p><p>- liên hệ </p>",
      );
      ref.current!.getEditor()!.commands.focus("end");

      onSelectionChange.mockClear();
      ref.current!.insertAtCursor("@");
      await vi.waitFor(() => expect(onSelectionChange).toHaveBeenCalled());

      const { text, caret } = lastMatch(onSelectionChange);
      // With a "\n" separator this is short by one char per block break, so the
      // caret lands mid-word and the panel stays shut.
      expect(caret).toBe(text.length);
      expect(text.slice(caret - 1)).toBe("@");
    });

    it("still matches while typing a Vietnamese name after a chip", async () => {
      const { onSelectionChange, ref } = await setup();

      seedParagraphs(
        ref,
        [
          '<p>Kính gửi <span data-type="mentionChip" data-id="u1" data-label="VPTCT-Nguyễn Minh Quangg"></span> </p>',
          "<p>liên hệ </p>",
        ].join(""),
      );
      ref.current!.getEditor()!.commands.focus("end");

      onSelectionChange.mockClear();
      ref.current!.insertAtCursor("@Quố");
      await vi.waitFor(() => expect(onSelectionChange).toHaveBeenCalled());

      const { match } = lastMatch(onSelectionChange);
      expect(match?.query).toBe("Quố");
    });
  });
});
