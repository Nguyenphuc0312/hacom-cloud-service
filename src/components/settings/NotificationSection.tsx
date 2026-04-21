/**
 * @fileoverview Notification settings section.
 */

import React from "react";
import { useTranslation } from "react-i18next";
import { SettingsFieldGroup } from "./SettingsFieldGroup";
import { SettingsSection } from "./SettingsSection";
import { ToggleSwitch } from "./ToggleSwitch";
import { useSettingsSection, useUpdateSettings } from "../../settings";

interface NotificationSectionProps {
  id?: string;
}

export const NotificationSection: React.FC<NotificationSectionProps> = ({
  id,
}) => {
  const { t } = useTranslation("settings");
  const notifications = useSettingsSection("notifications");
  const update = useUpdateSettings();

  return (
    <SettingsSection
      id={id}
      title={t("notifications.title")}
      description={t("notifications.description")}
    >
      <SettingsFieldGroup contentClassName="divide-y divide-border/60">
        <ToggleSwitch
          label={t("notifications.enabled")}
          description={t("notifications.enabledDesc")}
          checked={notifications.enabled}
          onChange={(value) => update({ notifications: { enabled: value } })}
          className="rounded-none px-0 py-4"
        />
        <ToggleSwitch
          label={t("notifications.sound")}
          description={t("notifications.soundDesc")}
          checked={notifications.sound}
          onChange={(value) => update({ notifications: { sound: value } })}
          disabled={!notifications.enabled}
          className="rounded-none px-0 py-4"
        />
        <ToggleSwitch
          label={t("notifications.messagePreview")}
          description={t("notifications.messagePreviewDesc")}
          checked={notifications.messagePreview}
          onChange={(value) =>
            update({ notifications: { messagePreview: value } })
          }
          disabled={!notifications.enabled}
          className="rounded-none px-0 py-4"
        />
      </SettingsFieldGroup>
    </SettingsSection>
  );
};

export default NotificationSection;
