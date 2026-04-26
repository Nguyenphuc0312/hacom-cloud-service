import React from "react";
import {
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { SettingsCard } from "./SettingsCard";
import { SettingsRow } from "./SettingsRow";

export const DeviceSessionList: React.FC = () => {
  const { t } = useTranslation("settings");
  const userAgent =
    typeof navigator !== "undefined" ? navigator.userAgent : "Trình duyệt hiện tại";
  const isMobileDevice = /Android|iPhone|iPad|Mobile/i.test(userAgent);

  return (
    <SettingsCard
      title={t("security.devicesTitle", {
        defaultValue: "Thiết bị đang đăng nhập",
      })}
      description={t("security.devicesDesc", {
        defaultValue:
          "Danh sách phiên đăng nhập từ API chưa khả dụng, hiện hiển thị thiết bị hiện tại.",
      })}
      bodyClassName="divide-y divide-border"
    >
      <SettingsRow
        icon={
          isMobileDevice ? (
            <DevicePhoneMobileIcon className="h-4 w-4" />
          ) : (
            <ComputerDesktopIcon className="h-4 w-4" />
          )
        }
        label={t("security.currentDevice", {
          defaultValue: "Thiết bị hiện tại",
        })}
        description={userAgent}
        meta={
          <span className="inline-flex rounded-full bg-success/10 px-2 py-1 text-xs font-semibold text-success">
            {t("security.currentDeviceBadge", {
              defaultValue: "Đang sử dụng",
            })}
          </span>
        }
      />
    </SettingsCard>
  );
};

export default DeviceSessionList;
