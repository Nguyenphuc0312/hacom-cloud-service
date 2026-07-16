/**
 * Quick-forward drag-and-drop contract.
 *
 * Dragging a message with an attachment onto a sidebar room forwards it there
 * immediately (Zalo-style quick share). The drag crosses component boundaries
 * (timeline → sidebar), so the source message is carried through the native
 * DataTransfer as a small serializable payload under a private MIME type.
 */

/** Private drag type — distinct from OS-file drags (`Files`) so the composer's
 *  file-upload dropzone never intercepts a message drag, and vice versa. */
export const MESSAGE_DRAG_MIME = "application/x-hacom-message";

export interface MessageDragPayload {
  messageId: string;
  sourceConversationId: string;
  /** Short label for the drag ghost / accessibility (file name or "[Ảnh]"). */
  label: string;
}

export const encodeMessageDrag = (
  dataTransfer: DataTransfer,
  payload: MessageDragPayload,
): void => {
  dataTransfer.setData(MESSAGE_DRAG_MIME, JSON.stringify(payload));
  dataTransfer.effectAllowed = "copy";
};

export const decodeMessageDrag = (
  dataTransfer: DataTransfer,
): MessageDragPayload | null => {
  const raw = dataTransfer.getData(MESSAGE_DRAG_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<MessageDragPayload>;
    if (
      typeof parsed.messageId === "string" &&
      typeof parsed.sourceConversationId === "string"
    ) {
      return {
        messageId: parsed.messageId,
        sourceConversationId: parsed.sourceConversationId,
        label: typeof parsed.label === "string" ? parsed.label : "",
      };
    }
  } catch {
    // Malformed payload — treat as "not a message drag".
  }
  return null;
};

/** True when the drag currently in progress carries a message payload. Used by
 *  drop targets in dragover, where the payload value is not yet readable but the
 *  type list is. */
export const isMessageDrag = (dataTransfer: DataTransfer): boolean =>
  Array.from(dataTransfer.types).includes(MESSAGE_DRAG_MIME);

/**
 * Build a small, crisp drag ghost (a "⇢ Chuyển tiếp: {label}" pill) and use it
 * as the drag image, instead of snapshotting the live bubble — which the browser
 * renders translucent and muddy, and which drags along sibling chrome (the action
 * rail). Returns a cleanup that removes the detached node once the drag has taken
 * its snapshot. No-op (returns a noop cleanup) outside the browser.
 */
export const applyQuickForwardDragGhost = (
  dataTransfer: DataTransfer,
  label: string,
): (() => void) => {
  if (typeof document === "undefined") return () => {};

  const chip = document.createElement("div");
  chip.textContent = `⇢ Chuyển tiếp: ${label}`;
  // Inline styles so the ghost never depends on the app stylesheet being applied
  // to a detached node (Tailwind classes wouldn't resolve here).
  Object.assign(chip.style, {
    position: "fixed",
    top: "-1000px",
    left: "-1000px",
    padding: "8px 14px",
    borderRadius: "9999px",
    background: "#1565C0",
    color: "#fff",
    fontSize: "13px",
    fontWeight: "600",
    fontFamily: "system-ui, -apple-system, sans-serif",
    boxShadow: "0 6px 16px rgba(21,101,192,0.35)",
    whiteSpace: "nowrap",
    pointerEvents: "none",
    maxWidth: "260px",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(chip);
  dataTransfer.setDragImage(chip, 16, 16);

  // The browser snapshots synchronously on dragstart; remove on the next frame.
  const cleanup = () => chip.remove();
  requestAnimationFrame(cleanup);
  return cleanup;
};

/**
 * Which message kinds can be quick-forwarded by dragging onto a room, and the
 * drag-ghost label to use. Returns null for kinds that are NOT draggable (plain
 * text, poll, reminder, sticker, voice…). The caller supplies already-derived
 * facts so this stays free of Message-type parsing. Currently: file/image/video
 * (has attachment), shared contacts, and links.
 */
export const resolveQuickForwardLabel = (facts: {
  hasAttachment: boolean;
  attachmentName?: string;
  isContact: boolean;
  hasLink: boolean;
}): string | null => {
  if (facts.hasAttachment) return facts.attachmentName || "[Tệp đính kèm]";
  if (facts.isContact) return "[Danh thiếp]";
  if (facts.hasLink) return "[Liên kết]";
  return null;
};
