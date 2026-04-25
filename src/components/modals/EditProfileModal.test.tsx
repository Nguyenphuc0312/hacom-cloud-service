import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "../../stores";

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

vi.mock("../../services/api", () => ({
  userApi: {
    patchProfile: vi.fn(),
    updateAvatar: vi.fn(),
    updateUsername: vi.fn(),
    checkUsername: vi.fn(),
  },
}));

import { EditProfileModal } from "./EditProfileModal";

const seedAuthStore = () => {
  useAuthStore.setState((state) => ({
    ...state,
    user: {
      id: "user-1",
      username: "alice",
      displayName: "Alice Nguyen",
      bio: "Current bio",
      phone: "+84912345678",
      email: "alice@company.test",
      employeeCode: "EMP001",
      fullNameFromHR: "Nguyen Thi Alice",
      status: "online",
    },
    isAuthenticated: true,
    authStatus: "authenticated",
    refreshProfile: vi.fn().mockResolvedValue(state.user),
    updateUser: vi.fn(),
  }));
};

describe("EditProfileModal", () => {
  beforeEach(() => {
    seedAuthStore();
  });

  it("renders the quick-edit variant with avatar, display name, and bio only", () => {
    render(<EditProfileModal isOpen onClose={() => {}} />);

    expect(
      screen.getByRole("button", { name: "common:actions.close" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "profile:settings.chooseAvatar" }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("profile:settings.displayName"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("profile:editProfileModal.bio"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("profile:editProfileModal.phone"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("profile:settings.username"),
    ).not.toBeInTheDocument();
  });

  it("confirms before closing when there are unsaved changes", () => {
    const onClose = vi.fn();
    render(<EditProfileModal isOpen onClose={onClose} />);

    fireEvent.change(screen.getByLabelText("profile:settings.displayName"), {
      target: { value: "Alice Updated" },
    });

    fireEvent.click(screen.getByRole("button", { name: "common:actions.close" }));

    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByText("profile:editProfileModal.discardTitle"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "common:actions.confirm" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
