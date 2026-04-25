import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { AppErrorBoundary } from "./AppErrorBoundary";

const BrokenRoute = () => {
  throw new Error("render crashed with sensitive detail");
};

describe("AppErrorBoundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders production-safe fallback when a route component crashes", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <MemoryRouter initialEntries={["/broken"]}>
        <AppErrorBoundary>
          <Routes>
            <Route path="/broken" element={<BrokenRoute />} />
          </Routes>
        </AppErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Hệ thống đang gặp sự cố" })).toBeInTheDocument();
    expect(screen.queryByText(/sensitive detail/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về trang chat" })).toHaveAttribute(
      "href",
      "/chat",
    );
  });
});
