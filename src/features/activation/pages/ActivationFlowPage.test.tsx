import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "../../../stores";

const { requestOtpMock, verifyOtpMock, toastSuccessMock, toastInfoMock } =
  vi.hoisted(() => ({
    requestOtpMock: vi.fn(),
    verifyOtpMock: vi.fn(),
    toastSuccessMock: vi.fn(),
    toastInfoMock: vi.fn(),
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

vi.mock("../../auth/api/authApi", () => ({
  activationAuthApi: {
    requestOtp: requestOtpMock,
    resendOtp: requestOtpMock,
    verifyOtp: verifyOtpMock,
  },
}));

vi.mock("../../../components/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../components/ui")>();
  return {
    ...actual,
    toast: {
      success: toastSuccessMock,
      info: toastInfoMock,
      error: vi.fn(),
      warning: vi.fn(),
    },
  };
});

import { ActivationFlowPage } from "./ActivationFlowPage";

const resetAuthStore = () => {
  useAuthStore.setState((state) => ({
    ...state,
    user: null,
    authStatus: "activation_required",
    activationContext: {
      activationTicket: "ticket-1",
      maskedEmail: "u***@company.test",
      nextAction: "VERIFY_OTP",
    },
    lockedAccount: null,
    isAuthenticated: false,
    isLoading: false,
    isInitialized: true,
    error: null,
    applyLoginResponse: vi.fn(() => {
      useAuthStore.setState({
        authStatus: "authenticated",
        isAuthenticated: true,
      });
    }),
  }));
};

describe("ActivationFlowPage", () => {
  beforeEach(() => {
    requestOtpMock.mockReset();
    verifyOtpMock.mockReset();
    toastSuccessMock.mockReset();
    toastInfoMock.mockReset();
    resetAuthStore();
  });

  it("requests OTP then verifies activation with otp and new password in one step", async () => {
    requestOtpMock.mockResolvedValue({
      maskedEmail: "u***@company.test",
      nextAction: "VERIFY_OTP",
      resendAvailableAt: null,
    });
    verifyOtpMock.mockResolvedValue({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      user: {
        id: "user-1",
        username: "user-1",
      },
    });

    render(
      <MemoryRouter initialEntries={["/activation"]}>
        <Routes>
          <Route path="/activation" element={<ActivationFlowPage />} />
          <Route path="/login" element={<div>login-page</div>} />
          <Route path="/chat" element={<div>chat-page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "activation.required.sendOtp" }));

    await waitFor(() => {
      expect(requestOtpMock).toHaveBeenCalledWith({
        activationTicket: "ticket-1",
      });
    });

    const otpInputs = screen.getAllByRole("textbox");
    "123456".split("").forEach((digit, index) => {
      fireEvent.change(otpInputs[index], {
        target: { value: digit },
      });
    });
    fireEvent.change(screen.getByLabelText("activation.setPassword.password"), {
      target: { value: "Secret123!" },
    });
    fireEvent.change(
      screen.getByLabelText("activation.setPassword.confirmPassword"),
      {
        target: { value: "Secret123!" },
      },
    );

    fireEvent.click(screen.getByRole("button", { name: "activation.verifyOtp.submit" }));

    await waitFor(() => {
      expect(verifyOtpMock).toHaveBeenCalledWith({
        activationTicket: "ticket-1",
        otp: "123456",
        newPassword: "Secret123!",
      });
    });

    await waitFor(() => {
      expect(screen.getByText("chat-page")).toBeInTheDocument();
    });

    expect(screen.queryByText("login-page")).not.toBeInTheDocument();
    expect(useAuthStore.getState().authStatus).toBe("authenticated");
  });
});
