import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthenticatedRouteFallback } from "../../layouts/AuthenticatedRouteFallback";
import { ChatWorkspaceSkeleton } from "./Skeleton";
import { PageSpinner } from "./Spinner";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../../shared/layout", () => ({
  PersistentNavigationRail: () => <aside className="hc-side-rail" />,
}));

describe("loading states", () => {
  it("uses a neutral route loader instead of rendering a fake chat shell", () => {
    const { container } = render(<PageSpinner message="Đang mở trang" />);

    expect(screen.getByRole("status")).toHaveTextContent("Đang mở trang");
    expect(
      container.querySelector(".app-loading-progress"),
    ).toBeInTheDocument();
    expect(container.querySelector(".hc-side-rail")).not.toBeInTheDocument();
    expect(
      container.querySelector("[aria-busy='true']"),
    ).not.toBeInTheDocument();
  });

  it("keeps the chat workspace skeleton inside the persistent app rail", () => {
    const { container } = render(<ChatWorkspaceSkeleton />);

    expect(container.querySelector("[aria-busy='true']")).toBeInTheDocument();
    expect(container.querySelector(".hc-side-rail")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".skeleton").length).toBeLessThan(75);
  });

  it("uses layout-matched skeletons instead of a route spinner", () => {
    const { container, rerender } = render(
      <AuthenticatedRouteFallback pathname="/chat/conversation-id" />,
    );

    expect(container.querySelector("[aria-busy='true']")).toBeInTheDocument();
    expect(
      container.querySelector(".app-loading-progress"),
    ).not.toBeInTheDocument();

    rerender(<AuthenticatedRouteFallback pathname="/settings" />);

    expect(container.querySelector("[aria-busy='true']")).toBeInTheDocument();
    expect(
      container.querySelector("[data-skeleton-variant='settings']"),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".app-loading-progress"),
    ).not.toBeInTheDocument();
    expect(container.querySelector("[data-loading-shell]")).toBeInTheDocument();
  });

  it.each([
    ["/friends", "list"],
    ["/tasks", "table"],
    ["/calendar", "calendar"],
    ["/ai-assistant", "workspace"],
    ["/help", "content"],
  ])("maps %s to the %s skeleton", (pathname, variant) => {
    const { container } = render(
      <AuthenticatedRouteFallback pathname={pathname} />,
    );

    expect(
      container.querySelector(`[data-skeleton-variant='${variant}']`),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".app-loading-progress"),
    ).not.toBeInTheDocument();
  });

  it("keeps split and card auth routes on their real page geometry", () => {
    const { container, rerender } = render(
      <AuthenticatedRouteFallback pathname="/login" includeNavigationRail />,
    );

    expect(
      container.querySelector("[data-skeleton-variant='auth-split']"),
    ).toBeInTheDocument();
    expect(container.querySelector(".hc-side-rail")).not.toBeInTheDocument();

    rerender(
      <AuthenticatedRouteFallback
        pathname="/reset-password"
        includeNavigationRail
      />,
    );

    expect(
      container.querySelector("[data-skeleton-variant='auth-card']"),
    ).toBeInTheDocument();
    expect(container.querySelector(".hc-side-rail")).not.toBeInTheDocument();
  });

  it("uses only the form skeleton inside the mounted split auth layout", () => {
    const { container } = render(
      <AuthenticatedRouteFallback pathname="/login" />,
    );

    expect(container.querySelector(".skeleton-stage")).toBeInTheDocument();
    expect(
      container.querySelector("[data-skeleton-variant='auth-split']"),
    ).not.toBeInTheDocument();
  });

  it("keeps the full chat shell stable while authentication loads", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/chat/conversation-id"]}>
        <AuthenticatedRouteFallback
          pathname="/chat/conversation-id"
          includeNavigationRail
          label="Đang kiểm tra phiên đăng nhập"
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("status")).toHaveAccessibleName(
      "Đang kiểm tra phiên đăng nhập",
    );
    expect(container.querySelectorAll(".hc-side-rail")).toHaveLength(1);
    expect(container.querySelector("[aria-busy='true']")).toBeInTheDocument();
    expect(
      container.querySelector(".app-loading-progress"),
    ).not.toBeInTheDocument();
  });

  it("keeps the app rail stable on non-chat routes while auth loads", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/settings"]}>
        <AuthenticatedRouteFallback
          pathname="/settings"
          includeNavigationRail
          label="Đang kiểm tra phiên đăng nhập"
        />
      </MemoryRouter>,
    );

    expect(container.querySelectorAll(".hc-side-rail")).toHaveLength(1);
    expect(
      container.querySelector("[data-skeleton-variant='settings']"),
    ).toBeInTheDocument();
  });
});
