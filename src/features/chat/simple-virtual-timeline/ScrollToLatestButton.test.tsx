import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScrollToLatestButton } from "./ScrollToLatestButton";

describe("ScrollToLatestButton", () => {
  it("does not render when not visible", () => {
    const { container } = render(
      <ScrollToLatestButton
        visible={false}
        pendingCount={0}
        onClick={() => undefined}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders without badge when visible but pendingCount is 0", () => {
    render(
      <ScrollToLatestButton
        visible
        pendingCount={0}
        onClick={() => undefined}
      />,
    );
    expect(
      screen.getByTestId("scroll-to-latest-button"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("scroll-to-latest-badge"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Lướt xuống tin nhắn mới nhất")).toBeTruthy();
  });

  it("shows numeric badge for 1..9 pending", () => {
    render(
      <ScrollToLatestButton
        visible
        pendingCount={3}
        onClick={() => undefined}
      />,
    );
    expect(screen.getByTestId("scroll-to-latest-badge").textContent).toBe("3");
    expect(screen.getByLabelText("Lướt xuống 3 tin nhắn mới")).toBeTruthy();
  });

  it("collapses badge to 9+ when pending count exceeds 9", () => {
    render(
      <ScrollToLatestButton
        visible
        pendingCount={42}
        onClick={() => undefined}
      />,
    );
    expect(screen.getByTestId("scroll-to-latest-badge").textContent).toBe(
      "9+",
    );
  });

  it("invokes onClick when clicked", () => {
    const onClick = vi.fn();
    render(
      <ScrollToLatestButton visible pendingCount={1} onClick={onClick} />,
    );
    fireEvent.click(screen.getByTestId("scroll-to-latest-button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("offsets bottom when composerHeight is provided", () => {
    render(
      <ScrollToLatestButton
        visible
        pendingCount={0}
        composerHeight={64}
        onClick={() => undefined}
      />,
    );
    const button = screen.getByTestId("scroll-to-latest-button");
    expect(button.style.bottom).toBe("80px");
  });
});
