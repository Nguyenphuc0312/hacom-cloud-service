/**
 * @fileoverview Settings page with a dedicated settings shell.
 */

import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  BellIcon,
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  ExclamationTriangleIcon,
  GlobeAltIcon,
  LifebuoyIcon,
  NoSymbolIcon,
  PaintBrushIcon,
  ShieldCheckIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import {
  AppearanceSection,
  BlockedUsersSection,
  ChatSection,
  DangerZoneSection,
  HelpSection,
  LanguageSection,
  NotificationSection,
  PrivacySection,
  SecuritySection,
  SettingsContent,
  SettingsPageShell,
  SettingsSidebar,
  type SettingsSidebarGroup,
  type SettingsSidebarItem,
} from "../components/settings";
import { AppPageHeader } from "../components/layout/AppPage";
import { InlineNotice } from "../components/ui";
import { ProfileSettingsSection } from "../features/profile/components/ProfileSettingsSection";
import { ROUTE_PATHS } from "../router/paths";
import { useSettings } from "../settings";
import { useAuthStore } from "../stores";
import { resolveUserDisplayName } from "../features/chat/identity/resolveUserDisplayName";

const MOBILE_MEDIA_QUERY = "(max-width: 767px)";

const NAV_TARGETS = {
  profile: "settings-profile",
  notifications: "settings-notifications",
  appearance: "settings-appearance",
  privacy: "settings-privacy",
  chatData: "settings-chat",
  language: "settings-language",
  securityDevices: "settings-security",
  blockedUsers: "settings-blocked-users",
  help: "settings-help",
  danger: "settings-danger",
} as const;

type SettingsNavId = keyof typeof NAV_TARGETS;

const SECTION_TO_NAV: Record<string, SettingsNavId> = {
  "settings-profile": "profile",
  "settings-notifications": "notifications",
  "settings-appearance": "appearance",
  "settings-privacy": "privacy",
  "settings-chat": "chatData",
  "settings-language": "language",
  "settings-security": "securityDevices",
  "settings-blocked-users": "blockedUsers",
  "settings-help": "help",
  "settings-danger": "danger",
};

const OBSERVED_SECTION_IDS = Object.keys(SECTION_TO_NAV);
const DEFAULT_NAV_ID: SettingsNavId = "profile";

