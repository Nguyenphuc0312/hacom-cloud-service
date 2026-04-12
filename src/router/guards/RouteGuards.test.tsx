import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { ActivationRoute, GuestRoute, ProtectedRoute } from "./RouteGuards";
import { useAuthStore } from "../../stores";

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  };
});

const renderProtectedRouter = (initialPath = "/protected") =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>login-page</div>} />
        <Route path="/activation" element={<div>activation-page</div>} />
        <Route path="/chat" element={<div>chat-page</div>} />
        <Route
          path="/protected"
          element={
            <ProtectedRoute>
              <div>protected-page</div>
            </ProtectedRoute>
          }
        />
        <Route
          path="/guest"
          element={
            <GuestRoute>
              <div>guest-page</div>
            </GuestRoute>
          }
        />
        <Route
          path="/activation-flow"
          element={
            <ActivationRoute>
              <div>activation-flow-page</div>
            </ActivationRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

const resetAuthState = () => {
  useAuthStore.setState({
    user: null,
    authStatus: "anonymous",
    activationContext: null,
    lockedAccount: null,
    pendingVerificationEmail: null,
    pendingVerificationSource: null,
    emailVerificationChallenge: null,
    isAuthenticated: false,
    isLoading: false,
    isInitialized: true,
    registrationStatus: "idle",
    error: null,
  });
};

describe("RouteGuards", () => {
  beforeEach(() => {
    resetAuthState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows authenticated users into protected routes", () => {
    useAuthStore.setState({
      isAuthenticated: true,
      authStatus: "authenticated",
      user: { id: "u-1", username: "user-1" },
    });

    renderProtectedRouter();

    expect(screen.getByText("protected-page")).toBeInTheDocument();
  });

  it("redirects activation-required users into activation flow", () => {
    useAuthStore.setState({
      authStatus: "activation_required",
      activationContext: {
        activationTicket: "ticket-1",
        maskedEmail: "u***@company.test",
        nextAction: "VERIFY_OTP",
      },
    });

    renderProtectedRouter();

    expect(screen.getByText("activation-page")).toBeInTheDocument();
  });

  it("blocks locked and disabled users from protected routes", () => {
    useAuthStore.setState({
      authStatus: "disabled",
      lockedAccount: {
        status: "disabled",
        code: "ACCOUNT_DISABLED",
        message: "Disabled",
      },
    });

    renderProtectedRouter();

    expect(screen.getByText("login-page")).toBeInTheDocument();
  });

  it("allows activation route only for activation-required state", () => {
    useAuthStore.setState({
      authStatus: "activation_required",
      activationContext: {
        activationTicket: "ticket-1",
        maskedEmail: null,
        nextAction: "VERIFY_OTP",
      },
    });

    renderProtectedRouter("/activation-flow");

    expect(screen.getByText("activation-flow-page")).toBeInTheDocument();
  });
});
