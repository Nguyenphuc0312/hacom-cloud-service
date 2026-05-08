import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { RateLimitPage } from "./RateLimitPage";

describe("RateLimitPage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("disables retry until Retry-After countdown reaches zero", async () => {
    const onRetry = vi.fn();

    render(
      <MemoryRouter>
        <RateLimitPage retryAfterSeconds={2} requestId="req-429" onRetry={onRetry} />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Có thể thử lại sau\s+2\s+giây/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thử lại sau 2s" })).toBeDisabled();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByRole("button", { name: "Thử lại" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/req-429/)).toBeInTheDocument();
  });
});
