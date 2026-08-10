import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Modal } from "../../../components/ui";
import type { CloudQuota, CloudQuotaRequest } from "../types";
import { formatBytes } from "../utils/cloudFormat";

const QUOTA_TIERS = [10_000_000_000, 25_000_000_000, 50_000_000_000] as const;

interface CloudQuotaRequestDialogProps {
  isOpen: boolean;
  quota: CloudQuota | null;
  currentRequest: CloudQuotaRequest | null;
  isLoading: boolean;
  onClose: () => void;
  onSubmit: (requestedQuotaBytes: number, reason?: string) => Promise<void>;
}

export const CloudQuotaRequestDialog: React.FC<
  CloudQuotaRequestDialogProps
> = ({ isOpen, quota, currentRequest, isLoading, onClose, onSubmit }) => {
  const { t } = useTranslation("cloud");
  const firstAvailableTier =
    QUOTA_TIERS.find((tier) => tier > (quota?.limitBytes ?? 0)) ??
    QUOTA_TIERS[QUOTA_TIERS.length - 1];
  const [tier, setTier] = useState<number>(firstAvailableTier);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (isOpen) setTier(firstAvailableTier);
  }, [firstAvailableTier, isOpen]);

  const hasPendingRequest = currentRequest?.status === "pending";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("quotaRequest.title")}
      description={t("quotaRequest.description")}
      size="sm"
      closeOnEsc={!isLoading}
      closeOnOverlayClick={!isLoading}
    >
      <div className="space-y-4">
        {currentRequest ? (
          <div className="rounded-xl border border-border bg-surface-subtle p-3 text-sm">
            <p className="font-semibold text-text-primary">
              {t(`quotaRequest.status.${currentRequest.status}`)}
            </p>
            <p className="mt-1 text-text-secondary">
              {t("quotaRequest.requested", {
                value: formatBytes(currentRequest.requestedQuotaBytes),
              })}
            </p>
          </div>
        ) : null}

        {!hasPendingRequest ? (
          <>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium text-text-primary">
                {t("quotaRequest.tier")}
              </span>
              <select
                className="input-surface h-10 w-full px-3"
                value={tier}
                onChange={(event) => setTier(Number(event.target.value))}
              >
                {QUOTA_TIERS.filter(
                  (candidate) => candidate > (quota?.limitBytes ?? 0),
                ).map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {formatBytes(candidate)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium text-text-primary">
                {t("quotaRequest.reason")}
              </span>
              <textarea
                className="input-surface min-h-24 w-full resize-y px-3 py-2"
                maxLength={1000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t("quotaRequest.reasonPlaceholder")}
              />
            </label>
          </>
        ) : (
          <p className="text-sm text-text-secondary">
            {t("quotaRequest.pendingNotice")}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={isLoading}
            onClick={onClose}
          >
            {t("common.close")}
          </Button>
          {!hasPendingRequest ? (
            <Button
              size="sm"
              isLoading={isLoading}
              disabled={tier <= (quota?.limitBytes ?? 0)}
              onClick={() =>
                void onSubmit(tier, reason)
                  .then(() => {
                    setReason("");
                    onClose();
                  })
                  .catch(() => {
                    // The page renders the canonical Cloud API error notice.
                  })
              }
            >
              {t("quotaRequest.submit")}
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
};
