import { useEffect } from "react";
import { loadMessagesUseCase } from "../usecases/loadMessages";

export const useConversationMessages = (conversationId: string | null) => {
  useEffect(() => {
    if (!conversationId) {
      return;
    }
    void loadMessagesUseCase({ conversationId });
  }, [conversationId]);
};
