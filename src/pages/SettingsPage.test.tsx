import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { useAuthStore } from "../stores";

const syncFromServerMock = vi.fn();
const resetSettingsMock = vi.fn();

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

vi.mock("../settings", () => ({
  useSettings: () => ({
    isSyncing: false,
    lastSyncedAt: "2026-04-21T08:00:00.000Z",
    resetSettings: resetSettingsMock,
    syncError: "Sync failed",
    syncFromServer: syncFromServerMock,
    updatedAt: "2026-04-21T09:00:00.000Z",
  }),
}));

vi.mock("../components/settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../components/settings")>();

  const section =
    (label: string) =>
    ({ id }: { id?: string }) => <section id={id}>{label}</section>;

  return {
    ...actual,
    AppearanceSection: section("appearance-section"),
    BlockedUsersSection: section("blocked-users-section"),
    ChatSection: section("chat-section"),
    DangerZoneSection: section("danger-zone-section"),
    LanguageSection: section("language-section"),
    NotificationSection: section("notification-section"),
    PrivacySection: section("privacy-section"),
    SecuritySection: section("security-section"),
  };
});

vi.mock("../features/profile/components/ProfileSettingsSection", () => ({
  ProfileSettingsSection: ({ id }: { id?: string }) => (
    <section id={id}>profile-section</section>
  ),
}));

import { SettingsPage } from "./SettingsPage";

const installMatchMedia = (matches: boolean) => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches,
      media: "(max-width: 767px)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
};

class IntersectionObserverMock {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
  takeRecords = vi.fn(() => []);

  constructor() {}
}

describe("SettingsPage", () => {
  beforeEach(() => {
    syncFromServerMock.mockReset();
    resetSettingsMock.mockReset();
    window.history.replaceState(null, "", "/settings");
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);

    useAuthStore.setState((state) => ({
      ...state,
      isAuthenticated: true,
      authStatus: "authenticated",
      user: {
        id: "user-1",
        username: "alice",
        displayName: "Alice Nguyen",
        status: "online",
      },
    }));
  });

  it("renders desktop shell with a sidebar and content scroll pane", () => {
    installMatchMedia(false);
    const { container } = render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    expect(syncFromServerMock).toHaveBeenCalledTimes(1);

    const navPane = container.querySelector('[data-settings-pane="nav"]');
    const contentPane = container.querySelector('[data-settings-pane="content"]');

    expect(navPane).not.toBeNull();
    expect(contentPane).not.toBeNull();
    expect(contentPane).toContainElement(screen.getByText("Sync failed"));
    expect(screen.getByText("profile-section")).toBeInTheDocument();
    expect(screen.getByText("danger-zone-section")).toBeInTheDocument();
  });

  it("uses a mobile list/detail stack inside the same content pane", () => {
    installMatchMedia(true);
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    expect(screen.queryByText("chat-section")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Chat & data" }));

    expect(screen.getByText("common:actions.back")).toBeInTheDocument();
    expect(screen.getByText("chat-section")).toBeInTheDocument();
    expect(screen.getByText("language-section")).toBeInTheDocument();
    expect(screen.queryByText("profile-section")).not.toBeInTheDocument();
  });
});
