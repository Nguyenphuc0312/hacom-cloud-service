import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AtSymbolIcon,
  CameraIcon,
  EnvelopeIcon,
  IdentificationIcon,
  PhoneIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
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

  useEffect(
    () => () => {
      if (avatarPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(avatarPreview);
      }
    },
    [avatarPreview],
  );

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
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
        uploadedAvatar = unwrapApiSuccess(avatarResponse).avatar || uploadedAvatar;
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
    } catch (error) {
      toast.error(
        (error as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ||
          (error as { response?: { data?: { message?: string } } })?.response
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
      description={t("profile:settings.description", {
        defaultValue:
          "Update the details teammates see across direct messages and groups.",
      })}
      size="lg"
      contentClassName="max-h-[min(92vh,56rem)] overflow-hidden"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit();
        }}
        className="flex max-h-[calc(min(92vh,56rem)-7rem)] flex-col"
      >
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="space-y-6">
            <div className="overflow-hidden rounded-[24px] border border-border/70 bg-surface shadow-xs">
              <div className="bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_42%),radial-gradient(circle_at_bottom_left,rgba(245,158,11,0.16),transparent_38%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(30,41,59,0.88))] px-5 py-6 text-white sm:px-6">
                <div className="grid gap-6 md:grid-cols-[auto,minmax(0,1fr)] md:items-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="relative h-28 w-28 shrink-0">
                      <div className="h-full w-full overflow-hidden rounded-[1.75rem] border border-white/15 bg-white/10 p-1.5 backdrop-blur-sm">
                        <Avatar
                          src={avatarPreview || user?.avatar}
                          alt={displayLabel}
                          size="xl"
                          className="h-full w-full"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute bottom-1 right-1 flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-white text-slate-900 shadow-lg transition-colors hover:bg-slate-100"
                        aria-label={t("profile:settings.chooseAvatar")}
                      >
                        <CameraIcon className="h-4.5 w-4.5" />
                      </button>

                      {avatarPreview ? (
                        <button
                          type="button"
                          onClick={handleRemoveAvatar}
                          className="absolute -right-1.5 -top-1.5 flex h-8 w-8 items-center justify-center rounded-full border border-danger/20 bg-danger text-text-inverse shadow-lg"
                          aria-label={t("common:actions.remove", {
                            defaultValue: "Remove",
                          })}
                        >
                          <XMarkIcon className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isLoading}
                        leftIcon={<CameraIcon className="h-4 w-4" />}
                      >
                        {t("profile:settings.chooseAvatar")}
                      </Button>
                      {avatarPreview ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={handleRemoveAvatar}
                          disabled={isLoading}
                        >
                          {t("common:actions.remove", {
                            defaultValue: "Remove",
                          })}
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="min-w-0 space-y-3 text-left">
                    <div>
                      <h3 className="truncate text-2xl font-semibold sm:text-3xl">
                        {displayLabel}
                      </h3>
                      {user?.username ? (
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-white/78">
                          <AtSymbolIcon className="h-4 w-4" />
                          {user.username}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs text-white/80">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1">
                        <IdentificationIcon className="h-3.5 w-3.5" />
                        {employeeCode}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1">
                        <EnvelopeIcon className="h-3.5 w-3.5" />
                        {corporateEmail}
                      </span>
                    </div>

                    <p className="max-w-2xl text-sm leading-6 text-white/78">
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

            <div className="rounded-[24px] border border-border/70 bg-background/70 p-5">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-text-primary">
                <PhoneIcon className="h-4 w-4" />
                {t("profile:settings.personalIdentityTitle", {
                  defaultValue: "Profile details",
                })}
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
                  leftIcon={<PhoneIcon className="h-4 w-4" />}
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
            </div>

            <div className="rounded-[24px] border border-border/70 bg-background/70 p-5">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-text-primary">
                <IdentificationIcon className="h-4 w-4" />
                {t("profile:settings.readOnlyTitle")}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                <Input
                  label={t("profile:settings.username", {
                    defaultValue: "Username",
                  })}
                  value={user?.username ? `@${user.username}` : "-"}
                  readOnly
                  disabled
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row">
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
