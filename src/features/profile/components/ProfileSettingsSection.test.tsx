import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "../../../stores";

const {
  checkUsernameMock,
  patchProfileMock,
  updateAvatarMock,
  updateUsernameMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  checkUsernameMock: vi.fn(),
  patchProfileMock: vi.fn(),
  updateAvatarMock: vi.fn(),
  updateUsernameMock: vi.fn(),
  toastSuccessMock: vi.fn(),
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

vi.mock("../../../services/api", () => ({
  userApi: {
    checkUsername: checkUsernameMock,
    patchProfile: patchProfileMock,
    updateAvatar: updateAvatarMock,
    updateUsername: updateUsernameMock,
  },
}));

vi.mock("../../../components/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../components/ui")>();
  return {
    ...actual,
    toast: {
      success: toastSuccessMock,
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
  };
});

import { ProfileSettingsSection } from "./ProfileSettingsSection";

const refreshProfileMock = vi.fn();
const updateUserMock = vi.fn();

const resetStore = () => {
  useAuthStore.setState((state) => ({
    ...state,
    user: {
      id: "user-1",
      username: "user_1",
      displayName: "Current Name",
      bio: "Current bio",
      phone: "+84912345678",
      employeeCode: "EMP001",
      fullNameFromHR: "Nguyen Van A",
      corporateEmail: "user@company.test",
      departmentName: "Engineering",
      unitCode: "ENG",
    },
    isAuthenticated: true,
    authStatus: "authenticated",
    refreshProfile: refreshProfileMock,
    updateUser: updateUserMock,
  }));
};

describe("ProfileSettingsSection", () => {
  beforeEach(() => {
    checkUsernameMock.mockReset();
    patchProfileMock.mockReset();
    updateAvatarMock.mockReset();
    updateUsernameMock.mockReset();
    toastSuccessMock.mockReset();
    refreshProfileMock.mockReset();
    updateUserMock.mockReset();
    refreshProfileMock.mockResolvedValue(null);
    resetStore();
  });

  it("renders a compact summary and keeps edit fields out of settings by default", () => {
    render(<ProfileSettingsSection />);

    expect(screen.getByText("Nguyen Van A")).toBeInTheDocument();
    expect(screen.getAllByText("user@company.test")).toHaveLength(2);
    expect(screen.getByText("Engineering")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "profile:editProfileModal.title" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("profile:settings.displayName"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "profile:settings.chooseBackground" }),
    ).not.toBeInTheDocument();
  });

  it("opens the full dialog from settings with username and phone fields", () => {
    render(<ProfileSettingsSection />);

    fireEvent.click(
      screen.getByRole("button", { name: "profile:editProfileModal.title" }),
    );

    expect(
      screen.getByLabelText("profile:settings.displayName"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("profile:settings.username"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("profile:editProfileModal.phone"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("profile:editProfileModal.bio"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("profile:settings.readOnlyTitle"),
    ).not.toBeInTheDocument();
  });

  it("saves full-profile edits without rendering the legacy inline editor", async () => {
    patchProfileMock.mockResolvedValue({
      success: true,
      data: {
        displayName: "Updated Name",
        phone: "+84987654321",
        bio: "Updated bio",
      },
    });

    render(<ProfileSettingsSection />);

    fireEvent.click(
      screen.getByRole("button", { name: "profile:editProfileModal.title" }),
    );
    fireEvent.change(screen.getByLabelText("profile:settings.displayName"), {
      target: { value: "Updated Name" },
    });
    fireEvent.change(screen.getByLabelText("profile:editProfileModal.phone"), {
      target: { value: "+84987654321" },
    });
    fireEvent.change(screen.getByLabelText("profile:editProfileModal.bio"), {
      target: { value: "Updated bio" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "profile:editProfileModal.save" }),
    );

    await waitFor(() => {
      expect(patchProfileMock).toHaveBeenCalledWith({
        displayName: "Updated Name",
        phone: "+84987654321",
        bio: "Updated bio",
      });
      expect(toastSuccessMock).toHaveBeenCalled();
    });
  });
});
