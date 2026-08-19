/**
 * @fileoverview Chat settings section.
 */

import React from "react";
import { useTranslation } from "react-i18next";
import { RadioGroup } from "./RadioGroup";
import { SettingsCard } from "./SettingsCard";
import { SettingsSection } from "./SettingsSection";
import { SettingsToggle } from "./SettingsToggle";
import { useSettingsSection, useUpdateSettings } from "../../settings";
import type { EnterKeyAction } from "../../settings/types";

interface ChatSectionProps {
  id?: string;
}

export const ChatSection: React.FC<ChatSectionProps> = ({ id }) => {
  const { t } = useTranslation("settings");
  const chat = useSettingsSection("chat");
  const update = useUpdateSettings();

  const enterKeyOptions: Array<{
    value: EnterKeyAction;
    label: string;
    description: string;
  }> = [
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
      id={id}
      title={t("chat.title")}
      description={t("chat.description")}
    >
      <SettingsCard bodyClassName="divide-y divide-border">
        <SettingsToggle
          label={t("chat.autoScroll")}
          description={t("chat.autoScrollDesc")}
          checked={chat.autoScrollOnNewMessage}
          onChange={(value) =>
            update({ chat: { autoScrollOnNewMessage: value } })
          }
          className="px-0 py-0"
        />
        <div className="pt-4">
          <RadioGroup
            label={t("chat.enterKeyLabel")}
            options={enterKeyOptions}
            value={chat.enterKeyAction}
            onChange={(value) => update({ chat: { enterKeyAction: value } })}
            variant="list"
            className="py-0"
          />
        </div>
        <div className="pt-4">
          <SettingsToggle
            label={t("chat.saveSearchHistory")}
            description={t("chat.saveSearchHistoryDesc")}
            checked={chat.saveSearchHistory}
            onChange={(value) => update({ chat: { saveSearchHistory: value } })}
            className="px-0 py-0"
          />
        </div>
      </SettingsCard>
    </SettingsSection>
  );
};

export default ChatSection;
