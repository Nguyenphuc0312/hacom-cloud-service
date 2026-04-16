import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "../../stores";

const { updateAvatarMock, patchProfileMock } = vi.hoisted(() => ({
  updateAvatarMock: vi.fn(),
  patchProfileMock: vi.fn(),
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

vi.mock("../../services/api", () => ({
  userApi: {
    updateAvatar: updateAvatarMock,
    patchProfile: patchProfileMock,
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
  }));
};

describe("EditProfileModal", () => {
  beforeEach(() => {
    updateAvatarMock.mockReset();
    patchProfileMock.mockReset();
    seedAuthStore();
  });

  it("renders a close action, anchored avatar actions, and readonly identity fields", () => {
    render(<EditProfileModal isOpen onClose={() => {}} />);

    expect(
      screen.getByRole("button", { name: "common:actions.close" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "profile:settings.chooseAvatar" }),
    ).toHaveLength(2);
    expect(
      screen.getByLabelText("profile:settings.displayName"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("profile:editProfileModal.phone"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("EMP001")).toBeDisabled();
    expect(screen.getByDisplayValue("Nguyen Thi Alice")).toBeDisabled();
    expect(screen.getByDisplayValue("alice@company.test")).toBeDisabled();
  });

  it("closes from the modal header close button", () => {
    const onClose = vi.fn();
    render(<EditProfileModal isOpen onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "common:actions.close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