const readHashTargetId = () => {
  if (typeof window === "undefined") {
    return null;
  }

  const hash = window.location.hash.replace(/^#/, "").trim();
  return hash || null;
};

const resolveNavIdFromTarget = (
  targetId: string | null,
): SettingsNavId | null => {
  if (!targetId) {
    return null;
  }

  return SECTION_TO_NAV[targetId] ?? null;
};

const replaceHash = (targetId: string | null) => {
  if (typeof window === "undefined") {
    return;
  }

  const nextHash = targetId ? `#${targetId}` : "";
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}${nextHash}`,
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

  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
  });
  const [activeNavId, setActiveNavId] = useState<SettingsNavId>(() => {
    return resolveNavIdFromTarget(readHashTargetId()) ?? DEFAULT_NAV_ID;
  });
  const [selectedMobileNavId, setSelectedMobileNavId] =
    useState<SettingsNavId | null>(() => {
      if (
        typeof window !== "undefined" &&
        window.matchMedia(MOBILE_MEDIA_QUERY).matches
      ) {
        return resolveNavIdFromTarget(readHashTargetId());
      }

      return null;
    });

  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      void syncFromServer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
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

    setIsMobile(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  useEffect(() => {
    const navFromHash = resolveNavIdFromTarget(readHashTargetId());
    if (!navFromHash) {
      return;
    }

    setActiveNavId(navFromHash);
    if (isMobile) {
      setSelectedMobileNavId(navFromHash);
    }
  }, [isMobile]);

  useEffect(() => {
    if (isMobile) {
      return;
    }

    const navFromHash = resolveNavIdFromTarget(readHashTargetId());
    if (!navFromHash) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      scrollToNavItem(navFromHash, "auto");
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isMobile]);

  useEffect(() => {
    if (
      !contentRef.current ||
      isMobile ||
      typeof IntersectionObserver === "undefined"
    ) {
      return undefined;
    }

    const root = contentRef.current;
    const visibleEntries = new Map<string, IntersectionObserverEntry>();

    const resolveMostVisibleNav = () => {
      const nextEntry = Array.from(visibleEntries.values()).sort(
        (left, right) => {
          if (right.intersectionRatio !== left.intersectionRatio) {
            return right.intersectionRatio - left.intersectionRatio;
          }

          return left.boundingClientRect.top - right.boundingClientRect.top;
        },
      )[0];

      const nextNavId = nextEntry
        ? SECTION_TO_NAV[(nextEntry.target as HTMLElement).id]
        : null;

      if (nextNavId) {
        setActiveNavId(nextNavId);
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const entryId = (entry.target as HTMLElement).id;
          if (!entryId) {
            return;
          }

          if (entry.isIntersecting) {
            visibleEntries.set(entryId, entry);
          } else {
            visibleEntries.delete(entryId);
          }
        });

        resolveMostVisibleNav();
      },
      {
        root,
        rootMargin: "-14% 0px -55% 0px",
        threshold: [0.2, 0.45, 0.7],
      },
    );

    OBSERVED_SECTION_IDS.forEach((sectionId) => {
      const element = document.getElementById(sectionId);
      if (element && root.contains(element)) {
        observer.observe(element);
      }
    });

    return () => observer.disconnect();
  }, [isMobile]);

  useEffect(() => {
    if (isMobile || !selectedMobileNavId) {
      return;
    }

    const root = contentRef.current;
    const targetId = NAV_TARGETS[selectedMobileNavId];
    const element = root?.querySelector<HTMLElement>(`#${targetId}`);
    if (element) {
      element.scrollIntoView({ behavior: "auto", block: "start" });
    }
    setSelectedMobileNavId(null);
  }, [isMobile, selectedMobileNavId]);

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
      label: t("profile:pageTitle", { defaultValue: "Hồ sơ cá nhân" }),
      description: t("settings:profile.description", {
        defaultValue: "Thông tin hiển thị và liên hệ.",
      }),
      icon: <UserCircleIcon className="h-4 w-4" />,
    },
    {
      navId: "notifications",
      id: "notifications",
      label: t("settings:notifications.title"),
      description: t("settings:notifications.navDescription", {
        defaultValue: "Tin nhắn, âm thanh, xem trước.",
      }),
      icon: <BellIcon className="h-4 w-4" />,
    },
    {
      navId: "appearance",
      id: "appearance",
      label: t("settings:appearance.title"),
      description: t("settings:appearance.navDescription", {
        defaultValue: "Chủ đề, cỡ chữ, mật độ.",
      }),
      icon: <PaintBrushIcon className="h-4 w-4" />,
    },
    {
      navId: "privacy",
      id: "privacy",
      label: t("settings:privacy.title"),
      description: t("settings:privacy.navDescription", {
        defaultValue: "Trạng thái, đã đọc, tìm kiếm.",
      }),
      icon: <ShieldCheckIcon className="h-4 w-4" />,
    },
    {
      navId: "chatData",
      id: "chatData",
      label: t("settings:chatData.title", {
        defaultValue: "Chat & data",
      }),
      icon: <ChatBubbleLeftRightIcon className="h-4 w-4" />,
    },
    {
      navId: "language",
      id: "language",
      label: t("settings:language.title"),
      description: t("settings:language.navDescription", {
        defaultValue: "Ngôn ngữ và định dạng hiển thị.",
      }),
      icon: <GlobeAltIcon className="h-4 w-4" />,
    },
    {
      navId: "securityDevices",
      id: "securityDevices",
      label: t("settings:securityDevices.title", {
        defaultValue: "Security & devices",
      }),
      icon: <ShieldCheckIcon className="h-4 w-4" />,
    },
    {
      navId: "blockedUsers",
      id: "blockedUsers",
      label: t("settings:blockedUsers.title"),
      description: t("settings:blockedUsers.navDescription", {
        defaultValue: "Danh sách người dùng đã chặn.",
      }),
      icon: <NoSymbolIcon className="h-4 w-4" />,
    },
    {
      navId: "help",
      id: "help",
      label: t("settings:help.title", { defaultValue: "Hỗ trợ" }),
      description: t("settings:help.navDescription", {
        defaultValue: "Trợ giúp, báo lỗi, chính sách.",
      }),
      icon: <LifebuoyIcon className="h-4 w-4" />,
    },
    {
      navId: "danger",
      id: "danger",
      label: t("settings:dangerZone.title"),
      icon: <ExclamationTriangleIcon className="h-4 w-4" />,
    },
  ];

  const navGroups: SettingsSidebarGroup[] = [
    {
      id: "account",
      label: "Tài khoản",
      items: navItems.filter((item) => item.navId === "profile"),
    },
    {
      id: "messages",
      label: "Tin nhắn & Thông báo",
      items: navItems.filter((item) =>
        ["notifications", "chatData"].includes(item.navId),
      ),
    },
    {
      id: "privacy-security",
      label: "Quyền riêng tư & Bảo mật",
      items: navItems.filter((item) =>
        ["privacy", "securityDevices", "blockedUsers"].includes(item.navId),
      ),
    },
    {
      id: "appearance",
      label: "Giao diện",
      items: navItems.filter((item) =>
        ["appearance", "language"].includes(item.navId),
      ),
    },
    {
      id: "support",
      label: "Hỗ trợ",
      items: navItems.filter((item) => ["help", "danger"].includes(item.navId)),
    },
  ];

  const handleRetrySync = () => {
    void syncFromServer();
  };

  const scrollToNavItem = (navId: SettingsNavId, behavior: ScrollBehavior) => {
    const root = contentRef.current;
    const targetId = NAV_TARGETS[navId];
    const element = root?.querySelector<HTMLElement>(`#${targetId}`);
    if (element) {
      element.scrollIntoView({ behavior, block: "start" });
      setActiveNavId(navId);
      replaceHash(targetId);
    }
  };

  const handleSelectNav = (navId: SettingsNavId) => {
    if (isMobile) {
      setActiveNavId(navId);
      setSelectedMobileNavId(navId);
      replaceHash(NAV_TARGETS[navId]);
      return;
    }

    scrollToNavItem(navId, "smooth");
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
    <div className="border-t border-border/60 pt-5 text-sm text-text-muted">
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

  const renderDesktopSections = () => (
    <>
      <ProfileSettingsSection id="settings-profile" />
      <NotificationSection id="settings-notifications" />
      <AppearanceSection id="settings-appearance" />
      <PrivacySection id="settings-privacy" />
      <ChatSection id="settings-chat" />
      <LanguageSection id="settings-language" />
      <SecuritySection id="settings-security" />
      <BlockedUsersSection id="settings-blocked-users" />
      <HelpSection id="settings-help" />
      <DangerZoneSection id="settings-danger" />
      {renderSettingsFooter()}
    </>
  );

  const renderMobileDetail = (navId: SettingsNavId | null) => {
    switch (navId) {
      case "profile":
        return (
          <>
            <ProfileSettingsSection id="settings-profile" />
            {renderSettingsFooter()}
          </>
        );
      case "notifications":
        return (
          <>
            <NotificationSection id="settings-notifications" />
            {renderSettingsFooter()}
          </>
        );
      case "appearance":
        return (
          <>
            <AppearanceSection id="settings-appearance" />
            {renderSettingsFooter()}
          </>
        );
      case "privacy":
        return (
          <>
            <PrivacySection id="settings-privacy" />
            {renderSettingsFooter()}
          </>
        );
      case "chatData":
        return (
          <>
            <ChatSection id="settings-chat" />
            {renderSettingsFooter()}
          </>
        );
      case "language":
        return (
          <>
            <LanguageSection id="settings-language" />
            {renderSettingsFooter()}
          </>
        );
      case "securityDevices":
        return (
          <>
            <SecuritySection id="settings-security" />
            {renderSettingsFooter()}
          </>
        );
      case "blockedUsers":
        return (
          <>
            <BlockedUsersSection id="settings-blocked-users" />
            {renderSettingsFooter()}
          </>
        );
      case "help":
        return (
          <>
            <HelpSection id="settings-help" />
            {renderSettingsFooter()}
          </>
        );
      case "danger":
        return (
          <>
            <DangerZoneSection id="settings-danger" />
            {renderSettingsFooter()}
          </>
        );
      default:
        return renderSettingsFooter();
    }
  };

  const mobileContent = selectedMobileNavId ? (
    <SettingsContent
      ref={contentRef}
      notice={syncNotice}
      header={
        <div className="border-b border-border/60 pb-4">
          <button
            type="button"
            onClick={handleMobileBack}
            className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium text-text-secondary transition-micro hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            {t("common:actions.back")}
          </button>
          {currentMobileItem ? (
            <div className="mt-3">
              <p className="text-sm font-semibold text-text-primary">
                {currentMobileItem.label}
              </p>
              {currentMobileItem.description ? (
                <p className="mt-1 text-sm text-text-secondary">
                  {currentMobileItem.description}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      }
    >
      {renderMobileDetail(selectedMobileNavId)}
    </SettingsContent>
  ) : (
    <SettingsContent ref={contentRef} notice={syncNotice}>
      <SettingsSidebar
        items={navItems}
        groups={navGroups}
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
          onBack={() => navigate(ROUTE_PATHS.CHAT)}
          backLabel={t("common:actions.back")}
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
            <div className="app-page-subtle inline-flex min-h-[var(--control-height-md)] items-center gap-1.5 rounded-full px-3 text-xs text-text-muted">
              {isSyncing ? (
                <ArrowPathIcon className="h-4 w-4 animate-spin" />
              ) : (
                <Cog6ToothIcon className="h-4 w-4" />
              )}
              <span>
                {isSyncing
                  ? t("common:loading.syncing")
                  : t("common:status.idle")}
              </span>
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
            groups={navGroups}
            activeItemId={activeNavId}
            onSelect={(id) => handleSelectNav(id as SettingsNavId)}
            heading={t("settings:pageTitle")}
            meta={t("common:status.lastSynced", {
              time: formatTimestamp(lastSyncedAt),
            })}
            ariaLabel={t("settings:pageTitle")}
          />
        ) : undefined
      }
    >
      {isMobile ? (
        mobileContent
      ) : (
        <SettingsContent ref={contentRef} notice={syncNotice}>
          {renderDesktopSections()}
        </SettingsContent>
      )}
    </SettingsPageShell>
  );
};

export default SettingsPage;
