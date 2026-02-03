/**
 * @fileoverview Edit Profile Modal
 * Modal chỉnh sửa thông tin cá nhân
 */

import React, { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import clsx from "clsx";
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

  // Handle avatar change
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn file ảnh");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Kích thước ảnh không được vượt quá 5MB");
      return;
    }

    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  // Remove avatar preview
  const handleRemoveAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Handle form submit
  const onSubmit = async (data: UpdateProfileFormData) => {
    setIsLoading(true);

    try {
      // Upload avatar nếu có
      if (avatarFile) {
        const formData = new FormData();
        formData.append("avatar", avatarFile);

        const avatarResponse = await apiClient.put("/users/avatar", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });

        updateUser({ avatar: avatarResponse.data.data.avatar });
      }

      // Update profile
      const response = await apiClient.put("/users/profile", data);
      updateUser(response.data.data);

      toast.success("Cập nhật hồ sơ thành công!");
      onClose();
    } catch (err) {
      toast.error(
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message || "Cập nhật thất bại",
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Reset form when modal closes
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
      title="Chỉnh sửa hồ sơ"
      size="md"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Avatar */}
        <div className="flex flex-col items-center">
          <div className="relative">
            <Avatar
              src={avatarPreview || user?.avatar}
              alt={displayName}
              size="xl"
              className="w-24 h-24"
            />

            {/* Change avatar button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={clsx(
                "absolute bottom-0 right-0",
                "w-8 h-8 rounded-full",
                "bg-telegram-primary text-white",
                "flex items-center justify-center",
                "shadow-lg hover:bg-telegram-primary/90 transition-colors",
              )}
            >
              <CameraIcon className="w-4 h-4" />
            </button>

            {/* Remove preview button */}
            {avatarPreview && (
              <button
                type="button"
                onClick={handleRemoveAvatar}
                className={clsx(
                  "absolute -top-2 -right-2",
                  "w-6 h-6 rounded-full",
                  "bg-red-500 text-white",
                  "flex items-center justify-center",
                  "shadow-lg hover:bg-red-600 transition-colors",
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

          <p className="mt-2 text-sm text-gray-500">
            Click để thay đổi ảnh đại diện
          </p>
        </div>

        {/* Name fields */}
        <div className="grid grid-cols-2 gap-4">
          <Input
            {...register("firstName")}
            label="Họ"
            placeholder="Nguyễn"
            error={errors.firstName?.message}
            disabled={isLoading}
          />
          <Input
            {...register("lastName")}
            label="Tên"
            placeholder="Văn A"
            error={errors.lastName?.message}
            disabled={isLoading}
          />
        </div>

        {/* Phone */}
        <Input
          {...register("phone")}
          label="Số điện thoại"
          placeholder="+84 912 345 678"
          error={errors.phone?.message}
          disabled={isLoading}
        />

        {/* Bio */}
        <Textarea
          {...register("bio")}
          label="Giới thiệu"
          placeholder="Viết vài dòng về bản thân..."
          rows={3}
          error={errors.bio?.message}
          disabled={isLoading}
          hint={`Tối đa 500 ký tự`}
        />

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            fullWidth
            onClick={handleClose}
            disabled={isLoading}
          >
            Hủy
          </Button>
          <Button
            type="submit"
            fullWidth
            isLoading={isLoading}
            disabled={isLoading || (!isDirty && !avatarFile)}
          >
            Lưu thay đổi
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default EditProfileModal;
