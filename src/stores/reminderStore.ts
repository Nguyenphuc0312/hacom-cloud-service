import { create } from "zustand";
import {
  checkPersonalReminder,
  activatePersonalReminder,
} from "../features/ai-assistant/services/reminderApi";
import { usePersonalAiStore } from "../features/personal-ai/stores/personalAiStore";
import { useAuthStore } from "./authStore";
import { logger } from "../utils/logger";

interface ReminderState {
  hasPendingReminder: boolean;

  checkReminder: () => Promise<void>;
  activateReminder: () => Promise<void>;
}

export const useReminderStore = create<ReminderState>()((set) => ({
  hasPendingReminder: false,

  checkReminder: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    try {
      const data = await checkPersonalReminder(
        "default",
        user.employeeCode ?? user.employee_code,
      );
      set({ hasPendingReminder: data.pending && data.unread_count > 0 });
    } catch (err) {
      logger.warn("reminder", "check_failed", { err });
    }
  },

  activateReminder: async () => {
    set({ hasPendingReminder: false });

    const user = useAuthStore.getState().user;
    const personalStore = usePersonalAiStore.getState();

    let conversationId = personalStore.activeConversationId;
    if (!conversationId) {
      conversationId = personalStore.createConversation();
    }

    try {
      const data = await activatePersonalReminder(
        conversationId,
        user?.employeeCode ?? user?.employee_code,
      );
      if (data.ok && data.message) {
        personalStore.addMessage(conversationId, {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.message,
          timestamp: new Date(),
        });
      }
    } catch (err) {
      logger.warn("reminder", "activate_failed", { err });
    }
  },
}));
