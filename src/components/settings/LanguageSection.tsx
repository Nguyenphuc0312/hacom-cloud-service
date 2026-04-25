/**
 * @fileoverview Language settings section.
 */

import React from "react";
import { useTranslation } from "react-i18next";
import { RadioGroup } from "./RadioGroup";
import { SettingsFieldGroup } from "./SettingsFieldGroup";
import { SettingsSection } from "./SettingsSection";
import { useSettingsStore } from "../../settings/settingsStore";
import type { LanguageCode } from "../../settings/types";

interface LanguageSectionProps {
  id?: string;
}

export const LanguageSection: React.FC<LanguageSectionProps> = ({ id }) => {
  const { t } = useTranslation("settings");
  const language = useSettingsStore((state) => state.language);
  const updateSettings = useSettingsStore((state) => state.updateSettings);

  const languageOptions: Array<{
    value: LanguageCode;
    label: string;
    description?: string;
  }> = [
    {
      value: "vi",
      label: t("language.vi"),
    },
    {
      value: "en",
      label: t("language.en"),
    },
    {
      value: "system",
      label: t("language.system"),
      description: t("language.systemDesc"),
    },
  ];

  return (
    <SettingsSection
      id={id}
      title={t("language.title")}
      description={t("language.description")}
    >
      <SettingsFieldGroup>
        <RadioGroup
          label={t("language.label")}
          options={languageOptions}
          value={language}
          onChange={(value) => updateSettings({ language: value })}
          variant="list"
          className="py-0"
        />
      </SettingsFieldGroup>
    </SettingsSection>
  );
};

export default LanguageSection;
