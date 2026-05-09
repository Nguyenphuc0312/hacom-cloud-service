import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppErrorPage } from "./AppErrorPage";

const renderErrorPage = (ui: ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe("AppErrorPage", () => {
  it("renders compact safe error copy, actions, and request id", () => {
    renderErrorPage(
      <AppErrorPage
        statusCode={500}
        variant="server"
        title="Hệ thống đang gặp sự cố"
        description="Vui lòng thử lại."
        requestId="req-123"
        primaryAction={{ label: "Thử lại", onClick: vi.fn() }}
        secondaryAction={{ label: "Về trang chat", to: "/chat" }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Hệ thống đang gặp sự cố" })).toBeInTheDocument();
    expect(screen.getByText(/MÃ LỖI\s+500/)).toBeInTheDocument();
    expect(screen.getByText(/req-123/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về trang chat" })).toHaveAttribute(
      "href",
      "/chat",
    );
  });

  it("does not render technical details in production-like test mode", () => {
    renderErrorPage(
      <AppErrorPage
        statusCode={500}
        variant="server"
        title="Hệ thống đang gặp sự cố"
        description="Vui lòng thử lại."
        details="stack trace with token"
      />,
    );

    expect(screen.queryByText("Chi tiết kỹ thuật")).not.toBeInTheDocument();
    expect(screen.queryByText(/token/)).not.toBeInTheDocument();
  });

  it("runs action callbacks only when users confirm the action", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderErrorPage(
      <AppErrorPage
        statusCode={429}
        variant="rate-limit"
        title="Bạn thao tác quá nhanh"
        description="Hãy thử lại sau."
        primaryAction={{ label: "Thử lại", onClick: onRetry }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Thử lại" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
