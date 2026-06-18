import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Avatar } from "./Avatar";

afterEach(() => cleanup());

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
});
