import React, { useState, useRef } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { CameraIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Modal, Input, Textarea, Button, toast } from "../ui";
import { Avatar } from "../common/Avatar";
import { useAuthStore } from "../../stores";
import { userApi } from "../../services/api";
import { resolveUserDisplayName } from "../../features/chat/identity/resolveUserDisplayName";
import { unwrapApiSuccess } from "../../lib/apiContract";

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
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [isLoading, setIsLoading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const employeeCode =
    (user as { employeeCode?: string; employee_code?: string } | null)
      ?.employeeCode ||
    (user as { employeeCode?: string; employee_code?: string } | null)
      ?.employee_code ||
    "-";
  const hrLegalName =
    (user as { fullNameFromHR?: string; full_name_from_hr?: string } | null)
      ?.fullNameFromHR ||
    (user as { fullNameFromHR?: string; full_name_from_hr?: string } | null)
      ?.full_name_from_hr ||
    "-";
  const corporateEmail =
    (user as { corporateEmail?: string; email?: string } | null)
      ?.corporateEmail ||
    user?.email ||
    "-";

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

  const hasChanges =
    displayName !== (user?.displayName || "") ||
    bio !== (user?.bio || "") ||
    phone !== (user?.phone || "") ||
    Boolean(avatarFile);

  const onSubmit = async () => {
    setIsLoading(true);

    try {
      let uploadedAvatar = user?.avatar;

      if (avatarFile) {
        const avatarResponse = await userApi.updateAvatar(avatarFile);
        uploadedAvatar =
          unwrapApiSuccess(avatarResponse).avatar || uploadedAvatar;
      }

      const response = await userApi.patchProfile({
        displayName: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      const profileData = unwrapApiSuccess(response);
      updateUser({
        ...profileData,
        avatar: uploadedAvatar,
      });

      toast.success(t("profile:toast.profileUpdateSuccess"));
      onClose();
    } catch (err) {
      toast.error(
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ||
          t("profile:toast.profileUpdateFailed"),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setDisplayName(user?.displayName || "");
    setBio(user?.bio || "");
    setPhone(user?.phone || "");
    handleRemoveAvatar();
    onClose();
  };

  const displayLabel =
    resolveUserDisplayName(user, { allowLegacyFallback: true }) || "";

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t("profile:editProfileModal.title")}
      size="md"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit();
        }}
        className="space-y-6"
      >
        <div className="flex flex-col items-center">
          <div className="relative">
            <Avatar
              src={avatarPreview || user?.avatar}
              alt={displayLabel}
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

        <Input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          label={t("profile:settings.displayName")}
          placeholder={t("profile:settings.displayNamePlaceholder")}
          disabled={isLoading}
        />

        <Input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          label={t("profile:editProfileModal.phone")}
          placeholder={t("profile:editProfileModal.phonePlaceholder")}
          disabled={isLoading}
        />

        <Textarea
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          label={t("profile:editProfileModal.bio")}
          placeholder={t("profile:editProfileModal.bioPlaceholder")}
          rows={3}
          disabled={isLoading}
          hint={t("profile:editProfileModal.bioHint", { count: 500 })}
        />

        <div className="rounded-xl border border-border bg-surface-overlay p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            {t("profile:settings.readOnlyTitle")}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input
              label={t("profile:settings.employeeCode")}
              value={employeeCode}
              readOnly
              disabled
            />
            <Input
              label={t("profile:settings.hrLegalName")}
              value={hrLegalName}
              readOnly
              disabled
            />
            <Input
              label={t("profile:settings.corporateEmail")}
              value={corporateEmail}
              readOnly
              disabled
            />
          </div>
        </div>

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
            disabled={isLoading || !hasChanges}
          >
            {t("profile:editProfileModal.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default EditProfileModal;
