import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { MentionChip } from "./mentionNode";

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
