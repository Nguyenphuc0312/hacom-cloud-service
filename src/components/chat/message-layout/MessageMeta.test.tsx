import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageStatus, MessageType, type Message } from "../../../types";
import { MessageMeta } from "./MessageMeta";

vi.mock("react-i18next", () => ({
  initReactI18next: {
    type: "3rdParty",
    init: vi.fn(),
  },
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      key === "chat:message.edited"
        ? "Đã chỉnh sửa"
        : key === "chat:message.editHistory.viewTitle"
          ? "Xem tin nhắn gốc"
        : options?.defaultValue ?? key,
  }),
}));

describe("MessageMeta edited state", () => {
  it("renders a quiet text label before the timestamp and opens edit history", () => {
    const onViewEditHistory = vi.fn();
    const message = {
      id: "message-1",
      conversationId: "conversation-1",
      senderId: "user-1",
      senderName: "Người gửi",
      content: "Nội dung đã sửa",
      type: MessageType.TEXT,
      status: MessageStatus.SENT,
      isDeleted: false,
      isSystem: false,
      isEdited: true,
      isPinned: false,
      createdAt: new Date("2026-08-27T01:21:00.000Z"),
      editedAt: new Date("2026-08-27T01:22:00.000Z"),
    } as Message;

    render(
      <MessageMeta
        message={message}
        isOwn
        showStatus
        onViewEditHistory={onViewEditHistory}
      />,
    );

    const editedButton = screen.getByRole("button", {
      name: "Xem tin nhắn gốc",
    });
    expect(editedButton).toHaveTextContent("Đã chỉnh sửa");
    expect(editedButton.querySelector("svg")).toBeNull();
    expect(screen.getByText("·")).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(editedButton);
    expect(onViewEditHistory).toHaveBeenCalledWith("message-1");
  });
});
