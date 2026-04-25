/**
 * @fileoverview Chat settings section.
 */

import React from "react";
import { useTranslation } from "react-i18next";
import { RadioGroup } from "./RadioGroup";
import { SettingsFieldGroup } from "./SettingsFieldGroup";
import { SettingsSection } from "./SettingsSection";
import { ToggleSwitch } from "./ToggleSwitch";
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
      <SettingsFieldGroup>
        <ToggleSwitch
          label={t("chat.autoScroll")}
          description={t("chat.autoScrollDesc")}
          checked={chat.autoScrollOnNewMessage}
          onChange={(value) =>
            update({ chat: { autoScrollOnNewMessage: value } })
          }
          className="rounded-none px-0 py-0"
        />
        <div className="border-t border-border/60 pt-4">
          <RadioGroup
            label={t("chat.enterKeyLabel")}
            options={enterKeyOptions}
            value={chat.enterKeyAction}
            onChange={(value) => update({ chat: { enterKeyAction: value } })}
            variant="list"
            className="py-0"
          />
        </div>
        <div className="border-t border-border/60 pt-4">
          <ToggleSwitch
            label={t("chat.saveSearchHistory")}
            description={t("chat.saveSearchHistoryDesc")}
            checked={chat.saveSearchHistory}
            onChange={(value) => update({ chat: { saveSearchHistory: value } })}
            className="rounded-none px-0 py-0"
          />
        </div>
      </SettingsFieldGroup>
    </SettingsSection>
  );
};

export default ChatSection;
