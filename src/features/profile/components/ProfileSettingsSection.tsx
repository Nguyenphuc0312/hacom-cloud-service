import React from "react";
import { useTranslation } from "react-i18next";
import {
  IdentificationIcon,
  PhotoIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import { Avatar } from "../../../components/common/Avatar";
import { Button, Input, Textarea, toast } from "../../../components/ui";
import { SettingsSection } from "../../../components/settings";
import { useAuthStore } from "../../../stores";
import { userApi } from "../../../services/api";
import apiClient from "../../../lib/axios";
import { unwrapApiSuccess } from "../../../lib/apiContract";
import { resolveUserDisplayName } from "../../chat/identity/resolveUserDisplayName";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const AVATAR_MAX_SIZE = 5 * 1024 * 1024;
const BACKGROUND_MAX_SIZE = 8 * 1024 * 1024;

const validateImageFile = (
  file: File,
  maxSize: number,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | null => {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return t("profile:settings.upload.unsupportedType");
  }

  if (file.size > maxSize) {
    return t("profile:settings.upload.exceedsSize", {
      maxMb: Math.floor(maxSize / (1024 * 1024)),
    });
  }

  return null;
};

const fileToPreviewUrl = (file: File): string => URL.createObjectURL(file);

export const ProfileSettingsSection: React.FC = () => {
  const { t } = useTranslation(["profile", "common"]);
  const { user, updateUser } = useAuthStore();

  const [displayName, setDisplayName] = React.useState(user?.displayName || "");
  const [bio, setBio] = React.useState(user?.bio || "");
  const [avatarFile, setAvatarFile] = React.useState<File | null>(null);
  const [backgroundFile, setBackgroundFile] = React.useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = React.useState<string | null>(null);
  const [backgroundPreview, setBackgroundPreview] = React.useState<
    string | null
  >(
    (user as { backgroundImageUrl?: string | null } | null)
      ?.backgroundImageUrl || null,
  );
  const [isSaving, setIsSaving] = React.useState(false);

  const avatarInputRef = React.useRef<HTMLInputElement | null>(null);
  const backgroundInputRef = React.useRef<HTMLInputElement | null>(null);

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

  React.useEffect(() => {
    return () => {
      if (avatarPreview) {
        URL.revokeObjectURL(avatarPreview);
      }
      if (backgroundPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(backgroundPreview);
      }
    };
  }, [avatarPreview, backgroundPreview]);

  React.useEffect(() => {
    setDisplayName(user?.displayName || "");
    setBio(user?.bio || "");
  }, [user?.bio, user?.displayName]);

  const handleAvatarPick = (file: File): void => {
    const validationError = validateImageFile(file, AVATAR_MAX_SIZE, t);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setAvatarFile(file);
    if (avatarPreview) {
      URL.revokeObjectURL(avatarPreview);
    }
    setAvatarPreview(fileToPreviewUrl(file));
  };

  const handleBackgroundPick = (file: File): void => {
    const validationError = validateImageFile(file, BACKGROUND_MAX_SIZE, t);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setBackgroundFile(file);
    if (backgroundPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(backgroundPreview);
    }
    setBackgroundPreview(fileToPreviewUrl(file));
  };

  const uploadBackground = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("background", file);

    try {
      const response = await apiClient.put("/users/background", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return (
        response.data?.data?.backgroundImageUrl ||
        response.data?.data?.background ||
        ""
      );
    } catch {
      // Backward-compatible fallback for transitional backends.
      const response = await apiClient.put(
        "/users/profile/background",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        },
      );
      return (
        response.data?.data?.backgroundImageUrl ||
        response.data?.data?.background ||
        ""
      );
    }
  };

  const hasChanges =
    displayName !== (user?.displayName || "") ||
    bio !== (user?.bio || "") ||
    Boolean(avatarFile) ||
    Boolean(backgroundFile);

  const handleSave = async (): Promise<void> => {
    if (!user || !hasChanges) {
      return;
    }

    setIsSaving(true);

    try {
      let uploadedAvatar = user.avatar;
      let uploadedBackground =
        (user as { backgroundImageUrl?: string | null }).backgroundImageUrl ||
        null;

      if (avatarFile) {
        const avatarResponse = await userApi.updateAvatar(avatarFile);
        uploadedAvatar =
          unwrapApiSuccess(avatarResponse).avatar || uploadedAvatar;
      }

      if (backgroundFile) {
        uploadedBackground = await uploadBackground(backgroundFile);
      }

      const profilePayload = {
        displayName: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
      };

      const profileResponse = await userApi.patchProfile(profilePayload);
      const profileData = unwrapApiSuccess(profileResponse);
      updateUser({
        ...profileData,
        avatar: uploadedAvatar,
        backgroundImageUrl: uploadedBackground || undefined,
      });

      setAvatarFile(null);
      setBackgroundFile(null);
      toast.success(t("profile:settings.saved"));
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message || t("profile:settings.saveFailed");
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const displayLabel =
    resolveUserDisplayName(user, {
      allowLegacyFallback: true,
    }) || t("common:labels.user");

  return (
    <SettingsSection
      icon={<UserCircleIcon className="h-5 w-5" />}
      title={t("profile:settings.title")}
      description={t("profile:settings.description")}
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-medium text-text-muted">
              {t("profile:settings.avatar")}
            </p>
            <div className="flex items-center gap-3">
              <Avatar
                src={avatarPreview || user?.avatar}
                alt={displayLabel}
                size="lg"
              />
              <div className="space-x-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => avatarInputRef.current?.click()}
                  leftIcon={<PhotoIcon className="h-4 w-4" />}
                >
                  {t("profile:settings.chooseAvatar")}
                </Button>
              </div>
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const nextFile = event.target.files?.[0];
                if (nextFile) {
                  handleAvatarPick(nextFile);
                }
              }}
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-text-muted">
              {t("profile:settings.background")}
            </p>
            <div className="h-24 overflow-hidden rounded-xl border border-border bg-surface-overlay">
              {backgroundPreview ? (
                <img
                  src={backgroundPreview}
                  alt={t("profile:settings.backgroundPreview")}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-text-muted">
                  {t("profile:settings.noBackground")}
                </div>
              )}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => backgroundInputRef.current?.click()}
              leftIcon={<PhotoIcon className="h-4 w-4" />}
            >
              {t("profile:settings.chooseBackground")}
            </Button>
            <input
              ref={backgroundInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const nextFile = event.target.files?.[0];
                if (nextFile) {
                  handleBackgroundPick(nextFile);
                }
              }}
            />
          </div>
        </div>

        <Input
          label={t("profile:settings.displayName")}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder={t("profile:settings.displayNamePlaceholder")}
          maxLength={80}
          disabled={isSaving}
        />

        <Textarea
          label={t("profile:settings.bio")}
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          rows={3}
          maxLength={500}
          disabled={isSaving}
        />

        <div className="rounded-xl border border-border bg-surface-overlay/60 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            <IdentificationIcon className="h-4 w-4" />
            {t("profile:settings.readOnlyTitle")}
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <Input
              label={t("profile:settings.employeeCode")}
              value={employeeCode}
              disabled
              readOnly
            />
            <Input
              label={t("profile:settings.hrLegalName")}
              value={hrLegalName}
              disabled
              readOnly
            />
            <Input
              label={t("profile:settings.corporateEmail")}
              value={corporateEmail}
              disabled
              readOnly
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            isLoading={isSaving}
            disabled={!hasChanges || isSaving}
            onClick={() => {
              void handleSave();
            }}
          >
            {t("profile:settings.save")}
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
};

export default ProfileSettingsSection;
