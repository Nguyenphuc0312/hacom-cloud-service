import React from "react";
import {
  AtSymbolIcon,
  CameraIcon,
  PhoneIcon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { VALIDATION_CONFIG } from "../../../config";
import { Avatar } from "../../../components/common/Avatar";
import { Button, ConfirmDialog, Input, Modal, Textarea, toast } from "../../../components/ui";
import { unwrapApiSuccess } from "../../../lib/apiContract";
import { userApi } from "../../../services/api";
import { useAuthStore, type User } from "../../../stores";
import { resolveUserDisplayName } from "../../chat/identity/resolveUserDisplayName";

const USERNAME_PATTERN = /^[A-Za-z0-9_]+$/;
const AVATAR_MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const PHONE_PATTERN = /^\+?[0-9]{10,15}$/;

type ProfileEditDialogMode = "full" | "quick";
type UsernameState = "idle" | "checking" | "available" | "taken" | "error";

interface ProfileEditDialogProps {
  isOpen: boolean;
  mode: ProfileEditDialogMode;
  onClose: () => void;
  restoreFocusRef?: React.RefObject<HTMLElement | null>;
}

interface ProfileDraft {
  displayName: string;
  username: string;
  phone: string;
  bio: string;
}

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
    if (typeof value === "string") {
      const normalized = value.trim();
      if (normalized) {
        return normalized;
      }
    }
  }

  return null;
};

const createDraft = (user: User | null): ProfileDraft => ({
  displayName: user?.displayName || "",
  username: user?.username || "",
  phone: user?.phone || "",
  bio: user?.bio || "",
});

const revokeBlobUrl = (value: string | null) => {
  if (value?.startsWith("blob:")) {
    URL.revokeObjectURL(value);
  }
};

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

