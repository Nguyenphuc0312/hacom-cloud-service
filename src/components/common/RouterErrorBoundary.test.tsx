import { describe, expect, it } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { RouterErrorBoundary } from "./RouterErrorBoundary";
import { NotFoundPage } from "../../pages/errors";

const renderRouter = (status: number) => {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        errorElement: <RouterErrorBoundary />,
        loader: () => {
          throw new Response(JSON.stringify({ requestId: "req-route" }), {
            status,
            statusText: "Route error",
          });
        },
        element: <div>ok</div>,
      },
      {
        path: "*",
        element: <NotFoundPage />,
      },
    ],
    { initialEntries: ["/"] },
  );

  return render(<RouterProvider router={router} />);
};

describe("RouterErrorBoundary", () => {
  it("maps route 403 errors to the forbidden page", async () => {
    renderRouter(403);

    expect(
      await screen.findByRole("heading", { name: "Bạn không có quyền truy cập" }),
    ).toBeInTheDocument();
  });

  it("maps route 429 errors to the rate limit page", async () => {
    renderRouter(429);

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
