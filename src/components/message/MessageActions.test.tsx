import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageActions } from "./MessageActions";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: { defaultValue?: string }) => {
      if (
        key === "chat:message.actions.pin" ||
        key === "chat:message.actions.select"
      ) {
        return "";
      }
      return fallback?.defaultValue ?? key;
    },
  }),
}));

afterEach(() => {
  cleanup();
});

describe("MessageActions", () => {
  it("keeps More menu labels visible when i18n returns an empty string", () => {
    render(
      <MessageActions
        mode="sheet"
        actions={["pin", "select", "deleteForMe"]}
        isOpen
        onAction={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Ghim tin nhắn" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Chọn nhiều tin nhắn" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Xóa chỉ ở phía tôi" }),
    ).toBeInTheDocument();
  });

  it("anchors dropdown mode items to the trigger", () => {
    render(
      <MessageActions
        mode="dropdown"
        actions={["copy", "deleteForMe"]}
        isOpen
        anchorRect={{ left: 100, top: 100, bottom: 120 }}
        onAction={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Sao chép" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Xóa chỉ ở phía tôi" }),
    ).toBeInTheDocument();
  });
});
