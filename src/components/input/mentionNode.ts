import { Node, mergeAttributes } from "@tiptap/core";

/**
 * Atomic inline "@mention" chip for the composer (Zalo-style blue pill).
 *
 * The chip is purely a compose-time affordance: `renderText` serialises it back
 * to plain `@Label`, so `editor.getText()` — the single source of truth for
 * send / drafts / extractMentionDetails — is byte-for-byte identical to typing
 * the name by hand. Nothing downstream needs to know the chip exists.
 *
 * atom+inline+selectable means the cursor treats it as one unit: arrow keys step
 * over it and Backspace removes the whole chip, never half a name.
 */
export interface MentionChipAttrs {
  id: string;
  label: string;
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
    };
  },

  parseHTML() {
    return [{ tag: "span[data-mention-chip]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-mention-chip": "",
        "data-mention-id": node.attrs.id ?? "",
        // Zalo-style blue rounded pill. Inline styles + a class so it renders
        // even outside the composer's Tailwind scope (e.g. copied HTML).
        class: "composer-mention-chip",
      }),
      `@${node.attrs.label}`,
    ];
  },

  // What editor.getText() emits for this node — MUST match the typed form so the
  // send pipeline and extractMentionDetails resolve it unchanged.
  renderText({ node }) {
    return `@${node.attrs.label}`;
  },
});
