/**
 * @fileoverview Settings Page
 *
 * Top-level page that renders all settings sections in a scrollable view.
 * Zalo-like layout: single-column, stacked sections with back button.
 * Syncs from server on mount when authenticated.
 */

import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
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
import { useSettings } from "../settings";
import { useAuthStore } from "../stores";
import { ROUTE_PATHS } from "../router/paths";
import { ProfileSettingsSection } from "../features/profile/components/ProfileSettingsSection";

const SettingsPage: React.FC = () => {
  const { t } = useTranslation(["settings", "common"]);
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

  // Sync settings from server on mount (if logged in)
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

  return (
    <div className="flex h-full flex-col bg-background">
      {/* ───── Header ───── */}
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

        <h1 className="flex-1 text-lg font-semibold text-text-primary">
          {t("pageTitle")}
        </h1>

        {/* Sync indicator */}
        <div className="inline-flex min-h-5 items-center gap-1.5 text-xs text-text-muted">
          {isSyncing && <ArrowPathIcon className="h-4 w-4 animate-spin" />}
          <span>
            {isSyncing ? t("common:loading.syncing") : t("common:status.idle")}
          </span>
        </div>

        {/* Reset button */}
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
        <div className="border-b border-danger/20 bg-danger/10 px-4 py-3 sm:px-6">
          <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-2 text-sm text-danger">
            <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
            <span className="flex-1">
              {syncError || t("common:error.syncFailed")}
            </span>
            <button
              type="button"
              onClick={handleRetrySync}
              disabled={isSyncing}
              className={clsx(
                "rounded-md border border-danger/30 px-2.5 py-1 text-xs font-semibold",
                "transition-colors",
                isSyncing
                  ? "cursor-not-allowed opacity-60"
                  : "hover:bg-danger/10",
              )}
            >
              {t("common:actions.retry")}
            </button>
          </div>
        </div>
      )}

      {/* ───── Content ───── */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-4 px-4 py-5 sm:px-6">
          <ProfileSettingsSection />
          <LanguageSection />
          <AppearanceSection />
          <NotificationSection />
          <PrivacySection />
          <ChatSection />
          <SecuritySection />
          <BlockedUsersSection />
          <DangerZoneSection />

          {/* Version info */}
          <div className="pb-6 text-center text-xs text-text-muted">
            <p>{t("version", { version: 2 })}</p>
            <p className="mt-1">
              {t("common:status.lastSynced", {
                time: formatTimestamp(lastSyncedAt),
              })}
            </p>
            <p className="mt-1">
              {t("common:status.lastUpdated", {
                time: formatTimestamp(updatedAt || null),
              })}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default SettingsPage;
