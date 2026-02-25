import React, { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { CameraIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Modal, Input, Textarea, Button, toast } from "../ui";
import { Avatar } from "../common/Avatar";
import { updateProfileSchema } from "../../lib/validations";
import type { UpdateProfileFormData } from "../../lib/validations";
import { useAuthStore } from "../../stores";
import apiClient from "../../lib/axios";

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  const { user, updateUser } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<UpdateProfileFormData>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      bio: user?.bio || "",
      phone: user?.phone || "",
    },
  });

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error(t("profile:toast.avatarFileRequired"));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("profile:toast.avatarMaxSize"));
      return;
    }

    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleRemoveAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const onSubmit = async (data: UpdateProfileFormData) => {
    setIsLoading(true);

    try {
      if (avatarFile) {
        const formData = new FormData();
        formData.append("avatar", avatarFile);

        const avatarResponse = await apiClient.put("/users/avatar", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });

        updateUser({ avatar: avatarResponse.data.data.avatar });
      }

      const response = await apiClient.put("/users/profile", data);
      updateUser(response.data.data);

      toast.success(t("profile:toast.profileUpdateSuccess"));
      onClose();
    } catch (err) {
      toast.error(
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message || t("profile:toast.profileUpdateFailed"),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    reset();
    handleRemoveAvatar();
    onClose();
  };

  const displayName = user
    ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username
    : "";

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t("profile:editProfileModal.title")}
      size="md"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="flex flex-col items-center">
          <div className="relative">
            <Avatar
              src={avatarPreview || user?.avatar}
              alt={displayName}
              size="xl"
              className="w-24 h-24"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={clsx(
                "absolute bottom-0 right-0",
                "w-8 h-8 rounded-full",
                "bg-primary text-text-inverse",
                "flex items-center justify-center",
                "shadow-lg hover:bg-primary-hover transition-colors",
              )}
            >
              <CameraIcon className="w-4 h-4" />
            </button>

            {avatarPreview && (
              <button
                type="button"
                onClick={handleRemoveAvatar}
                className={clsx(
                  "absolute -top-2 -right-2",
                  "w-6 h-6 rounded-full",
                  "bg-danger text-text-inverse",
                  "flex items-center justify-center",
                  "shadow-lg hover:bg-danger-hover transition-colors",
                )}
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            className="hidden"
          />

          <p className="mt-2 text-sm text-text-muted">
            {t("profile:editProfileModal.changeAvatarHint")}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            {...register("firstName")}
            label={t("profile:editProfileModal.firstName")}
            placeholder={t("auth:placeholders.firstName")}
            error={errors.firstName?.message}
            disabled={isLoading}
          />
          <Input
            {...register("lastName")}
            label={t("profile:editProfileModal.lastName")}
            placeholder={t("auth:placeholders.lastName")}
            error={errors.lastName?.message}
            disabled={isLoading}
          />
        </div>

        <Input
          {...register("phone")}
          label={t("profile:editProfileModal.phone")}
          placeholder={t("profile:editProfileModal.phonePlaceholder")}
          error={errors.phone?.message}
          disabled={isLoading}
        />

        <Textarea
          {...register("bio")}
          label={t("profile:editProfileModal.bio")}
          placeholder={t("profile:editProfileModal.bioPlaceholder")}
          rows={3}
          error={errors.bio?.message}
          disabled={isLoading}
          hint={t("profile:editProfileModal.bioHint", { count: 500 })}
        />

        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            fullWidth
            onClick={handleClose}
            disabled={isLoading}
          >
            {t("profile:editProfileModal.cancel")}
          </Button>
          <Button
            type="submit"
            fullWidth
            isLoading={isLoading}
            disabled={isLoading || (!isDirty && !avatarFile)}
          >
            {t("profile:editProfileModal.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default EditProfileModal;
