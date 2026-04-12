import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "../../../stores";

const {
  updateAvatarMock,
  patchProfileMock,
  apiPutMock,
  toastErrorMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  updateAvatarMock: vi.fn(),
  patchProfileMock: vi.fn(),
  apiPutMock: vi.fn(),
  toastErrorMock: vi.fn(),
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
    updateAvatar: updateAvatarMock,
    patchProfile: patchProfileMock,
  },
}));

vi.mock("../../../lib/axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/axios")>();
  return {
    ...actual,
    default: {
      ...actual.default,
      put: apiPutMock,
    },
  };
});

vi.mock("../../../components/ui", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../components/ui")>();
  return {
    ...actual,
    toast: {
      success: toastSuccessMock,
      error: toastErrorMock,
      warning: vi.fn(),
      info: vi.fn(),
    },
  };
});

import { ProfileSettingsSection } from "./ProfileSettingsSection";

const resetStore = () => {
  useAuthStore.setState((state) => ({
    ...state,
    user: {
      id: "user-1",
      username: "user-1",
      displayName: "Current Name",
      bio: "Current bio",
      employeeCode: "EMP001",
      fullNameFromHR: "Nguyen Van A",
      corporateEmail: "user@company.test",
      departmentName: "Engineering",
      unitCode: "ENG",
    },
    isAuthenticated: true,
    authStatus: "authenticated",
  }));
};

describe("ProfileSettingsSection", () => {
  beforeEach(() => {
    updateAvatarMock.mockReset();
    patchProfileMock.mockReset();
    apiPutMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
    resetStore();
  });

  it("renders editable and read-only profile fields separately", () => {
    render(<ProfileSettingsSection />);

    expect(screen.getByLabelText("profile:settings.displayName")).toBeEnabled();
    expect(screen.getByLabelText("profile:settings.bio")).toBeEnabled();
    expect(screen.getByDisplayValue("EMP001")).toBeDisabled();
    expect(screen.getByDisplayValue("Nguyen Van A")).toBeDisabled();
    expect(screen.getByDisplayValue("Engineering")).toBeDisabled();
    expect(screen.getByDisplayValue("ENG")).toBeDisabled();
    expect(screen.getByDisplayValue("user@company.test")).toBeDisabled();
  });

  it("disables background upload after backend reports unsupported endpoint", async () => {
    patchProfileMock.mockResolvedValue({
      success: true,
      data: {
        displayName: "Current Name",
      },
    });
    apiPutMock.mockRejectedValue({
      isAxiosError: true,
      response: { status: 404 },
    });

    render(<ProfileSettingsSection />);

    const fileInputs = document.querySelectorAll(
      'input[type="file"]',
    ) as NodeListOf<HTMLInputElement>;
    const backgroundInput = fileInputs[1];
    const file = new File(["image"], "background.png", { type: "image/png" });

    fireEvent.change(backgroundInput, {
      target: { files: [file] },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "profile:settings.save" }),
    );

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalled();
    });

    expect(
      screen.getByText(
        "Background upload is not available in this environment right now.",
      ),
    ).toBeInTheDocument();

    const backgroundButton = screen.getByRole("button", {
      name: "profile:settings.chooseBackground",
    });
    expect(backgroundButton).toBeDisabled();
  });

  it("prevents duplicate profile save submit while save is pending", async () => {
    let resolvePatch: ((value: unknown) => void) | null = null;
    patchProfileMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePatch = resolve;
        }),
    );

    render(<ProfileSettingsSection />);

    fireEvent.change(screen.getByLabelText("profile:settings.displayName"), {
      target: { value: "Updated Name" },
    });

    const saveButton = screen.getByRole("button", {
      name: "profile:settings.save",
    });

    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    expect(patchProfileMock).toHaveBeenCalledTimes(1);

    resolvePatch?.({
      success: true,
      data: {
        displayName: "Updated Name",
        bio: "Current bio",
      },
    });

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalled();
    });
  });

  it("rejects unsupported avatar file types before upload", () => {
    render(<ProfileSettingsSection />);

    const fileInputs = document.querySelectorAll(
      'input[type="file"]',
    ) as NodeListOf<HTMLInputElement>;
    const avatarInput = fileInputs[0];

    fireEvent.change(avatarInput, {
      target: {
        files: [new File(["raw"], "avatar.txt", { type: "text/plain" })],
      },
    });

    expect(toastErrorMock).toHaveBeenCalledWith(
      "profile:settings.upload.unsupportedType",
    );
  });
});
