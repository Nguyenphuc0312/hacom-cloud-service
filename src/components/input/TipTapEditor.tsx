import React from "react";
import clsx from "clsx";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import type { Editor } from "@tiptap/react";

export interface TipTapEditorHandle {
  getHTML: () => string;
  getJSON: () => object;
  getText: () => string;
  isEmpty: () => boolean;
  clearContent: () => void;
  focus: () => void;
  insertAtCursor: (text: string) => void;
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
      className,
      "data-testid": testId,
    },
    ref,
  ) => {
    const onEnterPressRef = React.useRef(onEnterPress);
    const onInterceptKeydownRef = React.useRef(onInterceptKeydown);
    const onSelectionChangeRef = React.useRef(onSelectionChange);
    // Ref keeps latest placeholder without re-creating extensions on every change.
    const placeholderRef = React.useRef(placeholder);

    React.useLayoutEffect(() => {
      onEnterPressRef.current = onEnterPress;
      onInterceptKeydownRef.current = onInterceptKeydown;
      onSelectionChangeRef.current = onSelectionChange;
      placeholderRef.current = placeholder;
    });

    const allExtensions = React.useMemo(
      () => [
        StarterKit.configure({
          hardBreak: {
            keepMarks: true,
          },
        }),
        Underline,
        // eslint-disable-next-line react-hooks/refs
        Placeholder.configure({
          // Function form reads from ref so decoration always shows current text
          // without needing to recreate the editor instance on each prop change.
          placeholder: () => placeholderRef.current,
          emptyEditorClass: "is-editor-empty",
          showOnlyWhenEditable: false,
        }),
      ],
      [], // stable — placeholder is read via ref, not captured in closure
    );

    const editor = useEditor({
      extensions: allExtensions,
      content: initialContent || "",
      editable: !disabled,
      immediatelyRender: false,
      onUpdate: ({ editor: e }) => {
        onContentChange?.(e.getText());
      },
      onFocus: () => onFocus?.(),
      onBlur: () => onBlur?.(),
      onCreate: ({ editor: e }) => {
        onEditorReady?.(e);
      },
      onSelectionUpdate: ({ editor: e }) => {
        if (onSelectionChangeRef.current) {
          const text = e.getText();
          const anchor = e.state.selection.anchor;
          // ProseMirror position offset: paragraph node adds 1, so plain text offset = anchor - 1.
          // Clamp to [0, text.length] to handle edge cases with multi-paragraph docs.
          const caretOffset = Math.max(0, Math.min(anchor - 1, text.length));
          onSelectionChangeRef.current(text, caretOffset);
        }
      },
      editorProps: {
        handleKeyDown(_, event) {
          if (onInterceptKeydownRef.current?.(event)) {
            event.preventDefault();
            return true;
          }
          if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
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
      focus: () => {
        editor?.commands.focus("end");
      },
      insertAtCursor: (text: string) => {
        editor?.chain().focus().insertContent(text).run();
      },
      getEditor: () => editor ?? null,
    }));

    return (
      <EditorContent
        editor={editor}
        className={clsx(
          "tiptap-composer w-full flex-1 cursor-text overflow-y-auto",
          "min-h-[var(--control-height-md)] px-1 py-1.5",
          "text-sm text-text-primary",
          "[&_.tiptap-editor-inner]:outline-none",
          "[&_.tiptap-editor-inner]:min-h-[1.5rem]",
          "[&_.tiptap-editor-inner_p]:m-0",
          "[&_.tiptap-editor-inner_p+p]:mt-1",
          "[&_.tiptap-editor-inner_ul]:list-disc [&_.tiptap-editor-inner_ul]:pl-5 [&_.tiptap-editor-inner_ul]:my-1",
          "[&_.tiptap-editor-inner_ol]:list-decimal [&_.tiptap-editor-inner_ol]:pl-5 [&_.tiptap-editor-inner_ol]:my-1",
          "[&_.tiptap-editor-inner_ol]:list-decimal [&_.tiptap-editor-inner_ol]:pl-5 [&_.tiptap-editor-inner_ol]:my-1",
          disabled && "cursor-not-allowed opacity-70",
          className,
        )}
      />
    );
  },
);

TipTapEditor.displayName = "TipTapEditor";
