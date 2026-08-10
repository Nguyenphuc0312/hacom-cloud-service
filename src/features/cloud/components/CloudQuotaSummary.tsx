import React from "react";
import { useTranslation } from "react-i18next";
import type { CloudQuota } from "../types";
import { formatBytes } from "../utils/cloudFormat";

interface CloudQuotaSummaryProps {
  quota: CloudQuota | null;
}

export const CloudQuotaSummary: React.FC<CloudQuotaSummaryProps> = ({
  quota,
}) => {
  const { t } = useTranslation("cloud");
  if (!quota) return null;

  return (
    <div className="cloud-quota-summary" aria-label={t("quota.aria")}>
      <span>
        <strong>{formatBytes(quota.usedBytes)}</strong>
        {t("quota.of", { limit: formatBytes(quota.limitBytes) })}
      </span>
      <span>
        {t("quota.active", { value: formatBytes(quota.activeBytes) })}
      </span>
      <span>
        {t("quota.trash", { value: formatBytes(quota.trashBytes) })}
      </span>
      <span>
        {t("quota.available", { value: formatBytes(quota.availableBytes) })}
      </span>
    </div>
  );
};
