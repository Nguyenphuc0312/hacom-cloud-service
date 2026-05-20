import React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import {
  ArrowLeftIcon,
  ArrowLeftOnRectangleIcon,
  BellIcon,
  Cog6ToothIcon,
  GlobeAltIcon,
  LifebuoyIcon,
  PaintBrushIcon,
  ShieldCheckIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import {
  AppearanceSection,
  HelpSection,
  LanguageSection,
  NotificationSection,
  PrivacySection,
  SecuritySection,
  SettingsContent,
  SettingsPageShell,
  SettingsSidebar,
  type SettingsSidebarItem,
} from "../components/settings";
import { AppPageHeader } from "../components/layout/AppPage";
import { InlineNotice, Skeleton } from "../components/ui";
import { ProfileSettingsSection } from "../features/profile/components/ProfileSettingsSection";
import { ROUTE_PATHS } from "../router/paths";
import { useSettings } from "../settings";
import { useAuthStore } from "../stores";
import { resolveUserDisplayName } from "../features/chat/identity/resolveUserDisplayName";
import { RSP_BREAKPOINT_MIN } from "../responsive/responsive";

const MOBILE_MEDIA_QUERY = `(max-width: ${RSP_BREAKPOINT_MIN.md - 1}px)`;

const SETTINGS_TARGETS = {
  profile: "settings-profile",
  notifications: "settings-notifications",
  privacy: "settings-privacy",
  security: "settings-security",
  appearance: "settings-appearance",
  language: "settings-language",
  help: "settings-help",
} as const;

type SettingsNavId = keyof typeof SETTINGS_TARGETS | "logout";

const DEFAULT_NAV_ID: SettingsNavId = "profile";

const readHashTargetId = (): SettingsNavId | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const hash = window.location.hash.replace(/^#/, "").trim();
  const match = Object.entries(SETTINGS_TARGETS).find(([, target]) => target === hash);
  return match ? (match[0] as SettingsNavId) : null;
};

const replaceHash = (navId: SettingsNavId | null) => {
  if (typeof window === "undefined") {
    return;
  }

  const target = navId && navId !== "logout" ? SETTINGS_TARGETS[navId] : null;
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}${target ? `#${target}` : ""}`,
  );
};

export const SettingsPage: React.FC = () => {
  const { t } = useTranslation(["settings", "common", "profile"]);
  const navigate = useNavigate();
  const {
    isSyncing,
    lastSyncedAt,
    resetSettings,
    syncError,
    syncFromServer,
    updatedAt,
  } = useSettings();
  const currentUser = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const logout = useAuthStore((state) => state.logout);

  const [isMobile, setIsMobile] = React.useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
  });
  const [activeNavId, setActiveNavId] = React.useState<SettingsNavId>(
    () => readHashTargetId() ?? DEFAULT_NAV_ID,
  );
  const [selectedMobileNavId, setSelectedMobileNavId] =
    React.useState<SettingsNavId | null>(() => {
      if (
        typeof window !== "undefined" &&
        window.matchMedia(MOBILE_MEDIA_QUERY).matches
      ) {
        return readHashTargetId();
      }

      return null;
    });
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (isAuthenticated) {
      void syncFromServer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  React.useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return undefined;
    }

    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
    };


    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  const formatTimestamp = (value: string | null) => {
    if (!value) {
      return t("common:status.unknown");
    }

    return new Date(value).toLocaleString();
  };

  const navItems: Array<SettingsSidebarItem & { navId: SettingsNavId }> = [
    {
      navId: "profile",
      id: "profile",
      label: t("settings:navigation.profile", { defaultValue: "Hồ sơ" }),
      icon: <UserCircleIcon className="h-4 w-4" />,
    },
    {
      navId: "notifications",
      id: "notifications",
      label: t("settings:navigation.notifications", {
        defaultValue: "Thông báo",
      }),
      icon: <BellIcon className="h-4 w-4" />,
    },
    {
      navId: "privacy",
      id: "privacy",
      label: t("settings:navigation.privacy", {
        defaultValue: "Quyền riêng tư",
      }),
      icon: <ShieldCheckIcon className="h-4 w-4" />,
    },
    {
      navId: "security",
      id: "security",
      label: t("settings:navigation.security", { defaultValue: "Bảo mật" }),
      icon: <ShieldCheckIcon className="h-4 w-4" />,
    },
    {
      navId: "appearance",
      id: "appearance",
      label: t("settings:navigation.appearance", {
        defaultValue: "Giao diện",
      }),
      icon: <PaintBrushIcon className="h-4 w-4" />,
    },
    {
      navId: "language",
      id: "language",
      label: t("settings:navigation.language", { defaultValue: "Ngôn ngữ" }),
      icon: <GlobeAltIcon className="h-4 w-4" />,
    },
    {
      navId: "help",
      id: "help",
      label: t("settings:navigation.help", { defaultValue: "Trợ giúp" }),
      icon: <LifebuoyIcon className="h-4 w-4" />,
    },
    {
      navId: "logout",
      id: "logout",
      label: t("settings:navigation.logout", { defaultValue: "Đăng xuất" }),
      icon: <ArrowLeftOnRectangleIcon className="h-4 w-4" />,
      tone: "danger",
    },
  ];

  const handleRetrySync = () => {
    void syncFromServer();
  };

  const handleSelectNav = (navId: SettingsNavId) => {
    if (navId === "logout") {
      logout();
      navigate(ROUTE_PATHS.LOGIN, { replace: true });
      return;
    }

    setActiveNavId(navId);
    replaceHash(navId);

    if (isMobile) {
      setSelectedMobileNavId(navId);
    } else {
      contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleMobileBack = () => {
    setSelectedMobileNavId(null);
    replaceHash(null);
  };

  const currentMobileItem =
    navItems.find((item) => item.navId === selectedMobileNavId) ?? null;

  const syncNotice = syncError ? (
    <InlineNotice
      tone="error"
      message={syncError || t("common:error.syncFailed")}
      action={
        <button
          type="button"
          onClick={handleRetrySync}
          disabled={isSyncing}
          className={clsx(
            "rounded-full px-2.5 py-1 text-xs font-semibold transition-fast",
            isSyncing ? "cursor-not-allowed opacity-60" : "hover:bg-danger/10",
          )}
        >
          {t("common:actions.retry")}
        </button>
      }
    />
  ) : undefined;

  const renderSettingsFooter = () => (
    <div className="border-t border-border pt-5 text-sm text-text-secondary">
      <p>{t("settings:version", { version: 2 })}</p>
      <p className="mt-1">
        {t("common:status.lastSynced", {
          time: formatTimestamp(lastSyncedAt),
        })}
        {" · "}
        {t("common:status.lastUpdated", {
          time: formatTimestamp(updatedAt || null),
        })}
      </p>
    </div>
  );

  const renderSection = (navId: SettingsNavId | null) => {
    switch (navId) {
      case "profile":
        return <ProfileSettingsSection id="settings-profile" />;
      case "notifications":
        return <NotificationSection id="settings-notifications" />;
      case "privacy":
        return <PrivacySection id="settings-privacy" />;
      case "security":
        return <SecuritySection id="settings-security" />;
      case "appearance":
        return <AppearanceSection id="settings-appearance" />;
      case "language":
        return <LanguageSection id="settings-language" />;
      case "help":
        return <HelpSection id="settings-help" />;
      default:
        return <ProfileSettingsSection id="settings-profile" />;
    }
  };

  const mobileContent = selectedMobileNavId ? (
    <SettingsContent
      ref={contentRef}
      notice={syncNotice}
      header={
        <div className="border-b border-border pb-4">
          <button
            type="button"
            onClick={handleMobileBack}
            className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium text-text-secondary transition-micro hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            {t("common:actions.back")}
          </button>
          {currentMobileItem ? (
            <p className="mt-3 text-base font-semibold text-text-primary">
              {currentMobileItem.label}
            </p>
          ) : null}
        </div>
      }
    >
      {renderSection(selectedMobileNavId)}
      {renderSettingsFooter()}
    </SettingsContent>
  ) : (
    <SettingsContent ref={contentRef} notice={syncNotice}>
      <SettingsSidebar
        items={navItems}
        activeItemId={activeNavId}
        onSelect={(id) => handleSelectNav(id as SettingsNavId)}
        ariaLabel={t("settings:pageTitle")}
        mode="list"
      />
      {renderSettingsFooter()}
    </SettingsContent>
  );

  return (
    <SettingsPageShell
      header={
        <AppPageHeader
          title={t("settings:pageTitle")}
          subtitle={t("common:status.lastUpdated", {
            time: formatTimestamp(updatedAt || null),
          })}
          badge={
            currentUser ? (
              <span className="hidden rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary sm:inline-flex">
                {resolveUserDisplayName(currentUser, {
                  allowLegacyFallback: true,
                })}
              </span>
            ) : null
          }
          meta={
            <div className="app-page-subtle inline-flex min-h-[var(--control-height-md)] items-center gap-1.5 rounded-full px-3 text-xs text-text-secondary">
              {isSyncing ? null : (
                <Cog6ToothIcon className="h-4 w-4" />
              )}
              {isSyncing ? (
                <Skeleton className="h-3 w-20" rounded="full" />
              ) : (
                <span>{t("common:status.idle")}</span>
              )}
            </div>
          }
          actions={
            <button
              type="button"
              onClick={resetSettings}
              className={clsx(
                "app-page-subtle min-h-[var(--control-height-md)] rounded-md px-3 text-xs font-medium",
                "text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              )}
            >
              {t("settings:resetAll")}
            </button>
          }
        />
      }
      sidebar={
        !isMobile ? (
          <SettingsSidebar
            items={navItems}
            activeItemId={activeNavId}
            onSelect={(id) => handleSelectNav(id as SettingsNavId)}
            heading={t("settings:pageTitle")}
            ariaLabel={t("settings:pageTitle")}
          />
        ) : undefined
      }
    >
      {isMobile ? (
        mobileContent
      ) : (
        <SettingsContent ref={contentRef} notice={syncNotice}>
          {renderSection(activeNavId)}
          {renderSettingsFooter()}
        </SettingsContent>
      )}
    </SettingsPageShell>
  );
};

export default SettingsPage;
