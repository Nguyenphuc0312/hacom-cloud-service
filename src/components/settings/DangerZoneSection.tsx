/**
 * @fileoverview Danger Zone Section
 *
 * Account deletion with confirmation dialog requiring password.
 * Follows existing SettingsSection pattern.
 */

import React, { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  ExclamationTriangleIcon,
  TrashIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import { SettingsSection } from "./SettingsSection";
import { Button, Input, toast } from "../ui";
import { userApi } from "../../services/api";
import { extractApiError } from "../../lib/apiContract";
import { useAuthStore } from "../../stores";

export const DangerZoneSection: React.FC = () => {
  const { t } = useTranslation("settings");
  const logout = useAuthStore((s) => s.logout);

  const [showConfirm, setShowConfirm] = useState(false);
  const [password, setPassword] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = useCallback(async () => {
    if (!password.trim()) {
      setError(t("dangerZone.passwordRequired"));
      return;
    }

    setIsDeleting(true);
    setError(null);
    try {
      await userApi.deleteAccount(password, "DELETE");
      toast.success(t("dangerZone.deleteSuccess"));
      logout();
    } catch (err) {
      const apiError = extractApiError(err);
      if (apiError.statusCode === 401 || apiError.statusCode === 422) {
        setError(t("dangerZone.wrongPassword"));
      } else {
        toast.error(apiError.message || t("dangerZone.deleteFailed"));
      }
    } finally {
      setIsDeleting(false);
    }
  }, [password, logout, t]);

  const handleCancel = useCallback(() => {
    setShowConfirm(false);
    setPassword("");
    setError(null);
  }, []);

  return (
    <SettingsSection
      icon={<ExclamationTriangleIcon className="h-5 w-5" />}
      title={t("dangerZone.title")}
      description={t("dangerZone.description")}
      className="border-danger/30"
    >
      {!showConfirm ? (
        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-sm font-medium text-text-primary">
              {t("dangerZone.deleteAccount")}
            </p>
            <p className="mt-0.5 text-xs text-text-muted">
              {t("dangerZone.deleteWarning")}
            </p>
          </div>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setShowConfirm(true)}
          >
            <TrashIcon className="mr-1.5 h-4 w-4" />
            {t("dangerZone.deleteButton")}
          </Button>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-danger/20 bg-danger/5 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger/15">
              <ExclamationTriangleIcon className="h-5 w-5 text-danger" />
            </div>
            <div>
              <p className="text-sm font-semibold text-danger">
                {t("dangerZone.confirmTitle")}
              </p>
              <p className="mt-1 text-xs text-text-muted">
                {t("dangerZone.confirmDescription")}
              </p>
            </div>
          </div>

          <Input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            placeholder={t("dangerZone.passwordPlaceholder")}
            leftIcon={<LockClosedIcon className="h-4 w-4" />}
            error={error || undefined}
            disabled={isDeleting}
            autoComplete="current-password"
          />

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              disabled={isDeleting}
            >
              {t("dangerZone.cancel")}
            </Button>
            <Button
              variant="danger"
              size="sm"
              isLoading={isDeleting}
              disabled={isDeleting || !password.trim()}
              onClick={handleDelete}
            >
              {t("dangerZone.confirmDelete")}
            </Button>
          </div>
        </div>
      )}
    </SettingsSection>
  );
};

export default DangerZoneSection;
