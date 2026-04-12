import React, { useEffect, useRef, useState } from "react";
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
  const { user, updateUser, refreshProfile } = useAuthStore();
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

  useEffect(() => {
    if (!isOpen) return;
    setDisplayName(user?.displayName || "");
    setBio(user?.bio || "");
    setPhone(user?.phone || "");
  }, [isOpen, user?.bio, user?.displayName, user?.phone]);

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
    if (avatarPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(avatarPreview);
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleRemoveAvatar = () => {
    if (avatarPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(avatarPreview);
    }
    setAvatarFile(null);
    setAvatarPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const hasChanges =
    displayName !== (user?.displayName || "") ||
    bio !== (user?.bio || "") ||
    phone !== (user?.phone || "") ||
    Boolean(avatarFile);

  const onSubmit = async () => {
    if (phone.trim() && !/^\+?[0-9]{10,15}$/.test(phone.trim())) {
      toast.error(
        t("profile:settings.validation.phoneInvalid", {
          defaultValue: "Use a valid international phone number.",
        }),
      );
      return;
    }

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
      updateUser({ ...profileData, avatar: uploadedAvatar });
      await refreshProfile().catch(() => null);

      toast.success(t("profile:toast.profileUpdateSuccess"));
      onClose();
    } catch (err) {
      toast.error(
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ||
          (err as { response?: { data?: { message?: string } } })?.response
            ?.data?.message ||
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
        <div className="overflow-hidden rounded-[24px] border border-border/70 bg-surface shadow-xs">
          <div className="bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_42%),radial-gradient(circle_at_bottom_left,rgba(245,158,11,0.16),transparent_38%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(30,41,59,0.88))] px-5 py-6 text-white">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar
                  src={avatarPreview || user?.avatar}
                  alt={displayLabel}
                  size="xl"
                  className="h-24 w-24 border border-white/15"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={clsx(
                    "absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full",
                    "bg-white text-slate-900 shadow-lg transition-colors hover:bg-slate-100",
                  )}
                >
                  <CameraIcon className="h-4 w-4" />
                </button>
                {avatarPreview && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-danger text-text-inverse shadow-lg"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="min-w-0">
                <h3 className="truncate text-xl font-semibold">{displayLabel}</h3>
                <p className="mt-1 text-sm text-white/72">@{user?.username}</p>
                <p className="mt-2 text-xs text-white/64">
                  {t("profile:editProfileModal.changeAvatarHint")}
                </p>
              </div>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            className="hidden"
          />
        </div>

        <div className="space-y-4">
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
            rows={4}
            disabled={isLoading}
            hint={t("profile:editProfileModal.bioHint", { count: 500 })}
          />
        </div>

        <div className="rounded-[22px] border border-border/70 bg-background/70 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
            {t("profile:settings.readOnlyTitle")}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input label={t("profile:settings.employeeCode")} value={employeeCode} readOnly disabled />
            <Input label={t("profile:settings.hrLegalName")} value={hrLegalName} readOnly disabled />
            <Input label={t("profile:settings.corporateEmail")} value={corporateEmail} readOnly disabled />
          </div>
        </div>

        <div className="flex gap-3 pt-1">
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
