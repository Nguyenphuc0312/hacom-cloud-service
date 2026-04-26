/**
 * @fileoverview Notification settings section.
 */

import React from "react";
import {
  BellAlertIcon,
  ChatBubbleLeftRightIcon,
  SpeakerWaveIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { SettingsCard } from "./SettingsCard";
import { SettingsRow } from "./SettingsRow";
import { SettingsSection } from "./SettingsSection";
import { SettingsToggle } from "./SettingsToggle";
import { toast } from "../ui";
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
  const updateNotification = (
    patch: Partial<typeof notifications>,
    successMessage: string,
  ) => {
    update({ notifications: patch });
    toast.success(successMessage);
  };

  return (
    <SettingsSection
      id={id}
      title={t("notifications.title")}
      description={t("notifications.description")}
    >
      <SettingsCard bodyClassName="divide-y divide-border">
        <SettingsRow
          icon={<ChatBubbleLeftRightIcon className="h-4 w-4" />}
          label={t("notifications.enabled")}
          description={t("notifications.enabledDesc")}
          control={
            <SettingsToggle
              label={t("notifications.enabled")}
              checked={notifications.enabled}
              onChange={(value) =>
                updateNotification(
                  { enabled: value },
                  t("notifications.saved", {
                    defaultValue: "Đã cập nhật thông báo.",
                  }),
                )
              }
            />
          }
        />
        <SettingsRow
          icon={<SpeakerWaveIcon className="h-4 w-4" />}
          label={t("notifications.sound")}
          description={t("notifications.soundDesc")}
          control={
            <SettingsToggle
              label={t("notifications.sound")}
              checked={notifications.sound}
              onChange={(value) =>
                updateNotification(
                  { sound: value },
                  t("notifications.saved", {
                    defaultValue: "Đã cập nhật thông báo.",
                  }),
                )
              }
              disabled={!notifications.enabled}
            />
          }
        />
        <SettingsRow
          icon={<BellAlertIcon className="h-4 w-4" />}
          label={t("notifications.messagePreview")}
          description={t("notifications.messagePreviewDesc")}
          control={
            <SettingsToggle
              label={t("notifications.messagePreview")}
              checked={notifications.messagePreview}
              onChange={(value) =>
                updateNotification(
                  { messagePreview: value },
                  t("notifications.saved", {
                    defaultValue: "Đã cập nhật thông báo.",
                  }),
                )
              }
              disabled={!notifications.enabled}
            />
          }
        />
      </SettingsCard>
    </SettingsSection>
  );
};

export default NotificationSection;
