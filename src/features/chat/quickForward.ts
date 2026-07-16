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
