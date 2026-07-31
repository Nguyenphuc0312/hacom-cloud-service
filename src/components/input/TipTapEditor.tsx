import React from "react";
import clsx from "clsx";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import type { Editor } from "@tiptap/react";
import { MentionChip } from "./mentionNode";

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
  /** Called when image files are pasted from clipboard. Text/link paste is handled natively by TipTap. */
  onPasteFiles?: (files: File[]) => void;
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
      className,
      "data-testid": testId,
    },
    ref,
  ) => {
    const onEnterPressRef = React.useRef(onEnterPress);
    const onInterceptKeydownRef = React.useRef(onInterceptKeydown);
    const onSelectionChangeRef = React.useRef(onSelectionChange);
    const onPasteFilesRef = React.useRef(onPasteFiles);
    // Ref keeps latest placeholder without re-creating extensions on every change.
    const placeholderRef = React.useRef(placeholder);

    React.useLayoutEffect(() => {
      onEnterPressRef.current = onEnterPress;
      onInterceptKeydownRef.current = onInterceptKeydown;
      onSelectionChangeRef.current = onSelectionChange;
      onPasteFilesRef.current = onPasteFiles;
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
        MentionChip,
      ],
      [], // stable — placeholder is read via ref, not captured in closure
    );

    // Plain-text caret offset. Can't use `anchor - 1`: a mention chip is an atom
    // (1 ProseMirror pos) but serialises to `@sendLabel` (many chars), so after a
    // chip the two diverge. The leafText here must match renderText in
    // mentionNode.ts — that's `sendLabel || label`, NOT `label`: with an alias the
    // two differ in length and every caret past the chip lands off by that much,
    // which makes buildMentionMatch miss and the mention panel never open.
    const emitSelection = React.useCallback((e: Editor) => {
      if (!onSelectionChangeRef.current) return;
      const text = e.getText();
      const anchor = e.state.selection.anchor;
      const before = e.state.doc.textBetween(0, anchor, "\n", (leaf) =>
        leaf.type.name === MentionChip.name
          ? `@${leaf.attrs.sendLabel || leaf.attrs.label}`
          : "",
      );
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

          const items = Array.from(event.clipboardData?.items ?? []);
          const imageItems = items.filter(
            (item) => item.kind === "file" && item.type.startsWith("image/"),
          );
          if (imageItems.length === 0) return false;

          event.preventDefault();
          const files: File[] = [];
          for (const item of imageItems) {
            const raw = item.getAsFile();
            if (!raw) continue;
            // Assign a name when the clipboard doesn't provide one (e.g. screenshot).
            const file = raw.name
              ? raw
              : new File([raw], `pasted-image-${Date.now()}.png`, {
                  type: raw.type || "image/png",
                });
            files.push(file);
          }
          if (files.length > 0) handler(files);
          return true;
        },
        handleKeyDown(_, event) {
          if (onInterceptKeydownRef.current?.(event)) {
            event.preventDefault();
            return true;
          }
          if (event.key === "Enter" && !event.isComposing) {
            // Alt+Enter inserts a line break (same as Shift+Enter).
            if (event.altKey) {
              event.preventDefault();
              editor?.commands.setHardBreak();
              return true;
            }
            if (!event.shiftKey) {
              event.preventDefault();
              onEnterPressRef.current?.();
              return true;
            }
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
