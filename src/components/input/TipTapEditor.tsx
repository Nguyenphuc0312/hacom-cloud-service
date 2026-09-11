import React from "react";
import clsx from "clsx";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import type { Editor } from "@tiptap/react";
import { MentionChip, collectMentionRanges } from "./mentionNode";

/**
 * How TipTap's `getText()` joins block nodes. Any offset computed with
 * `textBetween` must pass this same value, otherwise the two disagree by one
 * character per line break.
 */
export const GET_TEXT_BLOCK_SEPARATOR = "\n\n";

type ClipboardFileItem = Pick<
  DataTransferItem,
  "getAsFile" | "kind" | "type"
>;

export interface ClipboardFileSelection {
  files: File[];
  unnamedNonImageFileCount: number;
}

/**
 * Clipboard files use the same queue path as picker/drop files. Screenshots
 * often have no filename, so images receive a safe generated name. Other
 * unnamed files are rejected rather than inventing an extension/type pair.
 */
export const collectClipboardFiles = (
  items: Iterable<ClipboardFileItem>,
): ClipboardFileSelection => {
  const files: File[] = [];
  let unnamedNonImageFileCount = 0;

  for (const item of items) {
    if (item.kind !== "file") continue;

    const raw = item.getAsFile();
    if (!raw) continue;

    const isImage =
      raw.type.startsWith("image/") || item.type.startsWith("image/");
    if (!raw.name && !isImage) {
      unnamedNonImageFileCount += 1;
      continue;
    }

    files.push(
      raw.name
        ? raw
        : new File([raw], `pasted-image-${Date.now()}.png`, {
            type: raw.type || "image/png",
          }),
    );
  }

  return { files, unnamedNonImageFileCount };
};

export interface TipTapEditorHandle {
  getHTML: () => string;
  getJSON: () => object;
  getText: () => string;
  isEmpty: () => boolean;
  clearContent: () => void;
  /** Replace the whole document without stealing focus (used to seed drafts). */
  setContent: (text: string) => void;
  focus: (options?: { scrollIntoView?: boolean }) => void;
  insertAtCursor: (text: string) => void;
  /**
   * Replace the `@query` range (from..to) with a blue mention chip + trailing
   * space. `label` là chữ hiển thị trong ô nhập (có thể là "tên gợi nhớ" riêng),
   * `sendLabel` là chữ đi vào getText() → gửi lên server. Thiếu `sendLabel` thì
   * dùng `label`, y như trước.
   */
  insertMentionChip: (
    range: { from: number; to: number },
    attrs: {
      id: string;
      label: string;
      sendLabel?: string;
      variant?: "user" | "all";
    },
  ) => void;
  /** Ids of every mention chip currently in the document (to hide already-tagged
   *  people from the suggestion list, Zalo-style). */
  getMentionedIds: () => string[];
  /**
   * Vị trí từng chip trong chuỗi `getText()` sẽ trả về — đơn vị **code point**,
   * tính cả ký tự '@' (contract `FE__mention-structured-ranges__contract__30-07-26`).
   *
   * Đây là đường DUY NHẤT lấy được vị trí chắc chắn: editor biết chính xác chip
   * nằm đâu, không phải dò tên ngược trong chữ như trước.
   */
  getMentionRanges: () => {
    userId: string;
    offset: number;
    length: number;
  }[];
  getEditor: () => Editor | null;
}

interface TipTapEditorProps {
  initialContent?: string;
  placeholder?: string;
  disabled?: boolean;
  onContentChange?: (plainText: string) => void;
  onEnterPress?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onEditorReady?: (editor: Editor) => void;
  onSelectionChange?: (text: string, caretOffset: number) => void;
  /** Return true to intercept the key (prevents TipTap's default handling). */
  onInterceptKeydown?: (event: KeyboardEvent) => boolean;
  /** Called when supported clipboard files should enter the attachment queue. */
  onPasteFiles?: (files: File[]) => void;
  /** Called when a clipboard file lacks a safe filename/type pair. */
  onPasteFilesRejected?: (count: number) => void;
  className?: string;
  "data-testid"?: string;
}



