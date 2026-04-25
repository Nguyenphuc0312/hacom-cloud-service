import { useChatStore } from "../../../stores";

interface LoadMessagesInput {
  conversationId: string;
  before?: string;
  after?: string;
  options?: {
    force?: boolean;
    limit?: number;
    beforeId?: string;
    afterId?: string;
    syncReason?: "initial-sync" | "reconnect" | "conversation-refresh";
  };
}

export const loadMessagesUseCase = async (input: LoadMessagesInput) => {
  const { fetchMessages } = useChatStore.getState();
  return fetchMessages(
    input.conversationId,
    input.before,
    input.after,
    input.options,
  );
};
