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
        (apiError.code as string) === "INVALID_CURRENT_PASSWORD" ||
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
            leftIcon={<LockClosedIcon className="h-4 w-4 text-[#1565C0]" />}
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
              leftIcon={<LockClosedIcon className="h-4 w-4 text-[#1565C0]" />}
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
            leftIcon={<LockClosedIcon className="h-4 w-4 text-[#1565C0]" />}
            error={errors.confirmPassword?.message}
            disabled={isLoading}
            autoComplete="new-password"
          />

          <div className="rounded-lg border border-[#1976D2]/20 bg-[#DBEAFE]/6 px-4 py-3">
            <label className="flex cursor-pointer items-start gap-3">
              <div className="relative mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                <input
                  type="checkbox"
                  className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-border-strong checked:border-[#1565C0] checked:bg-gradient-to-br checked:from-[#1565C0] checked:to-[#1976D2] focus:outline-none focus:ring-2 focus:ring-[#1976D2]/30 disabled:cursor-not-allowed disabled:opacity-50"
                  checked={logoutOtherDevicesField.value}
                  onChange={(e) => logoutOtherDevicesField.onChange(e.target.checked)}
                  disabled={isLoading}
                />
                {logoutOtherDevicesField.value && (
                  <svg className="pointer-events-none absolute h-2.5 w-2.5 text-white" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-text-primary">
                  Đăng xuất khỏi các thiết bị khác
                </p>
                <p className="text-xs text-text-secondary">
                  Chọn mục này nếu bạn nghi ngờ người khác từng sử dụng tài khoản của bạn. Bạn vẫn sẽ tiếp tục đăng nhập trên thiết bị hiện tại.
                </p>
              </div>
            </label>
          </div>

          <div className="flex justify-start pt-2">
            <Button
              type="submit"
              variant="brand"
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
