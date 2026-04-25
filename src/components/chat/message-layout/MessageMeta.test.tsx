import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MessageStatus } from "../../../types";
import type { Message } from "../../../types";
import { MessageMeta } from "./MessageMeta";

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) =>
        (options?.defaultValue as string) || key,
    }),
  };
});

const buildMessage = (overrides: Partial<Message> = {}): Message => ({
  id: "msg-1",
  conversationId: "room-1",
  senderId: "user-1",
  senderName: "Alice",
  content: "Edited message",
  type: "text" as Message["type"],
  status: MessageStatus.SENT,
  isEdited: true,
  isPinned: false,
  isDeleted: false,
  isSystem: false,
  createdAt: new Date("2026-04-16T09:00:00.000Z"),
  editedAt: new Date("2026-04-16T09:05:00.000Z"),
  ...overrides,
});

describe("MessageMeta", () => {
  it("renders edited metadata as a non-clickable label with no history affordance", () => {
    render(<MessageMeta message={buildMessage()} isOwn={false} />);

    const editedLabel = screen.getByText("chat:message.edited");
    expect(editedLabel).toBeInTheDocument();
    expect(editedLabel.closest("button")).toBeNull();
    expect(editedLabel.closest("a")).toBeNull();
    expect(editedLabel.parentElement).toHaveAttribute(
      "aria-label",
      expect.stringContaining("Previous versions are not available."),
    );
  });
});
