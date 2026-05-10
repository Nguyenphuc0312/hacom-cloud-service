/**
 * @fileoverview Security settings section.
 */

import React, { useState } from "react";
import { ErrorCode } from "@hacom/chat-shared-types/core";
import { zodResolver } from "@hookform/resolvers/zod";
import { LockClosedIcon } from "@heroicons/react/24/outline";
import { useController, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { DeviceSessionList } from "./DeviceSessionList";
import { SettingsCard } from "./SettingsCard";
import { SettingsSection } from "./SettingsSection";
import { Button, Input, toast } from "../ui";
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
    control,
  } = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
      logoutOtherDevices: true,
    },
  });

  const { field: logoutOtherDevicesField } = useController({
    name: "logoutOtherDevices",
    control,
  });

  const onSubmit = async (data: ChangePasswordFormData) => {
    setIsLoading(true);
    try {
      await authApi.changePassword({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
        confirmPassword: data.confirmPassword,
        logoutOtherDevices: data.logoutOtherDevices,
      });
      toast.success(t("security.changeSuccess"));
      reset();
    } catch (error) {
      const apiError = extractApiError(error);
      if (
        apiError.code === ErrorCode.INVALID_CURRENT_PASSWORD ||
        apiError.code === ErrorCode.INVALID_CREDENTIALS
      ) {
        setError("currentPassword", {
          message: t("security.wrongPassword"),
        });
      } else if (apiError.statusCode === 401) {
        toast.error(
          apiError.message || "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.",
        );
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
        <form onSubmit={handleSubmit(onSubmit)} className="max-w-[480px] space-y-4">
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

          <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-800/50">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                checked={logoutOtherDevicesField.value}
                onChange={(e) => logoutOtherDevicesField.onChange(e.target.checked)}
                disabled={isLoading}
              />
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  Đăng xuất khỏi các thiết bị khác
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Chọn mục này nếu bạn nghi ngờ người khác từng sử dụng tài khoản của bạn. Bạn vẫn sẽ tiếp tục đăng nhập trên thiết bị hiện tại.
                </p>
              </div>
            </label>
          </div>

          <div className="flex justify-start pt-2">
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
