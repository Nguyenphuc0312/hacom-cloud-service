import { MessageType, type Message } from "../../../types";
import type {
  MessageActionId,
  MessageActionPolicyResult,
} from "../../../utils/messageActionPolicy";

type MenuActionId = MessageActionPolicyResult["menuActions"][number];

interface CloudMessageMenuInput {
  message: Message;
  baseActions: readonly MenuActionId[];
  canForward: boolean;
  canDelete: boolean;
  isTrash: boolean;
}

const canOperateOnCloudMessage = (message: Message): boolean =>
  message.type !== MessageType.SYSTEM && !message.isDeleted;

/**
 * My Documents owns its message menu policy. Chat actions are used only as
 * capability hints (copyable, downloadable, pinnable and selectable), while
 * ordering and destructive semantics stay Cloud-specific.
 */
export const resolveCloudMessageMenuActions = ({
  message,
  baseActions,
  canForward,
  canDelete,
  isTrash,
}: CloudMessageMenuInput): MessageActionId[] => {
  const capabilities = new Set<MenuActionId>(baseActions);
  const actions: MessageActionId[] = [];
  const operable = canOperateOnCloudMessage(message);

  if (!isTrash) {
    const hasAttachment = (message.attachments?.length ?? 0) > 0;
    const primaryAction: MenuActionId = hasAttachment
      ? "downloadAttachment"
      : "copy";

    if (capabilities.has(primaryAction)) {
      actions.push(primaryAction);
    }
    if (canForward && operable) {
      actions.push("forward");
    }
    if (capabilities.has("unpin")) {
      actions.push("unpin");
    } else if (capabilities.has("pin")) {
      actions.push("pin");
    }
  }

  if (capabilities.has("select")) {
    actions.push("select");
  }

  // Cloud has one destructive action. CloudPage decides whether this means
  // moving an active item to Trash or permanently deleting a trashed item.
  if (canDelete && operable) {
    actions.push("deleteForMe");
  }

  return actions;
};
