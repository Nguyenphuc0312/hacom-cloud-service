import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConversationItemMenu } from "./RoomItem";

describe("ConversationItemMenu", () => {
  afterEach(cleanup);

  it("portals the open menu outside the conversation row", () => {
    const { container } = render(
      <ConversationItemMenu
        conversationId="conversation-1"
        isPinned={false}
        labels={[]}
        assignedLabelIds={[]}
        onTogglePinned={vi.fn()}
        onToggleLabel={vi.fn()}
        onDeleteConversation={vi.fn()}
        onOpenLabelManager={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button"));

    const menu = screen.getByRole("menu");
    expect(menu.parentElement).toBe(document.body);
    expect(container.contains(menu)).toBe(false);
    expect(menu.classList.contains("fixed")).toBe(true);
    expect(menu.style.visibility).toBe("visible");
  });
});
