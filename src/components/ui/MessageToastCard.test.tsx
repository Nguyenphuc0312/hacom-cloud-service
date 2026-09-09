import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageToastCard } from "./MessageToastCard";

vi.mock("react-hot-toast", () => ({ default: { dismiss: vi.fn() } }));
vi.mock("../../features/chat/events/chatUiEvents", () => ({
  dispatchOpenConversation: vi.fn(),
}));

describe("MessageToastCard", () => {
  it("leads a group notification with its sender and keeps the group as context", () => {
    render(
      <MessageToastCard
        toastId="toast-1"
        visible
        senderName="Sếp Nam"
        conversationName="Dự án ERP"
        isGroup
        preview="Duyệt giúp anh báo giá nhé"
        conversationId="conversation-1"
      />,
    );

    expect(screen.getByText("Sếp Nam")).toBeVisible();
    expect(
      screen.getByText("Dự án ERP · Duyệt giúp anh báo giá nhé"),
    ).toBeVisible();
  });
});
