import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserStatus } from "../../types";
import { Avatar } from "./Avatar";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("Avatar", () => {
  it("renders a valid avatar image", () => {
    render(<Avatar src="https://cdn.example/u.jpg" alt="Vu Minh Quoc" />);

    expect(screen.getByRole("img", { name: "Vu Minh Quoc" })).toBeInTheDocument();
  });

  it("falls back to initials when avatar fails", () => {
    render(<Avatar src="https://cdn.example/missing.jpg" alt="Dau Cao Minh Nhat" />);

    fireEvent.error(screen.getByRole("img", { name: "Dau Cao Minh Nhat" }));

    expect(screen.getByText("DN")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Dau Cao Minh Nhat" })).not.toBeInTheDocument();
  });

  it("keeps long names to at most two initials", () => {
    render(<Avatar alt="Dau Cao Minh Nhat" />);

    expect(screen.getByText("DN")).toBeInTheDocument();
  });

  it("uses the default user icon when no name is available", () => {
    render(<Avatar />);

    expect(screen.queryByText("?")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders the 2xl fallback icon with matching sizing", () => {
    const { container } = render(<Avatar size="2xl" />);

    expect(container.querySelector(".h-32.w-32")).toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveClass("h-16", "w-16");
  });

  it("keeps online status static by default", () => {
    const { container } = render(
      <Avatar status={UserStatus.ONLINE} showStatus />,
    );

    expect(container.querySelector(".bg-state-online")).toBeInTheDocument();
    expect(container.querySelector(".animate-pulse-online")).not.toBeInTheDocument();
  });

  it("animates online status only when explicitly requested", () => {
    const { container } = render(
      <Avatar
        status={UserStatus.ONLINE}
        showStatus
        presenceAnimation="active"
      />,
    );

    expect(container.querySelector(".motion-safe\\:animate-pulse-online")).toBeInTheDocument();
  });

  it("honors VITE_DISABLE_PRESENCE_ANIMATION", () => {
    vi.stubEnv("VITE_DISABLE_PRESENCE_ANIMATION", "true");

    const { container } = render(
      <Avatar
        status={UserStatus.ONLINE}
        showStatus
        presenceAnimation="active"
      />,
    );

    expect(container.querySelector(".animate-pulse-online")).not.toBeInTheDocument();
  });
});
