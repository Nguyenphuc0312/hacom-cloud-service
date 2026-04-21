/**
 * @fileoverview Privacy settings section.
 */

import React from "react";
import { useTranslation } from "react-i18next";
import { SettingsFieldGroup } from "./SettingsFieldGroup";
import { SettingsSection } from "./SettingsSection";
import { ToggleSwitch } from "./ToggleSwitch";
import { useSettingsSection, useUpdateSettings } from "../../settings";

interface PrivacySectionProps {
  id?: string;
}

export const PrivacySection: React.FC<PrivacySectionProps> = ({ id }) => {
  const { t } = useTranslation("settings");
  const privacy = useSettingsSection("privacy");
  const update = useUpdateSettings();

  return (
    <SettingsSection
      id={id}
      title={t("privacy.title")}
      description={t("privacy.description")}
    >
      <SettingsFieldGroup contentClassName="divide-y divide-border/60">
        <ToggleSwitch
          label={t("privacy.showOnlineStatus")}
          description={t("privacy.showOnlineStatusProjectedDesc", {
            defaultValue:
              "Managed by your shared chat privacy policy. Turn off to hide when you are online.",
          })}
          checked={privacy.showOnlineStatus}
          onChange={(value) => update({ privacy: { showOnlineStatus: value } })}
          className="rounded-none px-0 py-4"
        />
        <ToggleSwitch
          label={t("privacy.readReceipts")}
          description={t("privacy.readReceiptsDesc")}
          checked={privacy.readReceipts}
          onChange={(value) => update({ privacy: { readReceipts: value } })}
          className="rounded-none px-0 py-4"
        />
        <ToggleSwitch
          label={t("privacy.allowStrangers")}
          description={t("privacy.allowStrangersDeprecatedDesc", {
            defaultValue:
              "Deprecated compatibility field. Direct messages now require friendship.",
          })}
          checked={privacy.allowStrangersMessage}
          onChange={() => {}}
          disabled
          className="rounded-none px-0 py-4"
        />
      </SettingsFieldGroup>
    </SettingsSection>
  );
};

export default PrivacySection;
