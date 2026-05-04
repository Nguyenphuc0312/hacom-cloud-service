import { describe, expect, it } from "vitest";
import { MemoryRouter, createMemoryRouter, RouterProvider } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { RouterErrorBoundary } from "./RouterErrorBoundary";
import { NotFoundPage } from "../../pages/errors";
import { vi } from "vitest";

const mockUseRouteError = vi.fn();
const mockIsRouteErrorResponse = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useRouteError: () => mockUseRouteError(),
    isRouteErrorResponse: (err: unknown) => mockIsRouteErrorResponse(err),
  };
});

const renderErrorBoundary = (status: number) => {
  mockUseRouteError.mockReturnValue({
    status,
    statusText: "Route error",
    data: { requestId: "req-route" },
  });
  mockIsRouteErrorResponse.mockImplementation((err: unknown) => (err as { status?: number })?.status === status);

  return render(
    <MemoryRouter>
      <RouterErrorBoundary />
    </MemoryRouter>
  );
};

describe("RouterErrorBoundary", () => {
  it("maps route 403 errors to the forbidden page", async () => {
    renderErrorBoundary(403);

    expect(
      await screen.findByRole("heading", { name: "Bạn không có quyền truy cập" }),
    ).toBeInTheDocument();
  });

  it("maps route 429 errors to the rate limit page", async () => {
    renderErrorBoundary(429);

    expect(
      await screen.findByRole("heading", { name: "Bạn thao tác quá nhanh" }),
    ).toBeInTheDocument();
  });

  it("renders an explicit 404 page for unknown route coverage", () => {
    const router = createMemoryRouter(
      [
        {
          path: "*",
          element: <NotFoundPage />,
        },
      ],
      { initialEntries: ["/does-not-exist"] },
    );

    render(<RouterProvider router={router} />);

    expect(
      screen.getByRole("heading", { name: "Không tìm thấy trang" }),
    ).toBeInTheDocument();
  });
});
