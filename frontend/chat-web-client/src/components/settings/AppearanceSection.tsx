/**
 * @fileoverview Appearance settings section.
 */

import React from "react";
import { useTranslation } from "react-i18next";
import {
  ComputerDesktopIcon,
  MoonIcon,
  SunIcon,
} from "@heroicons/react/24/outline";
import { RadioGroup } from "./RadioGroup";
import { SettingsCard } from "./SettingsCard";
import { SettingsSection } from "./SettingsSection";
import { useSettingsSection, useUpdateSettings } from "../../settings";
import type {
  DisplayDensity,
  FontSize,
  ThemeMode,
} from "../../settings/types";

interface AppearanceSectionProps {
  id?: string;
}

export const AppearanceSection: React.FC<AppearanceSectionProps> = ({ id }) => {
  const { t } = useTranslation("settings");
  const appearance = useSettingsSection("appearance");
  const update = useUpdateSettings();

  const themeOptions: Array<{
    value: ThemeMode;
    label: string;
    icon: React.ReactNode;
  }> = [
    {
      value: "light",
      label: t("appearance.themeLight"),
      icon: <SunIcon className="h-5 w-5" />,
    },
    {
      value: "dark",
      label: t("appearance.themeDark"),
      icon: <MoonIcon className="h-5 w-5" />,
    },
    {
      value: "system",
      label: t("appearance.themeSystem"),
      icon: <ComputerDesktopIcon className="h-5 w-5" />,
    },
  ];

  const fontSizeOptions: Array<{
    value: FontSize;
    label: string;
    description: string;
  }> = [
    {
      value: "small",
      label: t("appearance.fontSmall"),
      description: t("appearance.fontSmallDesc"),
    },
    {
      value: "medium",
      label: t("appearance.fontMedium"),
      description: t("appearance.fontMediumDesc"),
    },
    {
      value: "large",
      label: t("appearance.fontLarge"),
      description: t("appearance.fontLargeDesc"),
    },
  ];

  const densityOptions: Array<{
    value: DisplayDensity;
    label: string;
    description: string;
  }> = [
    {
      value: "compact",
      label: t("appearance.densityCompact"),
      description: t("appearance.densityCompactDesc"),
    },
    {
      value: "comfortable",
      label: t("appearance.densityComfortable"),
      description: t("appearance.densityComfortableDesc"),
    },
  ];

  return (
    <SettingsSection
      id={id}
      title={t("appearance.title")}
      description={t("appearance.description")}
    >
      <SettingsCard>
        <RadioGroup
          label={t("appearance.themeLabel")}
          options={themeOptions}
          value={appearance.theme}
          onChange={(value) => update({ appearance: { theme: value } })}
          variant="pills"
          className="py-0"
        />
        <div className="mt-5 border-t border-border pt-4">
          <RadioGroup
            label={t("appearance.fontSizeLabel")}
            description={t("appearance.fontSizeDesc")}
            options={fontSizeOptions}
            value={appearance.fontSize}
            onChange={(value) => update({ appearance: { fontSize: value } })}
            variant="list"
            className="py-0"
          />
        </div>
        <div className="mt-5 border-t border-border pt-4">
          <RadioGroup
            label={t("appearance.densityLabel")}
            options={densityOptions}
            value={appearance.displayDensity}
            onChange={(value) =>
              update({ appearance: { displayDensity: value } })
            }
            variant="list"
            className="py-0"
          />
        </div>
      </SettingsCard>
    </SettingsSection>
  );
};

export default AppearanceSection;
