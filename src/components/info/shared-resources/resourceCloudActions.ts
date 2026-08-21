import { cloudApi } from "../../../features/cloud/api/cloudApi";

export const saveResourceMessageToCloud = async (
  messageId: string,
  isPersonalCloud: boolean,
  fileId?: string,
): Promise<"already-in-cloud" | "saved"> => {
  if (isPersonalCloud) return "already-in-cloud";

  await cloudApi.saveMessage(messageId, fileId);
  return "saved";
};
