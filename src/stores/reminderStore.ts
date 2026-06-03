import { create } from "zustand";
import {
  checkPersonalReminder,
  activatePersonalReminder,
  isCallableReminderSession,
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

    // Use the real active personal-AI session, never the literal "default".
    // If there is no active session yet, the API helper short-circuits (inert)
    // so we never fire a meaningless `reminder?session_id=default` request.
    const sessionId = usePersonalAiStore.getState().activeConversationId;
    if (!isCallableReminderSession(sessionId)) {
      return;
    }

    try {
      const data = await checkPersonalReminder(
        sessionId,
        user.employeeCode ?? user.employee_code,
      );
      set({ hasPendingReminder: data.pending && data.unread_count > 0 });
    } catch (err) {
      // Reminder is an optional widget — never escalate to logout/session.
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
