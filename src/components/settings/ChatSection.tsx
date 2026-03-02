/**
 * @fileoverview Chat Settings sub-section
 */

import React from "react";
import { useTranslation } from "react-i18next";
import { ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import { SettingsSection } from "./SettingsSection";
import { ToggleSwitch } from "./ToggleSwitch";
import { RadioGroup } from "./RadioGroup";
import { useSettingsSection, useUpdateSettings } from "../../settings";
import type { EnterKeyAction } from "../../settings/types";

export const ChatSection: React.FC = () => {
  const { t } = useTranslation("settings");
  const chat = useSettingsSection("chat");
  const update = useUpdateSettings();

  const enterKeyOptions: {
    value: EnterKeyAction;
    label: string;
    description: string;
  }[] = [
    {
      value: "send",
      label: t("chat.enterSend"),
      description: t("chat.enterSendDesc"),
    },
    {
      value: "newline",
      label: t("chat.enterNewline"),
      description: t("chat.enterNewlineDesc"),
    },
  ];

  return (
    <SettingsSection
      icon={<ChatBubbleLeftRightIcon className="h-5 w-5" />}
      title={t("chat.title")}
      description={t("chat.description")}
    >
      <ToggleSwitch
        label={t("chat.autoScroll")}
        description={t("chat.autoScrollDesc")}
        checked={chat.autoScrollOnNewMessage}
        onChange={(v) => update({ chat: { autoScrollOnNewMessage: v } })}
      />

      <RadioGroup
        label={t("chat.enterKeyLabel")}
        options={enterKeyOptions}
        value={chat.enterKeyAction}
        onChange={(v) => update({ chat: { enterKeyAction: v } })}
      />

      <ToggleSwitch
        label={t("chat.saveSearchHistory")}
        description={t("chat.saveSearchHistoryDesc")}
        checked={chat.saveSearchHistory}
        onChange={(v) => update({ chat: { saveSearchHistory: v } })}
      />
    </SettingsSection>
  );
};

export default ChatSection;
