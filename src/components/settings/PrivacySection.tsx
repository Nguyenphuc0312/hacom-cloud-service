/**
 * @fileoverview Privacy Settings sub-section
 */

import React from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheckIcon } from "@heroicons/react/24/outline";
import { SettingsSection } from "./SettingsSection";
import { ToggleSwitch } from "./ToggleSwitch";
import { useSettingsSection, useUpdateSettings } from "../../settings";

export const PrivacySection: React.FC = () => {
  const { t } = useTranslation("settings");
  const privacy = useSettingsSection("privacy");
  const update = useUpdateSettings();

  return (
    <SettingsSection
      icon={<ShieldCheckIcon className="h-5 w-5" />}
      title={t("privacy.title")}
      description={t("privacy.description")}
    >
      <ToggleSwitch
        label={t("privacy.showOnlineStatus")}
        description={t("privacy.showOnlineStatusDesc")}
        checked={privacy.showOnlineStatus}
        onChange={(v) => update({ privacy: { showOnlineStatus: v } })}
      />

      <ToggleSwitch
        label={t("privacy.readReceipts")}
        description={t("privacy.readReceiptsDesc")}
        checked={privacy.readReceipts}
        onChange={(v) => update({ privacy: { readReceipts: v } })}
      />

      <ToggleSwitch
        label={t("privacy.allowStrangers")}
        description={t("privacy.allowStrangersDesc")}
        checked={privacy.allowStrangersMessage}
        onChange={(v) => update({ privacy: { allowStrangersMessage: v } })}
      />
    </SettingsSection>
  );
};

export default PrivacySection;
