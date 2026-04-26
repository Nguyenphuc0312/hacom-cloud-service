/**
 * @fileoverview Privacy settings section.
 */

import React from "react";
import { useTranslation } from "react-i18next";
import { SettingsCard } from "./SettingsCard";
import { SettingsRow } from "./SettingsRow";
import { SettingsSection } from "./SettingsSection";
import { SettingsToggle } from "./SettingsToggle";
import { toast } from "../ui";
import { useSettingsSection, useUpdateSettings } from "../../settings";

interface PrivacySectionProps {
  id?: string;
}

export const PrivacySection: React.FC<PrivacySectionProps> = ({ id }) => {
  const { t } = useTranslation("settings");
  const privacy = useSettingsSection("privacy");
  const update = useUpdateSettings();
  const updatePrivacy = (
    patch: Partial<typeof privacy>,
    successMessage: string,
  ) => {
    update({ privacy: patch });
    toast.success(successMessage);
  };

  return (
    <SettingsSection
      id={id}
      title={t("privacy.title")}
      description={t("privacy.description")}
    >
      <SettingsCard bodyClassName="divide-y divide-border">
        <SettingsRow
          label={t("privacy.showOnlineStatus")}
          description={t("privacy.showOnlineStatusProjectedDesc", {
            defaultValue:
              "Được quản lý bởi chính sách riêng tư dùng chung. Tắt để ẩn trạng thái trực tuyến của bạn.",
          })}
          control={
            <SettingsToggle
              label={t("privacy.showOnlineStatus")}
              checked={privacy.showOnlineStatus}
              onChange={(value) =>
                updatePrivacy(
                  { showOnlineStatus: value },
                  t("privacy.saved", {
                    defaultValue: "Đã cập nhật quyền riêng tư.",
                  }),
                )
              }
            />
          }
        />
        <SettingsRow
          label={t("privacy.readReceipts")}
          description={t("privacy.readReceiptsDesc")}
          control={
            <SettingsToggle
              label={t("privacy.readReceipts")}
              checked={privacy.readReceipts}
              onChange={(value) =>
                updatePrivacy(
                  { readReceipts: value },
                  t("privacy.saved", {
                    defaultValue: "Đã cập nhật quyền riêng tư.",
                  }),
                )
              }
            />
          }
        />
        <SettingsRow
          label={t("privacy.allowStrangers")}
          description={t("privacy.allowStrangersDeprecatedDesc", {
            defaultValue:
              "Trường tương thích cũ. Tin nhắn trực tiếp hiện yêu cầu hai bên là bạn bè.",
          })}
          control={
            <SettingsToggle
              label={t("privacy.allowStrangers")}
              checked={privacy.allowStrangersMessage}
              onChange={() => {}}
              disabled
            />
          }
        />
      </SettingsCard>
    </SettingsSection>
  );
};

export default PrivacySection;