export const TipTapEditor = React.forwardRef<TipTapEditorHandle, TipTapEditorProps>(
  (
    {
      initialContent = "",
      placeholder = "",
      disabled = false,
      onContentChange,
      onEnterPress,
      onFocus,
      onBlur,
      onEditorReady,
      onSelectionChange,
      onInterceptKeydown,
      onPasteFiles,
      onPasteFilesRejected,
      className,
      "data-testid": testId,
    },
    ref,
  ) => {
    const onEnterPressRef = React.useRef(onEnterPress);
    const onInterceptKeydownRef = React.useRef(onInterceptKeydown);
    const onSelectionChangeRef = React.useRef(onSelectionChange);
    const onPasteFilesRef = React.useRef(onPasteFiles);
    const onPasteFilesRejectedRef = React.useRef(onPasteFilesRejected);
    // Ref keeps latest placeholder without re-creating extensions on every change.
    const placeholderRef = React.useRef(placeholder);

    React.useLayoutEffect(() => {
      onEnterPressRef.current = onEnterPress;
      onInterceptKeydownRef.current = onInterceptKeydown;
      onSelectionChangeRef.current = onSelectionChange;
      onPasteFilesRef.current = onPasteFiles;
      onPasteFilesRejectedRef.current = onPasteFilesRejected;
      placeholderRef.current = placeholder;
    });

    const allExtensions = React.useMemo(
      () => [
        StarterKit.configure({
          hardBreak: {
            keepMarks: true,
          },
          link: false,
        }),
        Placeholder.configure({
          // Function form reads from ref so decoration always shows current text
          // without needing to recreate the editor instance on each prop change.
          placeholder: () => placeholderRef.current,
          emptyEditorClass: "is-editor-empty",
          showOnlyWhenEditable: false,
        }),
        Link.configure({
          autolink: true,
          linkOnPaste: true,
          openOnClick: false,
          protocols: ["http", "https"],
        }),
        TextStyle,
        Color,
        MentionChip,
      ],
      [], // stable — placeholder is read via ref, not captured in closure
    );

    // Plain-text caret offset into getText(). Both arguments below must mirror how
    // getText() serialises the doc, or the offset drifts and buildMentionMatch
    // silently misses:
    //  - blockSeparator: getText() joins blocks with "\n\n". Passing "\n" loses one
    //    char PER LINE, so in a multi-line message the caret lands mid-word and the
    //    mention panel only opens after typing extra spaces that happen to realign it.
    //  - leafText: must match renderText in mentionNode.ts, i.e. `sendLabel || label`.
    //    A chip is one ProseMirror position but many characters of text, and with an
    //    alias label/sendLabel differ in length.
    //  - hardBreak: Shift+Enter chèn <br> NẰM TRONG cùng một <p>, nên nó không
    //    phải ranh giới block và `blockSeparator` không áp dụng. `getText()` vẫn
    //    serialise nó thành "\n", còn `textBetween` mặc định đếm 0 → caret thiếu
    //    đúng 1 ký tự cho MỖI lần Shift+Enter. Hệ quả: gõ "@" ở dòng thứ hai trở
    //    đi thì caret trỏ lệch, `buildMentionMatch` không thấy '@' và panel tag
    //    KHÔNG BAO GIỜ bung. Kiểm chứng 13-08-26: "k1 dòng một\ndòng hai@" dài 21
    //    nhưng caret báo 20, ký tự tại caret-1 là "i" thay vì "@".
    const emitSelection = React.useCallback((e: Editor) => {
      if (!onSelectionChangeRef.current) return;
      const text = e.getText();
      const anchor = e.state.selection.anchor;
      const before = e.state.doc.textBetween(0, anchor, GET_TEXT_BLOCK_SEPARATOR, (leaf) => {
        if (leaf.type.name === MentionChip.name) {
          return `@${leaf.attrs.sendLabel || leaf.attrs.label}`;
        }
        if (leaf.type.name === "hardBreak") return "\n";
        return "";
      });
      const caretOffset = Math.max(0, Math.min(before.length, text.length));
      onSelectionChangeRef.current(text, caretOffset);
    }, []);

    const editor = useEditor({
      extensions: allExtensions,
      content: initialContent || "",
      editable: !disabled,
      immediatelyRender: false,
      onUpdate: ({ editor: e }) => {
        onContentChange?.(e.getText());
        // Typing must refresh the mention match too. onSelectionUpdate does not
        // fire for every text input (ProseMirror maps the selection through the
        // transaction instead of "changing" it, and IME composition batches),
        // so relying on it alone leaves the mention panel closed while typing.
        emitSelection(e);
      },
      onFocus: () => onFocus?.(),
      onBlur: () => onBlur?.(),
      onCreate: ({ editor: e }) => {
        onEditorReady?.(e);
      },
      onSelectionUpdate: ({ editor: e }) => {
        emitSelection(e);
      },
      editorProps: {
        handlePaste(_, event) {
          const handler = onPasteFilesRef.current;
          if (!handler) return false;

          const selection = collectClipboardFiles(
            event.clipboardData?.items ?? [],
          );
          if (
            selection.files.length === 0 &&
            selection.unnamedNonImageFileCount === 0
          ) {
            return false;
          }

          event.preventDefault();
          if (selection.files.length > 0) {
            handler(selection.files);
          }
          if (selection.unnamedNonImageFileCount > 0) {
            onPasteFilesRejectedRef.current?.(
              selection.unnamedNonImageFileCount,
            );
          }
          return true;
        },
        handleKeyDown(_, event) {
          if (onInterceptKeydownRef.current?.(event)) {
            event.preventDefault();
            return true;
          }
          if (event.key === "Enter" && !event.isComposing) {
            const inListItem = !!editor?.isActive("listItem");
            // Shift/Alt+Enter: new line. Inside a list that means a new
            // bulleted/numbered item (Zalo has no soft-line-inside-one-bullet
            // concept); outside a list it's a literal line break.
            if (event.shiftKey || event.altKey) {
              event.preventDefault();
              if (inListItem) {
                editor?.commands.splitListItem("listItem");
              } else {
                editor?.commands.setHardBreak();
              }
              return true;
            }
            // Plain Enter always sends, in or out of a list — same as every
            // other composer in the app.
            event.preventDefault();
            onEnterPressRef.current?.();
            return true;
          }
          return false;
        },
        attributes: {
          role: "textbox",
          "aria-multiline": "true",
          "data-testid": testId ?? "chat-composer-input",
          class: "tiptap-editor-inner relative",
        },
      },
    });

    React.useEffect(() => {
      if (editor) {
        editor.setEditable(!disabled);
      }
    }, [disabled, editor]);

    // When placeholder text changes, fire a no-op transaction so ProseMirror
    // recomputes decorations and the new data-placeholder value is rendered.
    React.useEffect(() => {
      if (editor) {
        editor.view.dispatch(editor.state.tr);
      }
    }, [editor, placeholder]);

    React.useImperativeHandle(ref, () => ({
      getHTML: () => editor?.getHTML() ?? "",
      getJSON: () => editor?.getJSON() ?? {},
      getText: () => editor?.getText() ?? "",
      isEmpty: () => editor?.isEmpty ?? true,
      clearContent: () => {
        editor?.commands.clearContent(true);
      },
      setContent: (text: string) => {
        // emitUpdate:false — seeding a draft must not re-fire onContentChange
        // (which would re-persist and loop). Plain text preserves newlines.
        editor?.commands.setContent(text, { emitUpdate: false });
      },
      focus: (options?: { scrollIntoView?: boolean }) => {
        // scrollIntoView:false stops ProseMirror scrolling the caret into view,
        // which otherwise makes ancestor scroll containers (incl. the sidebar
        // list) jump when the composer auto-focuses on opening a conversation.
        editor?.commands.focus("end", {
          scrollIntoView: options?.scrollIntoView ?? true,
        });
      },
      insertAtCursor: (text: string) => {
        editor?.chain().focus().insertContent(text).run();
      },
      insertMentionChip: (range, attrs) => {
        editor
          ?.chain()
          .focus()
          .deleteRange(range)
          .insertContent([
            { type: MentionChip.name, attrs },
            { type: "text", text: " " },
          ])
          .run();
      },
      getMentionRanges: () =>
        editor ? collectMentionRanges(editor, GET_TEXT_BLOCK_SEPARATOR) : [],
      getMentionedIds: () => {
        if (!editor) return [];
        const ids: string[] = [];
        editor.state.doc.descendants((node) => {
          if (node.type.name === MentionChip.name && node.attrs.id) {
            ids.push(String(node.attrs.id));
          }
        });
        return ids;
      },
      getEditor: () => editor ?? null,
    }));

    return (
      <EditorContent
        editor={editor}
        className={clsx(
          "tiptap-composer w-full flex-1 cursor-text overflow-y-auto",
          "min-h-[var(--control-height-md)] max-h-[40vh] px-1 py-1.5",
          "text-sm text-text-primary",
          "[&_.tiptap-editor-inner]:outline-none",
          "[&_.tiptap-editor-inner]:min-h-[1.5rem]",
          "[&_.tiptap-editor-inner_p]:m-0",
          "[&_.tiptap-editor-inner_p+p]:mt-1",
          "[&_.tiptap-editor-inner_ul]:list-disc [&_.tiptap-editor-inner_ul]:pl-5 [&_.tiptap-editor-inner_ul]:my-1",
          "[&_.tiptap-editor-inner_ol]:list-decimal [&_.tiptap-editor-inner_ol]:pl-5 [&_.tiptap-editor-inner_ol]:my-1",
          "[&_.tiptap-editor-inner_ol]:list-decimal [&_.tiptap-editor-inner_ol]:pl-5 [&_.tiptap-editor-inner_ol]:my-1",
          "[&_.tiptap-editor-inner_a]:text-primary [&_.tiptap-editor-inner_a]:underline [&_.tiptap-editor-inner_a]:underline-offset-2",
          disabled && "cursor-not-allowed opacity-70",
          className,
        )}
      />
    );
  },
);

TipTapEditor.displayName = "TipTapEditor";
