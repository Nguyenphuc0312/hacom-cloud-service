import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthenticatedRouteFallback } from "../../layouts/AuthenticatedRouteFallback";
import { ChatWorkspaceSkeleton } from "./Skeleton";
import { PageSpinner } from "./Spinner";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("loading states", () => {
  it("uses a neutral route loader instead of rendering a fake chat shell", () => {
    const { container } = render(<PageSpinner message="Đang mở trang" />);

    expect(screen.getByRole("status")).toHaveTextContent("Đang mở trang");
    expect(container.querySelector(".app-loading-progress")).toBeInTheDocument();
    expect(container.querySelector(".hc-side-rail")).not.toBeInTheDocument();
    expect(container.querySelector("[aria-busy='true']")).not.toBeInTheDocument();
  });

  it("keeps the chat workspace skeleton inside the persistent app rail", () => {
    const { container } = render(<ChatWorkspaceSkeleton />);

    expect(container.querySelector("[aria-busy='true']")).toBeInTheDocument();
    expect(container.querySelector(".hc-side-rail")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".skeleton").length).toBeLessThan(75);
  });

  it("fills chat route loading with the workspace skeleton", () => {
    const { container, rerender } = render(
      <AuthenticatedRouteFallback pathname="/chat/conversation-id" />,
    );

    expect(container.querySelector("[aria-busy='true']")).toBeInTheDocument();
    expect(
      container.querySelector(".app-loading-progress"),
    ).not.toBeInTheDocument();

    rerender(<AuthenticatedRouteFallback pathname="/settings" />);

    expect(
      container.querySelector("[aria-busy='true']"),
    ).not.toBeInTheDocument();
    expect(container.querySelector(".app-loading-progress")).toBeInTheDocument();
  });
});
