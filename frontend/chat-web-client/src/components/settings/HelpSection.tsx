import React from "react";
import { useTranslation } from "react-i18next";
import { SettingsCard } from "./SettingsCard";
import { SettingsRow } from "./SettingsRow";
import { SettingsSection } from "./SettingsSection";

interface HelpSectionProps {
  id?: string;
}

export const HelpSection: React.FC<HelpSectionProps> = ({ id }) => {
  const { t } = useTranslation("settings");

  return (
    <SettingsSection
      id={id}
      title={t("help.title", { defaultValue: "Hỗ trợ" })}
      description={t("help.description", {
        defaultValue: "Thông tin trợ giúp và kênh phản hồi nội bộ.",
      })}
    >
      <SettingsCard bodyClassName="divide-y divide-border">
        <SettingsRow
          label={t("help.center", { defaultValue: "Trung tâm trợ giúp" })}
          description={t("help.centerDesc", {
            defaultValue: "Xem hướng dẫn sử dụng Hacom Holdings.",
          })}
        />
        <SettingsRow
          label={t("help.reportIssue", { defaultValue: "Báo lỗi" })}
          description={t("help.reportIssueDesc", {
            defaultValue: "Gửi thông tin lỗi cho đội vận hành nội bộ.",
          })}
        />
        <SettingsRow
          label={t("help.policy", { defaultValue: "Chính sách nội bộ" })}
          description={t("help.policyDesc", {
            defaultValue: "Quy định sử dụng nền tảng liên lạc của Hacom.",
          })}
        />
      </SettingsCard>
    </SettingsSection>
  );
};

export default HelpSection;
