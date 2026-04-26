/**
 * @fileoverview Security settings section.
 */

import React, { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { LockClosedIcon } from "@heroicons/react/24/outline";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { DeviceSessionList } from "./DeviceSessionList";
import { SettingsCard } from "./SettingsCard";
import { SettingsSection } from "./SettingsSection";
import { Button, Input, PasswordStrength, toast } from "../ui";
import { extractApiError } from "../../lib/apiContract";
import {
  changePasswordSchema,
  type ChangePasswordFormData,
} from "../../lib/validations";
import { authApi } from "../../services/api";

interface SecuritySectionProps {
  id?: string;
}

export const SecuritySection: React.FC<SecuritySectionProps> = ({ id }) => {
  const { t } = useTranslation("settings");
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setError,
    watch,
  } = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const newPasswordValue = watch("newPassword");

  const onSubmit = async (data: ChangePasswordFormData) => {
    setIsLoading(true);
    try {
      await authApi.changePassword({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
        confirmPassword: data.confirmPassword,
      });
      toast.success(t("security.changeSuccess"));
      reset();
    } catch (error) {
      const apiError = extractApiError(error);
      if (apiError.statusCode === 400 || apiError.statusCode === 422) {
        setError("currentPassword", {
          message: t("security.wrongPassword"),
        });
      } else {
        toast.error(apiError.message || t("security.changeFailed"));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SettingsSection
      id={id}
      title={t("security.title")}
      description={t("security.description")}
    >
      <SettingsCard
        title={t("security.changePassword")}
        description={t("security.changePasswordDesc", {
          defaultValue: "Cập nhật mật khẩu đăng nhập Hacom Chat.",
        })}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            {...register("currentPassword")}
            type="password"
            label={t("security.currentPassword")}
            placeholder="********"
            leftIcon={<LockClosedIcon className="h-4 w-4" />}
            error={errors.currentPassword?.message}
            disabled={isLoading}
            autoComplete="current-password"
          />

          <div>
            <Input
              {...register("newPassword")}
              type="password"
              label={t("security.newPassword")}
              placeholder="********"
              leftIcon={<LockClosedIcon className="h-4 w-4" />}
              error={errors.newPassword?.message}
              disabled={isLoading}
              autoComplete="new-password"
            />
            {newPasswordValue ? (
              <div className="mt-2">
                <PasswordStrength password={newPasswordValue} />
              </div>
            ) : null}
          </div>

          <Input
            {...register("confirmPassword")}
            type="password"
            label={t("security.confirmPassword")}
            placeholder="********"
            leftIcon={<LockClosedIcon className="h-4 w-4" />}
            error={errors.confirmPassword?.message}
            disabled={isLoading}
            autoComplete="new-password"
          />

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              size="sm"
              isLoading={isLoading}
              disabled={isLoading}
            >
              {t("security.changePassword")}
            </Button>
          </div>
        </form>
      </SettingsCard>

      <DeviceSessionList />
    </SettingsSection>
  );
};

export default SecuritySection;
