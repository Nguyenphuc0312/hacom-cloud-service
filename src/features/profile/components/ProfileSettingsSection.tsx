import React from "react";
import axios from "axios";
import { useTranslation } from "react-i18next";
import {
  Cog6ToothIcon,
  IdentificationIcon,
  PhotoIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import { Avatar } from "../../../components/common/Avatar";
import { Button, Input, Textarea, toast } from "../../../components/ui";
import { SettingsSection } from "../../../components/settings";
import { useAuthStore, type User } from "../../../stores";
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

type UploadSupportState = "unknown" | "supported" | "unsupported";

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

const isUnsupportedUploadError = (error: unknown): boolean =>
  axios.isAxiosError(error) &&
  [404, 405, 501].includes(error.response?.status ?? 0);

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;

const readUserValue = (
  user: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string | null => {
  if (!user) {
    return null;
  }

  for (const key of keys) {
    const value = user[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
};

const readUploadUrl = (payload: unknown, ...keys: string[]): string | null => {
  const root = asRecord(payload);
  if (!root) {
    return null;
  }

  const nestedData = asRecord(root.data);
  return readUserValue(nestedData, ...keys) || readUserValue(root, ...keys);
};

const resolveAvatarFromUploadResponse = (
  payload: unknown,
  fallbackAvatar: string | undefined,
): string | undefined => {
  try {
    const unwrapped = unwrapApiSuccess(payload as never) as Record<
      string,
      unknown
    >;
    return (
      readUserValue(unwrapped, "avatar", "avatarUrl", "url") || fallbackAvatar
    );
  } catch {
    return (
      readUploadUrl(payload, "avatar", "avatarUrl", "url") || fallbackAvatar
    );
  }
};

const resolvePatchedProfileData = (payload: unknown): Partial<User> => {
  try {
    return unwrapApiSuccess(payload as never) as Partial<User>;
  } catch {
    const root = asRecord(payload);
    const nestedData = asRecord(root?.data);
    return ((nestedData || root || {}) as unknown as Partial<User>) ?? {};
  }
};

export const ProfileSettingsSection: React.FC = () => {
  const { t } = useTranslation(["profile", "common"]);
  const { user, updateUser } = useAuthStore();
  const userRecord = (user as Record<string, unknown> | null) ?? null;

  const [displayName, setDisplayName] = React.useState(user?.displayName || "");
  const [bio, setBio] = React.useState(user?.bio || "");
  const [avatarFile, setAvatarFile] = React.useState<File | null>(null);
  const [backgroundFile, setBackgroundFile] = React.useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = React.useState<string | null>(null);
  const [backgroundPreview, setBackgroundPreview] = React.useState<
    string | null
  >(readUserValue(userRecord, "backgroundImageUrl", "background_image_url"));
  const [isSaving, setIsSaving] = React.useState(false);
  const [avatarSupport, setAvatarSupport] =
    React.useState<UploadSupportState>("unknown");
  const [backgroundSupport, setBackgroundSupport] =
    React.useState<UploadSupportState>("unknown");
  const saveActionRef = React.useRef(false);

  const avatarInputRef = React.useRef<HTMLInputElement | null>(null);
  const backgroundInputRef = React.useRef<HTMLInputElement | null>(null);

  const employeeCode = readUserValue(
    userRecord,
    "employeeCode",
    "employee_code",
  );
  const hrLegalName = readUserValue(
    userRecord,
    "fullNameFromHR",
    "full_name_from_hr",
    "fullName",
    "full_name",
  );
  const corporateEmail = readUserValue(
    userRecord,
    "corporateEmail",
    "emailFromHr",
    "email_from_hr",
    "email",
  );
  const departmentName = readUserValue(
    userRecord,
    "departmentName",
    "department_name",
    "orgUnit",
    "org_unit",
  );
  const unitCode = readUserValue(userRecord, "unitCode", "unit_code");

  React.useEffect(() => {
    return () => {
      if (avatarPreview?.startsWith("blob:")) {
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
    setBackgroundPreview(
      readUserValue(
        (user as Record<string, unknown> | null) ?? null,
        "backgroundImageUrl",
        "background_image_url",
      ),
    );
  }, [user?.bio, user?.displayName, user]);

  const handleAvatarPick = (file: File): void => {
    const validationError = validateImageFile(file, AVATAR_MAX_SIZE, t);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setAvatarFile(file);
    setAvatarSupport("supported");
    if (avatarPreview?.startsWith("blob:")) {
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
    setBackgroundSupport("supported");
    if (backgroundPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(backgroundPreview);
    }
    setBackgroundPreview(fileToPreviewUrl(file));
  };

  const uploadBackground = async (
    file: File,
    fallbackBackground: string | null,
  ): Promise<string | null> => {
    const formData = new FormData();
    formData.append("background", file);

    try {
      const response = await apiClient.put("/users/background", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setBackgroundSupport("supported");
      return (
        readUploadUrl(response.data, "backgroundImageUrl", "background") ||
        fallbackBackground
      );
    } catch (primaryError) {
      if (isUnsupportedUploadError(primaryError)) {
        try {
          const fallbackResponse = await apiClient.put(
            "/users/profile/background",
            formData,
            {
              headers: { "Content-Type": "multipart/form-data" },
            },
          );
          setBackgroundSupport("supported");
          return (
            readUploadUrl(
              fallbackResponse.data,
              "backgroundImageUrl",
              "background",
            ) || fallbackBackground
          );
        } catch (fallbackError) {
          if (isUnsupportedUploadError(fallbackError)) {
            setBackgroundSupport("unsupported");
          }
          throw fallbackError;
        }
      }

      throw primaryError;
    }
  };

  const hasChanges =
    displayName !== (user?.displayName || "") ||
    bio !== (user?.bio || "") ||
    Boolean(avatarFile) ||
    Boolean(backgroundFile);

  const handleSave = async (): Promise<void> => {
    if (!user || !hasChanges || isSaving || saveActionRef.current) {
      return;
    }

    saveActionRef.current = true;
    setIsSaving(true);

    try {
      let uploadedAvatar = user.avatar;
      let uploadedBackground =
        readUserValue(
          userRecord,
          "backgroundImageUrl",
          "background_image_url",
        ) || null;

      if (avatarFile) {
        try {
          const avatarResponse = await userApi.updateAvatar(avatarFile);
          uploadedAvatar = resolveAvatarFromUploadResponse(
            avatarResponse,
            uploadedAvatar,
          );
          setAvatarSupport("supported");
        } catch (avatarError) {
          if (isUnsupportedUploadError(avatarError)) {
            setAvatarSupport("unsupported");
          }
          throw avatarError;
        }
      }

      if (backgroundFile) {
        uploadedBackground = await uploadBackground(
          backgroundFile,
          uploadedBackground,
        );
      }

      const profilePayload = {
        displayName: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
      };

      const profileResponse = await userApi.patchProfile(profilePayload);
      const profileData = resolvePatchedProfileData(profileResponse);
      updateUser({
        ...profileData,
        avatar: uploadedAvatar,
        backgroundImageUrl: uploadedBackground || undefined,
      });

      setAvatarFile(null);
      setBackgroundFile(null);
      toast.success(t("profile:settings.saved"));
    } catch (error) {
      const uploadUnavailable = isUnsupportedUploadError(error);
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ||
        (uploadUnavailable
          ? t("profile:settings.uploadUnavailable", {
              defaultValue:
                "Upload endpoint is unavailable right now. Try again later.",
            })
          : t("profile:settings.saveFailed"));
      toast.error(message);
    } finally {
      saveActionRef.current = false;
      setIsSaving(false);
    }
  };

  const displayLabel =
    resolveUserDisplayName(user, {
      allowLegacyFallback: true,
    }) || t("common:labels.user");
  const avatarHelpText =
    avatarSupport === "unsupported"
      ? t("profile:settings.avatarUnsupported", {
          defaultValue:
            "Avatar upload is not available in this environment right now.",
        })
      : t("profile:settings.avatarEditableHint", {
          defaultValue: "JPG, PNG, WEBP or GIF up to 5MB.",
        });
  const backgroundHelpText =
    backgroundSupport === "unsupported"
      ? t("profile:settings.backgroundUnsupported", {
          defaultValue:
            "Background upload is not available in this environment right now.",
        })
      : t("profile:settings.backgroundEditableHint", {
          defaultValue: "Optional background image up to 8MB.",
        });

  return (
    <SettingsSection
      icon={<UserCircleIcon className="h-5 w-5" />}
      title={t("profile:settings.title")}
      description={t("profile:settings.description")}
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-border bg-surface-overlay/40 p-4">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-text-primary">
            <UserCircleIcon className="h-4 w-4" />
            {t("profile:settings.personalIdentityTitle", {
              defaultValue: "Personal display identity",
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
            <div className="space-y-4">
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
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div className="space-y-2 rounded-xl border border-border bg-surface p-3">
                <p className="text-xs font-medium text-text-muted">
                  {t("profile:settings.avatar")}
                </p>
                <div className="flex items-center gap-3">
                  <Avatar
                    src={avatarPreview || user?.avatar}
                    alt={displayLabel}
                    size="lg"
                  />
                  <div className="space-y-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isSaving || avatarSupport === "unsupported"}
                      onClick={() => avatarInputRef.current?.click()}
                      leftIcon={<PhotoIcon className="h-4 w-4" />}
                    >
                      {t("profile:settings.chooseAvatar")}
                    </Button>
                    <p className="text-xs text-text-muted">{avatarHelpText}</p>
                  </div>
                </div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  disabled={isSaving || avatarSupport === "unsupported"}
                  className="hidden"
                  onChange={(event) => {
                    const nextFile = event.target.files?.[0];
                    if (nextFile) {
                      handleAvatarPick(nextFile);
                    }
                    event.currentTarget.value = "";
                  }}
                />
              </div>

              <div className="space-y-2 rounded-xl border border-border bg-surface p-3">
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
                <div className="space-y-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isSaving || backgroundSupport === "unsupported"}
                    onClick={() => backgroundInputRef.current?.click()}
                    leftIcon={<PhotoIcon className="h-4 w-4" />}
                  >
                    {t("profile:settings.chooseBackground")}
                  </Button>
                  <p className="text-xs text-text-muted">
                    {backgroundHelpText}
                  </p>
                </div>
                <input
                  ref={backgroundInputRef}
                  type="file"
                  accept="image/*"
                  disabled={isSaving || backgroundSupport === "unsupported"}
                  className="hidden"
                  onChange={(event) => {
                    const nextFile = event.target.files?.[0];
                    if (nextFile) {
                      handleBackgroundPick(nextFile);
                    }
                    event.currentTarget.value = "";
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface-overlay/40 p-4">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-text-primary">
            <IdentificationIcon className="h-4 w-4" />
            {t("profile:settings.readOnlyTitle")}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Input
              label={t("profile:settings.employeeCode")}
              value={employeeCode || "-"}
              disabled
              readOnly
            />
            <Input
              label={t("profile:settings.hrLegalName")}
              value={hrLegalName || "-"}
              disabled
              readOnly
            />
            <Input
              label={t("profile:settings.departmentName", {
                defaultValue: "Department",
              })}
              value={departmentName || "-"}
              disabled
              readOnly
            />
            <Input
              label={t("profile:settings.unitCode", {
                defaultValue: "Unit code",
              })}
              value={unitCode || "-"}
              disabled
              readOnly
            />
            <Input
              label={t("profile:settings.corporateEmail")}
              value={corporateEmail || "-"}
              disabled
              readOnly
              containerClassName="sm:col-span-2 lg:col-span-2"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface-overlay/40 p-4">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-text-primary">
            <Cog6ToothIcon className="h-4 w-4" />
            {t("profile:settings.accountSettingsTitle", {
              defaultValue: "Account settings",
            })}
          </div>
          <p className="text-sm text-text-secondary">
            {t("profile:settings.accountSettingsHint", {
              defaultValue:
                "Changes here affect how your profile appears across the chat surfaces.",
            })}
          </p>
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
