import React from "react";
import axios from "axios";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  ArrowPathIcon,
  AtSymbolIcon,
  BuildingOffice2Icon,
  CheckCircleIcon,
  EnvelopeIcon,
  PhoneIcon,
  PhotoIcon,
} from "@heroicons/react/24/outline";
import { Avatar } from "../../../components/common/Avatar";
import {
  SettingsFieldGroup,
  SettingsProfileSummary,
  SettingsSection,
} from "../../../components/settings";
import { Button, Input, Textarea, toast } from "../../../components/ui";
import { unwrapApiSuccess } from "../../../lib/apiContract";
import apiClient from "../../../lib/axios";
import { userApi } from "../../../services/api";
import { useAuthStore, type User } from "../../../stores";
import { resolveUserDisplayName } from "../../chat/identity/resolveUserDisplayName";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const AVATAR_MAX_SIZE = 5 * 1024 * 1024;
const BACKGROUND_MAX_SIZE = 8 * 1024 * 1024;
const PHONE_PATTERN = /^\+?[0-9]{10,15}$/;

type UploadSupportState = "unknown" | "supported" | "unsupported";
type FormState = { displayName: string; phone: string; bio: string };

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null;

const readValue = (
  user: Record<string, unknown> | null | undefined,
  ...keys: string[]
) => {
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

const normalizeForm = (user: User | null): FormState => ({
  displayName: user?.displayName || "",
  phone: user?.phone || "",
  bio: user?.bio || "",
});

const isUnsupportedUploadError = (error: unknown) =>
  axios.isAxiosError(error) && [404, 405, 501].includes(error.response?.status ?? 0);

const resolvePatchedProfileData = (payload: unknown): Partial<User> => {
  try {
    return unwrapApiSuccess(payload as never) as Partial<User>;
  } catch {
    const root = asRecord(payload);
    return ((asRecord(root?.data) || root || {}) as unknown as Partial<User>) ?? {};
  }
};

const resolveAvatarFromUploadResponse = (payload: unknown, fallback?: string) => {
  try {
    const data = unwrapApiSuccess(payload as never) as Record<string, unknown>;
    return readValue(data, "avatar", "avatarUrl", "url") || fallback;
  } catch {
    const root = asRecord(payload);
    return (
      readValue(asRecord(root?.data), "avatar", "avatarUrl", "url") ||
      readValue(root, "avatar", "avatarUrl", "url") ||
      fallback
    );
  }
};

const revokeBlobUrl = (value: string | null) => {
  if (value?.startsWith("blob:")) {
    URL.revokeObjectURL(value);
  }
};

interface ProfileSettingsSectionProps {
  id?: string;
}

interface SummaryMetaItemProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

const SummaryMetaItem: React.FC<SummaryMetaItemProps> = ({
  icon,
  label,
  value,
}) => (
  <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-surface px-3 py-3">
    <span className="mt-0.5 text-text-muted">{icon}</span>
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
        {label}
      </p>
      <p className="mt-1 truncate text-sm text-text-primary">{value}</p>
    </div>
  </div>
);

interface EnterpriseInfoItemProps {
  label: string;
  value: string;
}

const EnterpriseInfoItem: React.FC<EnterpriseInfoItemProps> = ({
  label,
  value,
}) => (
  <div className="rounded-xl border border-border/60 bg-surface px-3 py-3">
    <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
      {label}
    </dt>
    <dd className="mt-1 text-sm text-text-primary">{value}</dd>
  </div>
);

export const ProfileSettingsSection: React.FC<ProfileSettingsSectionProps> = ({
  id,
}) => {
  const { t } = useTranslation(["profile", "common"]);
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const refreshProfile = useAuthStore((state) => state.refreshProfile);
  const updateUser = useAuthStore((state) => state.updateUser);

  const userRecord = (user as Record<string, unknown> | null) ?? null;

  const [form, setForm] = React.useState<FormState>(() => normalizeForm(user));
  const [avatarFile, setAvatarFile] = React.useState<File | null>(null);
  const [backgroundFile, setBackgroundFile] = React.useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = React.useState<string | null>(null);
  const [backgroundPreview, setBackgroundPreview] = React.useState<string | null>(
    readValue(userRecord, "backgroundImageUrl", "background_image_url"),
  );
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [avatarSupport, setAvatarSupport] =
    React.useState<UploadSupportState>("unknown");
  const [backgroundSupport, setBackgroundSupport] =
    React.useState<UploadSupportState>("unknown");

  const avatarInputRef = React.useRef<HTMLInputElement | null>(null);
  const backgroundInputRef = React.useRef<HTMLInputElement | null>(null);
  const saveActionRef = React.useRef(false);

  const errors = React.useMemo(() => {
    const next: Partial<FormState> = {};

    if (form.displayName.trim().length > 120) {
      next.displayName = t("profile:settings.validation.displayNameMax", {
        defaultValue: "Display name must not exceed 120 characters.",
      });
    }

    if (form.bio.trim().length > 500) {
      next.bio = t("profile:settings.validation.bioMax", {
        count: 500,
        defaultValue: "Bio must not exceed 500 characters.",
      });
    }

    if (form.phone.trim() && !PHONE_PATTERN.test(form.phone.trim())) {
      next.phone = t("profile:settings.validation.phoneInvalid", {
        defaultValue: "Use a valid international phone number.",
      });
    }

    return next;
  }, [form, t]);

  const employeeCode = readValue(userRecord, "employeeCode", "employee_code");
  const hrLegalName = readValue(
    userRecord,
    "fullNameFromHR",
    "full_name_from_hr",
    "fullName",
    "full_name",
  );
  const corporateEmail = readValue(
    userRecord,
    "corporateEmail",
    "emailFromHr",
    "email_from_hr",
    "email",
  );
  const departmentName = readValue(
    userRecord,
    "departmentName",
    "department_name",
    "orgUnit",
    "org_unit",
  );
  const unitCode = readValue(userRecord, "unitCode", "unit_code");
  const jobTitle = readValue(userRecord, "title");

  const baseForm = React.useMemo(() => normalizeForm(user), [user]);
  const displayLabel =
    resolveUserDisplayName(user, { allowLegacyFallback: true }) ||
    t("common:labels.user");
  const effectiveAvatar = avatarPreview || user?.avatar;
  const effectiveBackground =
    backgroundPreview ||
    readValue(userRecord, "backgroundImageUrl", "background_image_url");
  const identityLine =
    corporateEmail ||
    (user?.username ? `@${user.username}` : null) ||
    user?.phone ||
    employeeCode ||
    t("profile:settings.identityFallback", {
      defaultValue: "Add your personal details so teammates can recognize you.",
    });
  const hasChanges =
    form.displayName !== baseForm.displayName ||
    form.phone !== baseForm.phone ||
    form.bio !== baseForm.bio ||
    Boolean(avatarFile) ||
    Boolean(backgroundFile);
  const hasErrors = Boolean(errors.displayName || errors.phone || errors.bio);

  React.useEffect(() => {
    setForm(normalizeForm(user));
    setBackgroundPreview(
      readValue(
        (user as Record<string, unknown> | null) ?? null,
        "backgroundImageUrl",
        "background_image_url",
      ),
    );
  }, [user]);

  React.useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    let cancelled = false;
    setIsRefreshing(true);
    void refreshProfile()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setIsRefreshing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, refreshProfile]);

  React.useEffect(
    () => () => {
      revokeBlobUrl(avatarPreview);
      revokeBlobUrl(backgroundPreview);
    },
    [avatarPreview, backgroundPreview],
  );

  const resetDrafts = () => {
    setForm(normalizeForm(user));
    setAvatarFile(null);
    setBackgroundFile(null);
    setAvatarPreview((current) => {
      revokeBlobUrl(current);
      return null;
    });
    setBackgroundPreview(
      readValue(
        (user as Record<string, unknown> | null) ?? null,
        "backgroundImageUrl",
        "background_image_url",
      ),
    );
  };

  const pickImage = (file: File, maxSize: number, onPick: () => void) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      toast.error(t("profile:settings.upload.unsupportedType"));
      return;
    }

    if (file.size > maxSize) {
      toast.error(
        t("profile:settings.upload.exceedsSize", {
          maxMb: Math.floor(maxSize / (1024 * 1024)),
        }),
      );
      return;
    }

    onPick();
  };

  const uploadBackground = async (file: File, fallback: string | null) => {
    const formData = new FormData();
    formData.append("background", file);

    try {
      const response = await apiClient.put("/users/background", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setBackgroundSupport("supported");
      return (
        readValue(asRecord(response.data), "backgroundImageUrl", "background") ||
        readValue(
          asRecord(asRecord(response.data)?.data),
          "backgroundImageUrl",
          "background",
        ) ||
        fallback
      );
    } catch (error) {
      if (isUnsupportedUploadError(error)) {
        setBackgroundSupport("unsupported");
      }
      throw error;
    }
  };

  const handleSave = async () => {
    if (!user || !hasChanges || hasErrors || isSaving || saveActionRef.current) {
      return;
    }

    saveActionRef.current = true;
    setIsSaving(true);

    try {
      let avatar = user.avatar;
      let background = effectiveBackground || null;

      if (avatarFile) {
        const response = await userApi.updateAvatar(avatarFile);
        avatar = resolveAvatarFromUploadResponse(response, avatar);
        setAvatarSupport("supported");
      }

      if (backgroundFile) {
        background = await uploadBackground(backgroundFile, background);
      }

      const response = await userApi.patchProfile({
        displayName: form.displayName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        bio: form.bio.trim() || undefined,
      });

      updateUser({
        ...resolvePatchedProfileData(response),
        avatar,
        backgroundImageUrl: background || undefined,
      });

      const refreshed = await refreshProfile().catch(() => null);
      setForm(normalizeForm((refreshed as User | null) || { ...user, avatar }));
      setAvatarFile(null);
      setBackgroundFile(null);
      setAvatarPreview((current) => {
        revokeBlobUrl(current);
        return null;
      });
      setBackgroundPreview(background);
      toast.success(t("profile:settings.saved"));
    } catch (error) {
      toast.error(
        (error as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ||
          (isUnsupportedUploadError(error)
            ? t("profile:settings.uploadUnavailable", {
                defaultValue:
                  "Upload endpoint is unavailable right now. Try again later.",
              })
            : t("profile:settings.saveFailed")),
      );
    } finally {
      saveActionRef.current = false;
      setIsSaving(false);
    }
  };

  return (
    <SettingsSection
      id={id}
      title={t("profile:settings.title")}
      description={t("profile:settings.description")}
    >
      <SettingsProfileSummary
        avatar={
          <Avatar
            src={effectiveAvatar}
            alt={displayLabel}
            size="xl"
            className="h-16 w-16 rounded-2xl"
          />
        }
        title={displayLabel}
        subtitle={identityLine}
        status={
          <span
            className={clsx(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
              hasChanges
                ? "bg-primary/10 text-primary"
                : "bg-success/10 text-success",
            )}
          >
            {hasChanges ? (
              <ArrowPathIcon className="h-3.5 w-3.5" />
            ) : (
              <CheckCircleIcon className="h-3.5 w-3.5" />
            )}
            {hasChanges
              ? t("profile:settings.unsaved", {
                  defaultValue: "Unsaved changes",
                })
              : t("profile:settings.synced", {
                  defaultValue: "Synced",
                })}
          </span>
        }
        actions={
          <>
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
            {avatarFile ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={isSaving}
                onClick={() => {
                  setAvatarFile(null);
                  setAvatarPreview((current) => {
                    revokeBlobUrl(current);
                    return null;
                  });
                }}
              >
                {t("common:actions.cancel")}
              </Button>
            ) : null}
          </>
        }
        meta={
          <div className="grid gap-3 sm:grid-cols-2">
            <SummaryMetaItem
              icon={<AtSymbolIcon className="h-4 w-4" />}
              label={t("profile:settings.username", {
                defaultValue: "Username",
              })}
              value={user?.username ? `@${user.username}` : t("common:status.unknown")}
            />
            <SummaryMetaItem
              icon={<EnvelopeIcon className="h-4 w-4" />}
              label={t("profile:settings.corporateEmail")}
              value={corporateEmail || t("common:status.unknown")}
            />
            <SummaryMetaItem
              icon={<PhoneIcon className="h-4 w-4" />}
              label={t("profile:editProfileModal.phone")}
              value={
                user?.phone ||
                t("profile:settings.phoneEmpty", {
                  defaultValue: "No phone number saved",
                })
              }
            />
            <SummaryMetaItem
              icon={<BuildingOffice2Icon className="h-4 w-4" />}
              label={t("profile:settings.departmentName", {
                defaultValue: "Department",
              })}
              value={departmentName || t("common:status.unknown")}
            />
          </div>
        }
      />

      <SettingsFieldGroup
        title={t("profile:settings.personalIdentityTitle", {
          defaultValue: "Profile details",
        })}
        description={t("profile:settings.saveHint", {
          defaultValue:
            "Save to apply your latest profile details everywhere instantly.",
        })}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label={t("profile:settings.displayName")}
            value={form.displayName}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                displayName: event.target.value,
              }))
            }
            placeholder={t("profile:settings.displayNamePlaceholder")}
            maxLength={120}
            disabled={isSaving}
            error={errors.displayName}
            hint={t("profile:settings.displayNameHint", {
              defaultValue:
                "This is the name everyone sees across the product.",
            })}
          />
          <Input
            label={t("profile:editProfileModal.phone")}
            value={form.phone}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                phone: event.target.value,
              }))
            }
            placeholder={t("profile:editProfileModal.phonePlaceholder")}
            maxLength={16}
            disabled={isSaving}
            error={errors.phone}
            leftIcon={<PhoneIcon className="h-4 w-4" />}
            hint={t("profile:settings.phoneHint", {
              defaultValue:
                "Use an international format so your contact info stays consistent.",
            })}
          />
          <div className="md:col-span-2">
            <Textarea
              label={t("profile:settings.bio")}
              value={form.bio}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  bio: event.target.value,
                }))
              }
              rows={3}
              maxLength={500}
              disabled={isSaving}
              error={errors.bio}
              hint={t("profile:settings.bioHint", {
                count: form.bio.trim().length,
                defaultValue:
                  "Keep it short and recognisable. {{count}} / 500 characters.",
              })}
            />
          </div>
        </div>

        <div className="border-t border-border/60 pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-text-primary">
                {hasChanges
                  ? t("profile:settings.unsaved", {
                      defaultValue: "Unsaved changes",
                    })
                  : t("profile:settings.synced", {
                      defaultValue: "Everything is up to date",
                    })}
              </p>
              <p className="mt-1 text-sm text-text-muted">
                {isRefreshing
                  ? t("profile:settings.refreshing", {
                      defaultValue: "Refreshing profile data...",
                    })
                  : t("profile:settings.saveHint", {
                      defaultValue:
                        "Save to apply your latest profile details everywhere instantly.",
                    })}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="ghost"
                disabled={!hasChanges || isSaving}
                onClick={resetDrafts}
              >
                {t("common:actions.cancel")}
              </Button>
              <Button
                type="button"
                disabled={!hasChanges || isSaving || hasErrors}
                isLoading={isSaving}
                onClick={() => {
                  void handleSave();
                }}
              >
                {t("profile:settings.save")}
              </Button>
            </div>
          </div>
        </div>
      </SettingsFieldGroup>

      <SettingsFieldGroup
        title={t("profile:settings.mediaTitle", {
          defaultValue: "Visual identity",
        })}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border/60 bg-surface px-4 py-4">
            <div className="flex items-start gap-3">
              <Avatar src={effectiveAvatar} alt={displayLabel} size="lg" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text-primary">
                  {t("profile:settings.avatar")}
                </p>
                <p className="mt-1 text-sm text-text-muted">
                  {avatarSupport === "unsupported"
                    ? t("profile:settings.avatarUnsupported", {
                        defaultValue:
                          "Avatar upload is not available in this environment right now.",
                      })
                    : t("profile:settings.avatarEditableHint", {
                        defaultValue: "JPG, PNG, WEBP or GIF up to 5MB.",
                      })}
                </p>
                {avatarFile ? (
                  <p className="mt-3 text-xs font-medium text-primary">
                    {avatarFile.name}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-surface px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text-primary">
                  {t("profile:settings.background")}
                </p>
                <p className="mt-1 text-sm text-text-muted">
                  {backgroundSupport === "unsupported"
                    ? t("profile:settings.backgroundUnsupported", {
                        defaultValue:
                          "Background upload is not available in this environment right now.",
                      })
                    : t("profile:settings.backgroundEditableHint", {
                        defaultValue: "Optional background image up to 8MB.",
                      })}
                </p>
              </div>
              <div className="flex gap-2">
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
                {backgroundFile ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={isSaving}
                    onClick={() => {
                      setBackgroundFile(null);
                      setBackgroundPreview(
                        readValue(
                          (user as Record<string, unknown> | null) ?? null,
                          "backgroundImageUrl",
                          "background_image_url",
                        ),
                      );
                    }}
                  >
                    {t("common:actions.cancel")}
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-border/60 bg-surface-overlay">
              {effectiveBackground ? (
                <img
                  src={effectiveBackground}
                  alt={t("profile:settings.backgroundPreview")}
                  className="h-32 w-full object-cover"
                />
              ) : (
                <div className="flex h-32 items-center justify-center px-4 text-center text-sm text-text-muted">
                  {t("profile:settings.noBackground")}
                </div>
              )}
            </div>
          </div>
        </div>
      </SettingsFieldGroup>

      <SettingsFieldGroup
        title={t("profile:settings.readOnlyTitle")}
        description={t("profile:settings.enterpriseInfoHint", {
          defaultValue:
            "These fields are synced from your organisation and cannot be edited here.",
        })}
      >
        <dl className="grid gap-3 sm:grid-cols-2">
          <EnterpriseInfoItem
            label={t("profile:settings.employeeCode")}
            value={employeeCode || "-"}
          />
          <EnterpriseInfoItem
            label={t("profile:settings.hrLegalName")}
            value={hrLegalName || "-"}
          />
          <EnterpriseInfoItem
            label={t("profile:settings.departmentName", {
              defaultValue: "Department",
            })}
            value={departmentName || "-"}
          />
          <EnterpriseInfoItem
            label={t("profile:settings.jobTitle", {
              defaultValue: "Title",
            })}
            value={jobTitle || "-"}
          />
          <EnterpriseInfoItem
            label={t("profile:settings.unitCode", {
              defaultValue: "Unit code",
            })}
            value={unitCode || "-"}
          />
          <EnterpriseInfoItem
            label={t("profile:settings.corporateEmail")}
            value={corporateEmail || "-"}
          />
        </dl>
      </SettingsFieldGroup>

      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        disabled={isSaving || avatarSupport === "unsupported"}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            pickImage(file, AVATAR_MAX_SIZE, () => {
              setAvatarFile(file);
              setAvatarSupport("supported");
              setAvatarPreview((current) => {
                revokeBlobUrl(current);
                return URL.createObjectURL(file);
              });
            });
          }
          event.currentTarget.value = "";
        }}
      />

      <input
        ref={backgroundInputRef}
        type="file"
        accept="image/*"
        disabled={isSaving || backgroundSupport === "unsupported"}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            pickImage(file, BACKGROUND_MAX_SIZE, () => {
              setBackgroundFile(file);
              setBackgroundSupport("supported");
              setBackgroundPreview((current) => {
                revokeBlobUrl(current);
                return URL.createObjectURL(file);
              });
            });
          }
          event.currentTarget.value = "";
        }}
      />
    </SettingsSection>
  );
};

export default ProfileSettingsSection;
