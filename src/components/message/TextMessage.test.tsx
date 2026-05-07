import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("../ui", () => ({
  toast: {
    success: vi.fn(),
  },
}));

import { TextMessage } from "./TextMessage";
import { toast } from "../ui";

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

describe("TextMessage", () => {
  it("renders long plain text collapsed by default and toggles expansion", async () => {
    const user = userEvent.setup();
    const content = `${"Long content ".repeat(400)}tail`;
    const onToggleExpand = vi.fn();

    render(
      <TextMessage
        content={content}
        isOwn={false}
        isCollapsible
        renderMode="collapsed"
        onToggleExpand={onToggleExpand}
      />,
    );

    expect(screen.getByRole("button", { name: "Xem them" })).toBeInTheDocument();
    expect(screen.getByText(/Long content/)).toBeInTheDocument();
    expect(screen.queryByText(content)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Xem them" }));
    expect(onToggleExpand).toHaveBeenCalledTimes(1);
  });

  it("keeps overflow guards for pathological no-space strings", () => {
    render(
      <TextMessage
        content={"x".repeat(6000)}
        isOwn={true}
        renderMode="expanded"
      />,
    );

    const paragraph = screen.getByText(/x{20}/).closest("p");
    expect(paragraph).toHaveClass("break-words");
    expect(paragraph?.className).toContain("[overflow-wrap:anywhere]");
  });

  it("copies the full structured content even when the message is collapsed", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText,
      },
    });

    const fullContent = `INFO request started\n${"line=value\n".repeat(80)}`;

    render(
      <TextMessage
        content={fullContent}
        isOwn={false}
        isCollapsible
        renderMode="collapsed"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(writeText).toHaveBeenCalledWith(fullContent.trim());
    expect(toast.success).toHaveBeenCalledWith("Đã sao chép toàn bộ tin nhắn");
  });
});
