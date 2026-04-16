/**
 * @fileoverview Settings Page
 *
 * Desktop-first preferences center with lighter navigation and clearer scan paths.
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
  UserCircleIcon,
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
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const currentUser = useAuthStore((state) => state.user);

  useEffect(() => {
    if (isAuthenticated) {
      void syncFromServer();
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
      description: t("settings:profile.description", {
        defaultValue:
          "Personal details and how your account appears across the app.",
      }),
      icon: <UserCircleIcon className="h-4 w-4" />,
    },
    {
      id: "settings-notifications",
      label: t("settings:notifications.title"),
      description: t("settings:notifications.description"),
      icon: <BellIcon className="h-4 w-4" />,
    },
    {
      id: "settings-appearance-chat",
      label: t("settings:appearance.title"),
      description: t("settings:appearance.description"),
      icon: <PaintBrushIcon className="h-4 w-4" />,
    },
    {
      id: "settings-privacy-security",
      label: t("settings:privacy.title"),
      description: t("settings:privacy.description"),
      icon: <ShieldCheckIcon className="h-4 w-4" />,
    },
    {
      id: "settings-advanced",
      label: t("settings:dangerZone.title"),
      description: t("settings:dangerZone.description", {
        defaultValue: "Language, advanced preferences and destructive actions.",
      }),
      icon: <ChatBubbleLeftRightIcon className="h-4 w-4" />,
    },
  ];

  return (
    <div className="flex h-full flex-col bg-background">
      <header
        className={clsx(
          "sticky top-0 z-10 border-b border-border/70 bg-surface/95 backdrop-blur-sm",
          "supports-[backdrop-filter]:bg-surface/80",
        )}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => navigate(ROUTE_PATHS.CHAT)}
            className={clsx(
              "flex h-10 w-10 items-center justify-center rounded-xl",
              "text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            )}
            aria-label={t("common:actions.back")}
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-lg font-semibold text-text-primary">
                {t("pageTitle")}
              </h1>
              <span className="hidden rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary sm:inline-flex">
                {currentUser?.displayName || currentUser?.username || t("profile:pageTitle")}
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-text-secondary">
              {t("common:status.lastUpdated", {
                time: formatTimestamp(updatedAt || null),
              })}
            </p>
          </div>

          <div className="hidden min-h-9 items-center gap-1.5 rounded-full border border-border/70 bg-background/80 px-3 text-xs text-text-muted sm:inline-flex">
            {isSyncing ? (
              <ArrowPathIcon className="h-4 w-4 animate-spin" />
            ) : (
              <Cog6ToothIcon className="h-4 w-4" />
            )}
            <span>
              {isSyncing ? t("common:loading.syncing") : t("common:status.idle")}
            </span>
          </div>

          <button
            type="button"
            onClick={resetSettings}
            className={clsx(
              "rounded-xl border border-border/70 px-3 py-2 text-xs font-medium",
              "text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            )}
          >
            {t("resetAll")}
          </button>
        </div>
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
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
          <section className="rounded-[1.75rem] border border-border/70 bg-surface/95 p-4 shadow-xs sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                  {t("pageTitle")}
                </p>
                <div className="space-y-1">
                  <h2 className="text-xl font-semibold text-text-primary">
                    {t("profile:pageTitle", { defaultValue: "Profile" })},{" "}
                    {t("settings:notifications.title").toLowerCase()},
                    {" "}
                    {t("settings:appearance.title").toLowerCase()}
                  </h2>
                  <p className="max-w-2xl text-sm leading-6 text-text-secondary">
                    {t("settings:description", {
                      defaultValue:
                        "Keep your profile complete, review notifications, and adjust privacy or chat preferences without digging through dense admin-style menus.",
                    })}
                  </p>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                    {t("common:status.lastSynced", { time: "" }).trim()}
                  </p>
                  <p className="mt-1 text-sm font-medium text-text-primary">
                    {formatTimestamp(lastSyncedAt)}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                    {t("common:status.lastUpdated", { time: "" }).trim()}
                  </p>
                  <p className="mt-1 text-sm font-medium text-text-primary">
                    {formatTimestamp(updatedAt || null)}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                    {t("common:labels.sections", { defaultValue: "Sections" })}
                  </p>
                  <p className="mt-1 text-sm font-medium text-text-primary">
                    {navItems.length}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-1 xl:hidden">
              {navItems.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-2 text-xs font-medium text-text-secondary transition-micro hover:border-primary/30 hover:text-text-primary"
                >
                  {item.icon}
                  <span>{item.label}</span>
                </a>
              ))}
            </div>
          </section>

          <div className="mt-6 grid gap-6 xl:grid-cols-[17rem,minmax(0,1fr)]">
            <aside className="hidden xl:block">
              <div className="sticky top-24 rounded-[1.5rem] border border-border/70 bg-surface/95 p-3 shadow-xs">
                <div className="border-b border-border/60 px-3 pb-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                    {t("pageTitle")}
                  </p>
                  <p className="mt-1 text-sm text-text-secondary">
                    {t("common:status.lastSynced", {
                      time: formatTimestamp(lastSyncedAt),
                    })}
                  </p>
                </div>

                <nav className="mt-3 space-y-1.5">
                  {navItems.map((item) => (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      className="block rounded-[1rem] px-3 py-3 transition-micro hover:bg-surface-hover/80"
                    >
                      <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          {item.icon}
                        </span>
                        <span>{item.label}</span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-text-muted">
                        {item.description}
                      </p>
                    </a>
                  ))}
                </nav>
              </div>
            </aside>

            <div className="space-y-8">
              <section id="settings-profile" className="space-y-4 scroll-mt-24">
                <div className="space-y-1 px-1">
                  <h2 className="text-title text-text-primary">
                    {navItems[0]?.label}
                  </h2>
                  <p className="text-body-sm text-text-secondary">
                    {navItems[0]?.description}
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
                    {navItems[1]?.label}
                  </h2>
                  <p className="text-body-sm text-text-secondary">
                    {navItems[1]?.description}
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
                    {navItems[2]?.label}
                  </h2>
                  <p className="text-body-sm text-text-secondary">
                    {navItems[2]?.description}
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
                    {navItems[3]?.label}
                  </h2>
                  <p className="text-body-sm text-text-secondary">
                    {navItems[3]?.description}
                  </p>
                </div>
                <PrivacySection />
                <SecuritySection />
                <BlockedUsersSection />
              </section>

              <section id="settings-advanced" className="space-y-4 scroll-mt-24">
                <div className="space-y-1 px-1">
                  <h2 className="text-title text-text-primary">
                    {navItems[4]?.label}
                  </h2>
                  <p className="text-body-sm text-text-secondary">
                    {navItems[4]?.description}
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
        </div>
      </main>
    </div>
  );
};

export default SettingsPage;
