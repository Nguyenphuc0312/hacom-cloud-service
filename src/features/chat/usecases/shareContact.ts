import { chatApi } from "../api/chatApi";

interface ShareContactInput {
  conversationId: string;
  contactUserId: string;
}

export const shareContactUseCase = async (input: ShareContactInput) => {
  return chatApi.contact.shareContact({
    conversationId: input.conversationId,
    contactUserId: input.contactUserId,
  });
};
