import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageActions } from "./MessageActions";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: { defaultValue?: string }) => {
      if (
        key === "chat:message.actions.save" ||
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
        actions={["pin", "save", "select", "inspect"]}
        isOpen
        onAction={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Ghim tin nhắn" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lưu tin nhắn" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Chọn nhiều tin nhắn" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Thông tin tin nhắn" }),
    ).toBeInTheDocument();
  });
});
