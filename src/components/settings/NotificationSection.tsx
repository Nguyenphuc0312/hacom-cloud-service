/**
 * @fileoverview Notification Settings sub-section
 */

import React from "react";
import { useTranslation } from "react-i18next";
import { BellIcon } from "@heroicons/react/24/outline";
import { SettingsSection } from "./SettingsSection";
import { ToggleSwitch } from "./ToggleSwitch";
import { useSettingsSection, useUpdateSettings } from "../../settings";

export const NotificationSection: React.FC = () => {
  const { t } = useTranslation("settings");
  const notifications = useSettingsSection("notifications");
  const update = useUpdateSettings();

  return (
    <SettingsSection
      icon={<BellIcon className="h-5 w-5" />}
      title={t("notifications.title")}
      description={t("notifications.description")}
    >
      <ToggleSwitch
        label={t("notifications.enabled")}
        description={t("notifications.enabledDesc")}
        checked={notifications.enabled}
        onChange={(v) => update({ notifications: { enabled: v } })}
      />

      <ToggleSwitch
        label={t("notifications.sound")}
        description={t("notifications.soundDesc")}
        checked={notifications.sound}
        onChange={(v) => update({ notifications: { sound: v } })}
        disabled={!notifications.enabled}
      />

      <ToggleSwitch
        label={t("notifications.messagePreview")}
        description={t("notifications.messagePreviewDesc")}
        checked={notifications.messagePreview}
        onChange={(v) => update({ notifications: { messagePreview: v } })}
        disabled={!notifications.enabled}
      />
    </SettingsSection>
  );
};

export default NotificationSection;
