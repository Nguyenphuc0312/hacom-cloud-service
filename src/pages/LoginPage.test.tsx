import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "../stores";

const { loginMock, toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  loginMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) =>
        (options?.defaultValue as string) || key,
    }),
  };
});

vi.mock("../components/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../components/ui")>();
  return {
    ...actual,
    toast: {
      success: toastSuccessMock,
      error: toastErrorMock,
      info: vi.fn(),
      warning: vi.fn(),
    },
  };
});

import { LoginPage } from "./LoginPage";

const resetStoreState = () => {
  useAuthStore.setState((state) => ({
    ...state,
    user: null,
    authStatus: "anonymous",
    activationContext: null,
    lockedAccount: null,
    isAuthenticated: false,
    isLoading: false,
    isInitialized: true,
    error: null,
    login: loginMock,
    clearError: vi.fn(),
    setLockedAccount: vi.fn(),
    setAuthStatus: vi.fn(),
  }));
};

describe("LoginPage", () => {
  beforeEach(() => {
    loginMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    resetStoreState();
  });

  it("prevents duplicate password login submit while request is pending", async () => {
    let resolveLogin: ((value: unknown) => void) | null = null;
    loginMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLogin = resolve;
        }),
    );

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/chat" element={<div>chat-page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const emailInput = document.querySelector(
      'input[name="email"]',
    ) as HTMLInputElement;
    const passwordInput = document.querySelector(
      'input[name="password"]',
    ) as HTMLInputElement;

    fireEvent.change(emailInput, {
      target: { value: "user@company.test" },
    });
    fireEvent.change(passwordInput, {
      target: { value: "Secret123!" },
    });

    const submitButton = screen.getByRole("button", {
      name: "auth:login.submit",
    });
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledTimes(1);
    });

    resolveLogin?.("authenticated");

    await waitFor(() => {
      expect(screen.getByText("chat-page")).toBeInTheDocument();
    });
  });
});
