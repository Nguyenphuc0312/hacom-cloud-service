import { cloudApi } from "../../../features/cloud/api/cloudApi";
import { messageApi } from "../../../services/api";

export const saveResourceMessageToCloud = async (
  messageId: string,
  isPersonalCloud: boolean,
): Promise<"already-in-cloud" | "saved"> => {
  if (isPersonalCloud) return "already-in-cloud";

  const cloud = await cloudApi.ensure();
  await messageApi.forwardMessages([
    {
      sourceMessageId: messageId,
      targetConversationId: cloud.conversationId,
    },
  ]);
  return "saved";
};
