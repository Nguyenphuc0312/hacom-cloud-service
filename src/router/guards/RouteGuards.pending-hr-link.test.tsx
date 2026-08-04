import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  GuestRoute,
  PendingHrLinkRoute,
  ProtectedRoute,
} from "./RouteGuards";
import { useAuthStore } from "../../stores/authStore";

function setAuthState(status: "authenticated" | "pending_hr_link" | "anonymous") {
  useAuthStore.setState({
    user:
      status === "anonymous"
        ? null
        : {
            id: "user-1",
            username: "pending-user",
            email: "claim@example.com",
            claimedEmployeeCode: "HC000001",
            claimedEmail: "claim@example.com",
            accountState: status === "pending_hr_link" ? "PENDING_HR_LINK" : "ACTIVE",
          },
    authStatus: status,
    isAuthenticated: status === "authenticated",
    isInitialized: true,
    isBootstrappingAuth: false,
    isLoading: false,
    activationContext: null,
    lockedAccount: null,
    error: null,
  });
}

afterEach(() => {
  cleanup();
  setAuthState("anonymous");
});

describe("RouteGuards pending HR link", () => {
  it("redirects pending HR link accounts away from protected app routes", async () => {
    setAuthState("pending_hr_link");

    render(
      <MemoryRouter initialEntries={["/chat"]}>
        <Routes>
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <div>Chat app</div>
              </ProtectedRoute>
            }
          />
          <Route path="/pending-hr-link" element={<div>Pending HR link</div>} />
          <Route path="/login" element={<div>Login</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Pending HR link")).toBeTruthy();
    expect(screen.queryByText("Chat app")).toBeNull();
  });

  it("redirects pending HR link accounts away from guest login routes", async () => {
    setAuthState("pending_hr_link");

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route
            path="/login"
            element={
              <GuestRoute>
                <div>Login form</div>
              </GuestRoute>
            }
          />
          <Route path="/pending-hr-link" element={<div>Pending HR link</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Pending HR link")).toBeTruthy();
    expect(screen.queryByText("Login form")).toBeNull();
  });

  it("renders the pending HR link route only for pending accounts", () => {
    setAuthState("pending_hr_link");

    render(
      <MemoryRouter initialEntries={["/pending-hr-link"]}>
        <Routes>
          <Route
            path="/pending-hr-link"
            element={
              <PendingHrLinkRoute>
                <div>Waiting room</div>
              </PendingHrLinkRoute>
            }
          />
          <Route path="/login" element={<div>Login</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Waiting room")).toBeTruthy();
  });
});
