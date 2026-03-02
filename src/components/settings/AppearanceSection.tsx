/**
 * @fileoverview Appearance Settings sub-section
 * Theme / accent color / font size / display density
 */

import React from "react";
import { useTranslation } from "react-i18next";
import {
  SunIcon,
  MoonIcon,
  ComputerDesktopIcon,
  PaintBrushIcon,
} from "@heroicons/react/24/outline";
import { SettingsSection } from "./SettingsSection";
import { RadioGroup } from "./RadioGroup";
import { ColorPicker } from "./ColorPicker";
import { ThemePreview } from "./ThemePreview";
import { useSettingsSection, useUpdateSettings } from "../../settings";
import type {
  ThemeMode,
  FontSize,
  DisplayDensity,
  AccentColor,
} from "../../settings/types";

export const AppearanceSection: React.FC = () => {
  const { t } = useTranslation("settings");
  const appearance = useSettingsSection("appearance");
  const update = useUpdateSettings();

  const themeOptions: {
    value: ThemeMode;
    label: string;
    icon: React.ReactNode;
  }[] = [
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

  const fontSizeOptions: {
    value: FontSize;
    label: string;
    description: string;
  }[] = [
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

  const densityOptions: {
    value: DisplayDensity;
    label: string;
    description: string;
  }[] = [
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
      icon={<PaintBrushIcon className="h-5 w-5" />}
      title={t("appearance.title")}
      description={t("appearance.description")}
    >
      {/* Theme */}
      <RadioGroup
        label={t("appearance.themeLabel")}
        options={themeOptions}
        value={appearance.theme}
        onChange={(v) => update({ appearance: { theme: v } })}
        variant="cards"
      />

      {/* Accent colour */}
      <ColorPicker
        label={t("appearance.accentLabel")}
        description={t("appearance.accentDesc")}
        value={appearance.accentColor}
        onChange={(v: AccentColor) =>
          update({ appearance: { accentColor: v } })
        }
      />

      {/* Font size */}
      <RadioGroup
        label={t("appearance.fontSizeLabel")}
        description={t("appearance.fontSizeDesc")}
        options={fontSizeOptions}
        value={appearance.fontSize}
        onChange={(v) => update({ appearance: { fontSize: v } })}
        variant="pills"
      />

      {/* Display density */}
      <RadioGroup
        label={t("appearance.densityLabel")}
        options={densityOptions}
        value={appearance.displayDensity}
        onChange={(v) => update({ appearance: { displayDensity: v } })}
        variant="pills"
      />

      {/* Live preview */}
      <div className="pt-2">
        <span className="mb-2 block text-sm font-medium text-text-primary">
          {t("appearance.preview")}
        </span>
        <ThemePreview
          fontSize={appearance.fontSize}
          density={appearance.displayDensity}
        />
      </div>
    </SettingsSection>
  );
};

export default AppearanceSection;
