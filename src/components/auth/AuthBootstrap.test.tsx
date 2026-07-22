import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthBootstrap } from "./AuthBootstrap";
import { useAuthStore } from "../../stores/authStore";

vi.mock("../../stores/authStore", () => ({
  useAuthStore: vi.fn(),
}));

const mockedUseAuthStore = vi.mocked(useAuthStore);

describe("AuthBootstrap", () => {
  it("owns startup restoration when auth is not initialized", async () => {
    const initialize = vi.fn().mockResolvedValue(undefined);
    const state = { initialize, isInitialized: false };
    mockedUseAuthStore.mockImplementation((selector) => selector(state as never));

    render(
      <AuthBootstrap>
        <div>app</div>
      </AuthBootstrap>,
    );

    await waitFor(() => expect(initialize).toHaveBeenCalledTimes(1));
  });

  it("does not re-run an already completed restoration", async () => {
    const initialize = vi.fn().mockResolvedValue(undefined);
    const state = { initialize, isInitialized: true };
    mockedUseAuthStore.mockImplementation((selector) => selector(state as never));

    render(
      <AuthBootstrap>
        <div>app</div>
      </AuthBootstrap>,
    );

    await waitFor(() => expect(initialize).not.toHaveBeenCalled());
  });
});
