import type { ReminderInfo } from "@hacom/chat-shared-types/chat";
import type { Message } from "../../types";

export const dedupeByReminderId = (messages: Message[]): Message[] => {
  const byId = new Map<string, Message>();
  for (const msg of messages) {
    const reminder = (
      msg.metadata as { reminder?: ReminderInfo } | null | undefined
    )?.reminder;
    if (!reminder) continue;
    const existing = byId.get(reminder.id);
    if (!existing) {
      byId.set(reminder.id, msg);
      continue;
    }

    const existingReminder = (existing.metadata as { reminder?: ReminderInfo })
      .reminder!;
    const existingIsNotice = existingReminder.isFireNotice ?? false;
    const currentIsNotice = reminder.isFireNotice ?? false;
    if (existingIsNotice && !currentIsNotice) {
      byId.set(reminder.id, msg);
    } else if (existingIsNotice === currentIsNotice) {
      const older =
        (msg.messageSeq ?? Infinity) < (existing.messageSeq ?? Infinity)
          ? msg
          : existing;
      byId.set(reminder.id, older);
    }
  }
  return [...byId.values()];
};
