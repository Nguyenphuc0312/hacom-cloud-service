/**
 * @fileoverview Language Settings sub-section
 * Allows users to pick Vietnamese, English, or System default.
 */

import React from "react";
import { useTranslation } from "react-i18next";
import { LanguageIcon } from "@heroicons/react/24/outline";
import { SettingsSection } from "./SettingsSection";
import { RadioGroup } from "./RadioGroup";
import { useSettingsStore } from "../../settings/settingsStore";
import type { LanguageCode } from "../../settings/types";

export const LanguageSection: React.FC = () => {
  const { t } = useTranslation("settings");
  const language = useSettingsStore((s) => s.language);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const languageOptions: {
    value: LanguageCode;
    label: string;
    description?: string;
  }[] = [
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
      icon={<LanguageIcon className="h-5 w-5" />}
      title={t("language.title")}
      description={t("language.description")}
    >
      <RadioGroup
        label={t("language.label")}
        options={languageOptions}
        value={language}
        onChange={(v) => updateSettings({ language: v })}
        variant="cards"
      />
    </SettingsSection>
  );
};

export default LanguageSection;