export const ProfileEditDialog: React.FC<ProfileEditDialogProps> = ({
  isOpen,
  mode,
  onClose,
  restoreFocusRef,
}) => {
  const { t } = useTranslation(["profile", "common", "auth", "validation", "error"]);
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const refreshProfile = useAuthStore((state) => state.refreshProfile);
  const [draft, setDraft] = React.useState<ProfileDraft>(() => createDraft(user));
  const [baseline, setBaseline] = React.useState<ProfileDraft>(() => createDraft(user));
  const [avatarFile, setAvatarFile] = React.useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [isDiscardOpen, setIsDiscardOpen] = React.useState(false);
  const [usernameState, setUsernameState] = React.useState<UsernameState>("idle");
  const [checkedUsername, setCheckedUsername] = React.useState("");

  const displayNameRef = React.useRef<HTMLInputElement | null>(null);
  const avatarInputRef = React.useRef<HTMLInputElement | null>(null);

  const currentUserRecord = (user as Record<string, unknown> | null) ?? null;
  const corporateEmail =
    readValue(currentUserRecord, "corporateEmail", "emailFromHr", "email_from_hr") ||
    user?.email ||
    "";
  const displayLabel =
    draft.displayName.trim() ||
    resolveUserDisplayName(user, { allowLegacyFallback: true }) ||
    t("common:labels.user");
  const effectiveAvatar = avatarPreview || user?.avatar;

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    const nextDraft = createDraft(user);
    setDraft(nextDraft);
    setBaseline(nextDraft);
    setAvatarFile(null);
    setAvatarPreview((current) => {
      revokeBlobUrl(current);
      return null;
    });
    setIsSaving(false);
    setSubmitError(null);
    setIsDiscardOpen(false);
    setUsernameState("idle");
    setCheckedUsername("");
  }, [isOpen, user]);

  React.useEffect(
    () => () => {
      revokeBlobUrl(avatarPreview);
    },
    [avatarPreview],
  );

  const normalizedUsername = draft.username.trim();
  const normalizedPhone = draft.phone.trim();
  const normalizedBioLength = draft.bio.trim().length;
  const isUsernameDirty = mode === "full" && normalizedUsername !== baseline.username.trim();
  const hasChanges =
    draft.displayName !== baseline.displayName ||
    draft.username !== baseline.username ||
    draft.phone !== baseline.phone ||
    draft.bio !== baseline.bio ||
    Boolean(avatarFile);

  const displayNameError =
    draft.displayName.trim().length > 120
      ? t("profile:settings.validation.displayNameMax")
      : undefined;
  const phoneError =
    mode === "full" && normalizedPhone && !PHONE_PATTERN.test(normalizedPhone)
      ? t("profile:settings.validation.phoneInvalid")
      : undefined;
  const bioError =
    normalizedBioLength > VALIDATION_CONFIG.BIO_MAX_LENGTH
      ? t("profile:settings.validation.bioMax", {
          count: VALIDATION_CONFIG.BIO_MAX_LENGTH,
        })
      : undefined;

  const usernameError = React.useMemo(() => {
    if (mode !== "full") {
      return undefined;
    }

    if (!normalizedUsername) {
      return t("validation:register.usernameRequired");
    }

    if (normalizedUsername.length < VALIDATION_CONFIG.USERNAME_MIN_LENGTH) {
      return t("validation:register.usernameMin", {
        count: VALIDATION_CONFIG.USERNAME_MIN_LENGTH,
      });
    }

    if (normalizedUsername.length > VALIDATION_CONFIG.USERNAME_MAX_LENGTH) {
      return t("validation:register.usernameMax", {
        count: VALIDATION_CONFIG.USERNAME_MAX_LENGTH,
      });
    }

    if (!USERNAME_PATTERN.test(normalizedUsername)) {
      return t("validation:register.usernamePattern");
    }

    return undefined;
  }, [mode, normalizedUsername, t]);

  React.useEffect(() => {
    if (mode !== "full" || !isOpen) {
      return undefined;
    }

    if (!isUsernameDirty || usernameError) {
      setUsernameState("idle");
      setCheckedUsername("");
      return undefined;
    }

    const requestValue = normalizedUsername;
    const timeoutId = window.setTimeout(() => {
      setUsernameState("checking");
      void userApi
        .checkUsername(requestValue)
        .then((response) => {
          const result = unwrapApiSuccess(response);
          setCheckedUsername(requestValue);
          setUsernameState(result.available ? "available" : "taken");
        })
        .catch(() => {
          setCheckedUsername(requestValue);
          setUsernameState("error");
        });
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [isOpen, isUsernameDirty, mode, normalizedUsername, usernameError]);

  const usernameHint = React.useMemo(() => {
    if (mode !== "full") {
      return undefined;
    }

    if (!isUsernameDirty || usernameError) {
      return undefined;
    }

    if (usernameState === "checking") {
      return t("auth:username.checking");
    }

    if (usernameState === "available" && checkedUsername === normalizedUsername) {
      return t("auth:username.available");
    }

    if (usernameState === "taken" && checkedUsername === normalizedUsername) {
      return t("auth:username.taken");
    }

    if (usernameState === "error" && checkedUsername === normalizedUsername) {
      return t("error:generic.requestFailed");
    }

    return undefined;
  }, [
    checkedUsername,
    isUsernameDirty,
    mode,
    normalizedUsername,
    t,
    usernameError,
    usernameState,
  ]);

  const hasValidationErrors = Boolean(
    displayNameError ||
      phoneError ||
      bioError ||
      usernameError ||
      (mode === "full" &&
        isUsernameDirty &&
        (checkedUsername !== normalizedUsername ||
          usernameState === "idle" ||
          usernameState === "checking" ||
          usernameState === "taken" ||
          usernameState === "error")),
  );

  const resetDraft = React.useCallback(() => {
    const nextDraft = createDraft(user);
    setDraft(nextDraft);
    setBaseline(nextDraft);
    setAvatarFile(null);
    setAvatarPreview((current) => {
      revokeBlobUrl(current);
      return null;
    });
    setSubmitError(null);
    setUsernameState("idle");
    setCheckedUsername("");
  }, [user]);

  const requestClose = React.useCallback(() => {
    if (isSaving) {
      return;
    }

    if (hasChanges) {
      setIsDiscardOpen(true);
      return;
    }

    resetDraft();
    onClose();
  }, [hasChanges, isSaving, onClose, resetDraft]);

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      toast.error(t("profile:settings.upload.unsupportedType"));
      event.currentTarget.value = "";
      return;
    }

    if (file.size > AVATAR_MAX_SIZE) {
      toast.error(
        t("profile:settings.upload.exceedsSize", {
          maxMb: Math.floor(AVATAR_MAX_SIZE / (1024 * 1024)),
        }),
      );
      event.currentTarget.value = "";
      return;
    }

    setAvatarFile(file);
    setAvatarPreview((current) => {
      revokeBlobUrl(current);
      return URL.createObjectURL(file);
    });
    event.currentTarget.value = "";
  };

  const handleSave = async () => {
    if (!user || !hasChanges || hasValidationErrors || isSaving) {
      return;
    }

    setSubmitError(null);
    setIsSaving(true);

    try {
      const nextUsername = normalizedUsername;
      if (mode === "full" && isUsernameDirty) {
        const response = await userApi.updateUsername(nextUsername);
        updateUser(resolvePatchedProfileData(response));
        setBaseline((current) => ({
          ...current,
          username: nextUsername,
        }));
      }

      const profilePayload: Partial<User> = {};
      if (draft.displayName !== baseline.displayName) {
        profilePayload.displayName = draft.displayName.trim();
      }
      if (mode === "full" && draft.phone !== baseline.phone) {
        profilePayload.phone = normalizedPhone;
      }
      if (draft.bio !== baseline.bio) {
        profilePayload.bio = draft.bio.trim();
      }

      if (Object.keys(profilePayload).length > 0) {
        const response = await userApi.patchProfile(profilePayload);
        updateUser(resolvePatchedProfileData(response));
        setBaseline((current) => ({
          ...current,
          displayName:
            profilePayload.displayName ?? current.displayName,
          phone: profilePayload.phone ?? current.phone,
          bio: profilePayload.bio ?? current.bio,
        }));
      }

      if (avatarFile) {
        const response = await userApi.updateAvatar(avatarFile);
        const avatar = resolveAvatarFromUploadResponse(response, user.avatar);
        if (avatar) {
          updateUser({ avatar });
        }
      }

      await refreshProfile().catch(() => null);
      toast.success(t("profile:toast.profileUpdateSuccess"));
      resetDraft();
      onClose();
    } catch (error) {
      const message =
        (error as { response?: { data?: { error?: { message?: string }; message?: string } } })
          ?.response?.data?.error?.message ||
        (error as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ||
        t("profile:toast.profileUpdateFailed");

      setSubmitError(message || t("profile:toast.profileUpdateFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const footer = (
    <div className="flex flex-col gap-3">
      {submitError ? (
        <p role="alert" className="text-sm text-danger">
          {submitError}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="secondary"
          onClick={requestClose}
          disabled={isSaving}
        >
          {t("profile:editProfileModal.cancel")}
        </Button>
        <Button
          type="button"
          onClick={() => {
            void handleSave();
          }}
          isLoading={isSaving}
          disabled={!hasChanges || hasValidationErrors || isSaving}
        >
          {t("profile:editProfileModal.save")}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={requestClose}
        title={t("profile:editProfileModal.title")}
        description={
          mode === "full"
            ? t("profile:editProfileModal.fullDescription")
            : t("profile:editProfileModal.quickDescription")
        }
        size="xl"
        closeOnEsc={!isSaving}
        closeOnOverlayClick={!isSaving}
        contentClassName={mode === "full" ? "max-w-[40rem]" : "max-w-[35rem]"}
        bodyClassName="px-5 py-4 sm:px-6 sm:py-5"
        footer={footer}
        initialFocusRef={displayNameRef}
        restoreFocusRef={restoreFocusRef}
      >
        <div className="space-y-5">
          <div className="flex flex-col gap-4 border-b border-border/70 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <Avatar
                src={effectiveAvatar}
                alt={displayLabel}
                size="xl"
                className="h-16 w-16 rounded-2xl"
              />
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-text-primary">
                  {displayLabel}
                </p>
                <p className="mt-1 truncate text-sm text-text-secondary">
                  {mode === "full"
                    ? normalizedUsername
                      ? `@${normalizedUsername}`
                      : corporateEmail
                    : corporateEmail || (user?.username ? `@${user.username}` : "")}
                </p>
                <p className="mt-1 text-sm text-text-muted">
                  {t("profile:editProfileModal.changeAvatarHint")}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                leftIcon={<CameraIcon className="h-4 w-4" />}
                disabled={isSaving}
                onClick={() => avatarInputRef.current?.click()}
              >
                {t("profile:settings.chooseAvatar")}
              </Button>
              {avatarFile ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
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
            </div>
          </div>

          <div className="space-y-4">
            <Input
              ref={displayNameRef}
              label={t("profile:settings.displayName")}
              value={draft.displayName}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  displayName: event.target.value,
                }))
              }
              placeholder={t("profile:settings.displayNamePlaceholder")}
              maxLength={120}
              disabled={isSaving}
              error={displayNameError}
            />

            {mode === "full" ? (
              <Input
                label={t("profile:settings.username")}
                value={draft.username}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    username: event.target.value.replace(/\s+/g, ""),
                  }))
                }
                placeholder={t("profile:settings.usernamePlaceholder")}
                maxLength={VALIDATION_CONFIG.USERNAME_MAX_LENGTH}
                disabled={isSaving}
                error={usernameError}
                hint={usernameHint}
                leftIcon={<AtSymbolIcon className="h-4 w-4" />}
              />
            ) : null}

            {mode === "full" ? (
              <Input
                label={t("profile:editProfileModal.phone")}
                value={draft.phone}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    phone: event.target.value,
                  }))
                }
                placeholder={t("profile:editProfileModal.phonePlaceholder")}
                disabled={isSaving}
                error={phoneError}
                leftIcon={<PhoneIcon className="h-4 w-4" />}
              />
            ) : null}

            <Textarea
              label={t("profile:editProfileModal.bio")}
              value={draft.bio}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  bio: event.target.value,
                }))
              }
              placeholder={t("profile:editProfileModal.bioPlaceholder")}
              rows={3}
              maxLength={VALIDATION_CONFIG.BIO_MAX_LENGTH}
              disabled={isSaving}
              error={bioError}
              hint={t("profile:editProfileModal.bioHint", {
                count: normalizedBioLength,
              })}
            />
          </div>
        </div>

        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleAvatarChange}
        />
      </Modal>

      <ConfirmDialog
        isOpen={isDiscardOpen}
        onClose={() => setIsDiscardOpen(false)}
        onConfirm={() => {
          setIsDiscardOpen(false);
          resetDraft();
          onClose();
        }}
        title={t("profile:editProfileModal.discardTitle")}
        message={t("profile:editProfileModal.discardDescription")}
        confirmText={t("common:actions.confirm")}
        cancelText={t("common:actions.cancel")}
        variant="warning"
      />
    </>
  );
};

export type { ProfileEditDialogMode, ProfileEditDialogProps };

export default ProfileEditDialog;
