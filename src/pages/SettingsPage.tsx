/**
 * @fileoverview Settings Page
 *
 * Top-level page that renders all settings sections in a scrollable view.
 * Refactored into a desktop-first preferences center with sticky section nav.
 */

import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  BellIcon,
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  PaintBrushIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import {
  AppearanceSection,
  NotificationSection,
  PrivacySection,
  ChatSection,
  LanguageSection,
  SecuritySection,
  DangerZoneSection,
  BlockedUsersSection,
} from "../components/settings";
import { InlineNotice, StateBlock } from "../components/ui";
import { useSettings } from "../settings";
import { useAuthStore } from "../stores";
import { ROUTE_PATHS } from "../router/paths";
import { ProfileSettingsSection } from "../features/profile/components/ProfileSettingsSection";

const SettingsPage: React.FC = () => {
  const { t } = useTranslation(["settings", "common", "profile"]);
  const navigate = useNavigate();
  const {
    syncFromServer,
    resetSettings,
    isSyncing,
    syncError,
    lastSyncedAt,
    updatedAt,
  } = useSettings();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) {
      syncFromServer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const handleRetrySync = () => {
    void syncFromServer();
  };

  const formatTimestamp = (value: string | null) => {
    if (!value) {
      return t("common:status.unknown");
    }

    return new Date(value).toLocaleString();
  };

  const navItems = [
    {
      id: "settings-profile",
      label: t("profile:pageTitle", { defaultValue: "Profile" }),
      icon: <Cog6ToothIcon className="h-4 w-4" />,
    },
    {
      id: "settings-notifications",
      label: t("settings:notifications.title"),
      icon: <BellIcon className="h-4 w-4" />,
    },
    {
      id: "settings-appearance-chat",
      label: t("settings:appearance.title"),
      icon: <PaintBrushIcon className="h-4 w-4" />,
    },
    {
      id: "settings-privacy-security",
      label: t("settings:privacy.title"),
      icon: <ShieldCheckIcon className="h-4 w-4" />,
    },
    {
      id: "settings-advanced",
      label: t("settings:dangerZone.title"),
      icon: <ChatBubbleLeftRightIcon className="h-4 w-4" />,
    },
  ];

  return (
    <div className="flex h-full flex-col bg-background">
      <header
        className={clsx(
          "sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-surface px-4 py-3",
          "backdrop-blur-sm supports-[backdrop-filter]:bg-surface/80",
        )}
      >
        <button
          type="button"
          onClick={() => navigate(ROUTE_PATHS.CHAT)}
          className={clsx(
            "flex h-9 w-9 items-center justify-center rounded-lg",
            "text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          )}
          aria-label={t("common:actions.back")}
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold text-text-primary">
            {t("pageTitle")}
          </h1>
          <p className="text-xs text-text-secondary">
            {t("common:status.lastUpdated", {
              time: formatTimestamp(updatedAt || null),
            })}
          </p>
        </div>

        <div className="inline-flex min-h-5 items-center gap-1.5 text-xs text-text-muted">
          {isSyncing && <ArrowPathIcon className="h-4 w-4 animate-spin" />}
          <span>
            {isSyncing ? t("common:loading.syncing") : t("common:status.idle")}
          </span>
        </div>

        <button
          type="button"
          onClick={resetSettings}
          className={clsx(
            "rounded-lg px-3 py-1.5 text-xs font-medium",
            "text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          )}
        >
          {t("resetAll")}
        </button>
      </header>

      {syncError && (
        <div className="border-b border-border/60 px-4 py-3 sm:px-6">
          <div className="mx-auto max-w-6xl">
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
                    isSyncing
                      ? "cursor-not-allowed opacity-60"
                      : "hover:bg-danger/10",
                  )}
                >
                  {t("common:actions.retry")}
                </button>
              }
            />
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-5 sm:px-6 xl:grid-cols-[15rem,minmax(0,1fr)]">
          <aside className="hidden xl:block">
            <div className="sticky top-24 app-shell-section space-y-2 p-3">
              <div className="px-2 pb-1">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                  {t("pageTitle")}
                </p>
                <p className="mt-1 text-sm text-text-secondary">
                  {t("common:status.lastSynced", {
                    time: formatTimestamp(lastSyncedAt),
                  })}
                </p>
              </div>
              {navItems.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="flex items-center gap-2 rounded-[1rem] px-3 py-2.5 text-body-sm font-medium text-text-secondary transition-micro hover:bg-surface-hover hover:text-text-primary"
                >
                  {item.icon}
                  <span>{item.label}</span>
                </a>
              ))}
            </div>
          </aside>

          <div className="space-y-8">
            <section id="settings-profile" className="space-y-4 scroll-mt-24">
              <div className="space-y-1 px-1">
                <h2 className="text-title text-text-primary">
                  {t("profile:pageTitle", { defaultValue: "Profile" })}
                </h2>
                <p className="text-body-sm text-text-secondary">
                  {t("settings:profile.description", {
                    defaultValue:
                      "Personal details and how your account appears across the app.",
                  })}
                </p>
              </div>
              <ProfileSettingsSection />
            </section>

            <section
              id="settings-notifications"
              className="space-y-4 scroll-mt-24"
            >
              <div className="space-y-1 px-1">
                <h2 className="text-title text-text-primary">
                  {t("settings:notifications.title")}
                </h2>
                <p className="text-body-sm text-text-secondary">
                  {t("settings:notifications.description")}
                </p>
              </div>
              <NotificationSection />
            </section>

            <section
              id="settings-appearance-chat"
              className="space-y-4 scroll-mt-24"
            >
              <div className="space-y-1 px-1">
                <h2 className="text-title text-text-primary">
                  {t("settings:appearance.title")}
                </h2>
                <p className="text-body-sm text-text-secondary">
                  {t("settings:appearance.description")}
                </p>
              </div>
              <AppearanceSection />
              <ChatSection />
            </section>

            <section
              id="settings-privacy-security"
              className="space-y-4 scroll-mt-24"
            >
              <div className="space-y-1 px-1">
                <h2 className="text-title text-text-primary">
                  {t("settings:privacy.title")}
                </h2>
                <p className="text-body-sm text-text-secondary">
                  {t("settings:privacy.description")}
                </p>
              </div>
              <PrivacySection />
              <SecuritySection />
              <BlockedUsersSection />
            </section>

            <section id="settings-advanced" className="space-y-4 scroll-mt-24">
              <div className="space-y-1 px-1">
                <h2 className="text-title text-text-primary">
                  {t("settings:dangerZone.title")}
                </h2>
                <p className="text-body-sm text-text-secondary">
                  {t("settings:dangerZone.description", {
                    defaultValue:
                      "Language, advanced preferences and destructive actions.",
                  })}
                </p>
              </div>
              <LanguageSection />
              <DangerZoneSection />
            </section>

            <StateBlock
              title={t("version", { version: 2 })}
              description={`${t("common:status.lastSynced", {
                time: formatTimestamp(lastSyncedAt),
              })} - ${t("common:status.lastUpdated", {
                time: formatTimestamp(updatedAt || null),
              })}`}
              className="border-dashed bg-transparent shadow-none"
            />
          </div>
        </div>
      </main>
    </div>
  );
};

export default SettingsPage;
