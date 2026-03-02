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
import { ArrowLeftIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import {
  AppearanceSection,
  NotificationSection,
  PrivacySection,
  ChatSection,
  LanguageSection,
} from "../components/settings";
import { useSettings } from "../settings";
import { useAuthStore } from "../stores";
import { ROUTE_PATHS } from "../router/paths";

const SettingsPage: React.FC = () => {
  const { t } = useTranslation("settings");
  const navigate = useNavigate();
  const { syncFromServer, resetSettings, isSyncing } = useSettings();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Sync settings from server on mount (if logged in)
  useEffect(() => {
    if (isAuthenticated) {
      syncFromServer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

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
          aria-label={t("common.actions.back")}
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </button>

        <h1 className="flex-1 text-lg font-semibold text-text-primary">
          {t("pageTitle")}
        </h1>

        {/* Sync indicator */}
        {isSyncing && (
          <ArrowPathIcon className="h-5 w-5 animate-spin text-text-muted" />
        )}

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

      {/* ───── Content ───── */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-4 px-4 py-5 sm:px-6">
          <LanguageSection />
          <AppearanceSection />
          <NotificationSection />
          <PrivacySection />
          <ChatSection />

          {/* Version info */}
          <p className="pb-6 text-center text-xs text-text-muted">
            {t("version", { version: 2 })}
          </p>
        </div>
      </main>
    </div>
  );
};

export default SettingsPage;
