import { useEffect } from "react";
import { loadConversationsUseCase } from "../usecases/loadConversations";

export const useChatConversations = () => {
  useEffect(() => {
    void loadConversationsUseCase();
  }, []);
};
