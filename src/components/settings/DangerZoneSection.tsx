/**
 * @fileoverview Danger zone settings section.
 */

import React, { useCallback, useState } from "react";
import {
  ExclamationTriangleIcon,
  LockClosedIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { SettingsDangerZone } from "./SettingsDangerZone";
import { SettingsSection } from "./SettingsSection";
import { Button, Input, toast } from "../ui";
import { extractApiError } from "../../lib/apiContract";
import { userApi } from "../../services/api";
import { useAuthStore } from "../../stores";
import { ROUTE_PATHS } from "../../router/paths";

interface DangerZoneSectionProps {
  id?: string;
}

export const DangerZoneSection: React.FC<DangerZoneSectionProps> = ({ id }) => {
  const { t } = useTranslation("settings");
  const logoutSoft = useAuthStore((state) => state.logoutSoft);
  const navigate = useNavigate();

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
      await logoutSoft();
      navigate(ROUTE_PATHS.LOGIN, { replace: true });
    } catch (reason) {
      const apiError = extractApiError(reason);
      if (apiError.statusCode === 401 || apiError.statusCode === 422) {
        setError(t("dangerZone.wrongPassword"));
      } else {
        toast.error(apiError.message || t("dangerZone.deleteFailed"));
      }
    } finally {
      setIsDeleting(false);
    }
  }, [logoutSoft, navigate, password, t]);

  const handleCancel = useCallback(() => {
    setShowConfirm(false);
    setPassword("");
    setError(null);
  }, []);

  return (
    <SettingsSection
      id={id}
      title={t("dangerZone.title")}
      description={t("dangerZone.description")}
    >
      <SettingsDangerZone
        title={t("dangerZone.deleteAccount")}
        description={t("dangerZone.deleteWarning")}
      >
        {!showConfirm ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-text-secondary">
              {t("dangerZone.confirmDescription")}
            </p>
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
          <div className="space-y-4 rounded-xl border border-danger/20 bg-[hsl(var(--color-surface))/0.86] p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger/15">
                <ExclamationTriangleIcon className="h-5 w-5 text-danger" />
              </div>
              <div>
                <p className="text-sm font-semibold text-danger">
                  {t("dangerZone.confirmTitle")}
                </p>
                <p className="mt-1 text-sm text-text-secondary">
                  {t("dangerZone.confirmDescription")}
                </p>
              </div>
            </div>

            <Input
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
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
      </SettingsDangerZone>
    </SettingsSection>
  );
};

export default DangerZoneSection;
