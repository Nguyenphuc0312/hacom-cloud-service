/**
 * @fileoverview Security Settings Section
 *
 * Change-password form using existing changePasswordSchema.
 * Uses SettingsSection wrapper + react-hook-form + Zod.
 */

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { LockClosedIcon, KeyIcon } from "@heroicons/react/24/outline";
import { SettingsSection } from "./SettingsSection";
import { Button, Input, toast } from "../ui";
import { PasswordStrength } from "../ui";
import {
  changePasswordSchema,
  type ChangePasswordFormData,
} from "../../lib/validations";
import { authApi } from "../../services/api";
import { extractApiError } from "../../lib/apiContract";

export const SecuritySection: React.FC = () => {
  const { t } = useTranslation("settings");
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
    setError,
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
    } catch (err) {
      const apiError = extractApiError(err);
      if (apiError.statusCode === 422 || apiError.statusCode === 400) {
        // Wrong current password
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
      icon={<KeyIcon className="h-5 w-5" />}
      title={t("security.title")}
      description={t("security.description")}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          {...register("currentPassword")}
          type="password"
          label={t("security.currentPassword")}
          placeholder="••••••••"
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
            placeholder="••••••••"
            leftIcon={<LockClosedIcon className="h-4 w-4" />}
            error={errors.newPassword?.message}
            disabled={isLoading}
            autoComplete="new-password"
          />
          {newPasswordValue && (
            <div className="mt-2">
              <PasswordStrength password={newPasswordValue} />
            </div>
          )}
        </div>

        <Input
          {...register("confirmPassword")}
          type="password"
          label={t("security.confirmPassword")}
          placeholder="••••••••"
          leftIcon={<LockClosedIcon className="h-4 w-4" />}
          error={errors.confirmPassword?.message}
          disabled={isLoading}
          autoComplete="new-password"
        />

        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={isLoading}
            disabled={isLoading}
          >
            {t("security.changePassword")}
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
};

export default SecuritySection;
