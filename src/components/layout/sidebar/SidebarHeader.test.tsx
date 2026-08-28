import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UserStatus } from "../../../types";
import { SidebarHeader } from "./SidebarHeader";

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

vi.mock("../../../lib/commandPalette", () => ({
  emitOpenNewChatModal: vi.fn(),
}));

describe("SidebarHeader", () => {
  it("opens the add-friend modal from the add-friend button", () => {
    const onAddFriendClick = vi.fn();

    render(
      <SidebarHeader
        layoutState="normal"
        currentUser={{
          id: "user-1",
          username: "minhnhat",
          displayName: "Đậu Cao Minh Nhật",
          status: UserStatus.ONLINE,
        }}
        onAddFriendClick={onAddFriendClick}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "sidebar:header.addFriendLabel" }),
    );

    expect(onAddFriendClick).toHaveBeenCalledOnce();
  });
});
