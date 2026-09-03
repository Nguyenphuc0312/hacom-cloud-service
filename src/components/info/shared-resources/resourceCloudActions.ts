import { cloudApi } from "../../../features/cloud/api/cloudApi";

type SaveMessageGateway = {
  saveMessage?: (messageId: string, fileId?: string) => Promise<unknown>;
};

export const saveResourceMessageToCloud = async (
  messageId: string,
  isPersonalCloud: boolean,
  fileId?: string,
): Promise<"already-in-cloud" | "saved"> => {
  if (isPersonalCloud) return "already-in-cloud";

  const saveMessage = (cloudApi as SaveMessageGateway).saveMessage;
  if (!saveMessage) {
    throw new Error("Saving chat resources is not supported by this Cloud API");
  }

  await saveMessage(messageId, fileId);
  return "saved";
};
