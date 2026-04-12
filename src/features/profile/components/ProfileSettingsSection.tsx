import React from "react";
import axios from "axios";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  ArrowPathIcon,
  AtSymbolIcon,
  BriefcaseIcon,
  BuildingOffice2Icon,
  CheckCircleIcon,
  EnvelopeIcon,
  IdentificationIcon,
  PhoneIcon,
  PhotoIcon,
  SparklesIcon,
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

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const AVATAR_MAX_SIZE = 5 * 1024 * 1024;
const BACKGROUND_MAX_SIZE = 8 * 1024 * 1024;
const PHONE_PATTERN = /^\+?[0-9]{10,15}$/;
type UploadSupportState = "unknown" | "supported" | "unsupported";
type FormState = { displayName: string; phone: string; bio: string };

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null;
const readValue = (user: Record<string, unknown> | null | undefined, ...keys: string[]) => {
  if (!user) return null;
  for (const key of keys) {
    const value = user[key];
    if (typeof value === "string" && value.trim()) return value.trim();
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
    return readValue(asRecord(root?.data), "avatar", "avatarUrl", "url") || readValue(root, "avatar", "avatarUrl", "url") || fallback;
  }
};

export const ProfileSettingsSection: React.FC = () => {
  const { t } = useTranslation(["profile", "common"]);
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const updateUser = useAuthStore((state) => state.updateUser);
  const refreshProfile = useAuthStore((state) => state.refreshProfile);
  const userRecord = (user as Record<string, unknown> | null) ?? null;
  const [form, setForm] = React.useState<FormState>(() => normalizeForm(user));
  const [avatarFile, setAvatarFile] = React.useState<File | null>(null);
  const [backgroundFile, setBackgroundFile] = React.useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = React.useState<string | null>(null);
  const [backgroundPreview, setBackgroundPreview] = React.useState<string | null>(
    readValue(userRecord, "backgroundImageUrl", "background_image_url"),
  );
  const [isSaving, setIsSaving] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [avatarSupport, setAvatarSupport] = React.useState<UploadSupportState>("unknown");
  const [backgroundSupport, setBackgroundSupport] = React.useState<UploadSupportState>("unknown");
  const avatarInputRef = React.useRef<HTMLInputElement | null>(null);
  const backgroundInputRef = React.useRef<HTMLInputElement | null>(null);
  const saveActionRef = React.useRef(false);

  const errors = React.useMemo(() => {
    const next: Partial<FormState> = {};
    if (form.displayName.trim().length > 120) next.displayName = t("profile:settings.validation.displayNameMax", { defaultValue: "Display name must not exceed 120 characters." });
    if (form.bio.trim().length > 500) next.bio = t("profile:settings.validation.bioMax", { count: 500, defaultValue: "Bio must not exceed 500 characters." });
    if (form.phone.trim() && !PHONE_PATTERN.test(form.phone.trim())) next.phone = t("profile:settings.validation.phoneInvalid", { defaultValue: "Use a valid international phone number." });
    return next;
  }, [form, t]);

  const employeeCode = readValue(userRecord, "employeeCode", "employee_code");
  const hrLegalName = readValue(userRecord, "fullNameFromHR", "full_name_from_hr", "fullName", "full_name");
  const corporateEmail = readValue(userRecord, "corporateEmail", "emailFromHr", "email_from_hr", "email");
  const departmentName = readValue(userRecord, "departmentName", "department_name", "orgUnit", "org_unit");
  const unitCode = readValue(userRecord, "unitCode", "unit_code");
  const jobTitle = readValue(userRecord, "title");
  const displayLabel = resolveUserDisplayName(user, { allowLegacyFallback: true }) || t("common:labels.user");
  const baseForm = React.useMemo(() => normalizeForm(user), [user]);
  const hasChanges = form.displayName !== baseForm.displayName || form.phone !== baseForm.phone || form.bio !== baseForm.bio || Boolean(avatarFile) || Boolean(backgroundFile);
  const hasErrors = Boolean(errors.displayName || errors.phone || errors.bio);
  const effectiveBackground = backgroundPreview || readValue(userRecord, "backgroundImageUrl", "background_image_url");

  React.useEffect(() => {
    setForm(normalizeForm(user));
    setBackgroundPreview(readValue((user as Record<string, unknown> | null) ?? null, "backgroundImageUrl", "background_image_url"));
  }, [user]);

  React.useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    setIsRefreshing(true);
    void refreshProfile().catch(() => undefined).finally(() => {
      if (!cancelled) setIsRefreshing(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, refreshProfile]);

  React.useEffect(() => {
    return () => {
      if (avatarPreview?.startsWith("blob:")) URL.revokeObjectURL(avatarPreview);
      if (backgroundPreview?.startsWith("blob:")) URL.revokeObjectURL(backgroundPreview);
    };
  }, [avatarPreview, backgroundPreview]);

  const resetDrafts = () => {
    setForm(normalizeForm(user));
    setAvatarFile(null);
    setBackgroundFile(null);
    setAvatarPreview((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return null;
    });
    setBackgroundPreview(readValue((user as Record<string, unknown> | null) ?? null, "backgroundImageUrl", "background_image_url"));
  };

  const pickImage = (file: File, maxSize: number, onPick: () => void) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) return toast.error(t("profile:settings.upload.unsupportedType"));
    if (file.size > maxSize) return toast.error(t("profile:settings.upload.exceedsSize", { maxMb: Math.floor(maxSize / (1024 * 1024)) }));
    onPick();
  };

  const uploadBackground = async (file: File, fallback: string | null) => {
    const formData = new FormData();
    formData.append("background", file);
    try {
      const response = await apiClient.put("/users/background", formData, { headers: { "Content-Type": "multipart/form-data" } });
      setBackgroundSupport("supported");
      return readValue(asRecord(response.data), "backgroundImageUrl", "background") || readValue(asRecord(asRecord(response.data)?.data), "backgroundImageUrl", "background") || fallback;
    } catch (error) {
      if (isUnsupportedUploadError(error)) setBackgroundSupport("unsupported");
      throw error;
    }
  };

  const handleSave = async () => {
    if (!user || !hasChanges || hasErrors || isSaving || saveActionRef.current) return;
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
      if (backgroundFile) background = await uploadBackground(backgroundFile, background);
      const response = await userApi.patchProfile({
        displayName: form.displayName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        bio: form.bio.trim() || undefined,
      });
      updateUser({ ...resolvePatchedProfileData(response), avatar, backgroundImageUrl: background || undefined });
      const refreshed = await refreshProfile().catch(() => null);
      setForm(normalizeForm((refreshed as User | null) || { ...user, avatar }));
      setAvatarFile(null);
      setBackgroundFile(null);
      setAvatarPreview((current) => {
        if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
        return null;
      });
      setBackgroundPreview(background);
      toast.success(t("profile:settings.saved"));
    } catch (error) {
      toast.error(
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          (isUnsupportedUploadError(error)
            ? t("profile:settings.uploadUnavailable", { defaultValue: "Upload endpoint is unavailable right now. Try again later." })
            : t("profile:settings.saveFailed")),
      );
    } finally {
      saveActionRef.current = false;
      setIsSaving(false);
    }
  };

  return (
    <SettingsSection icon={<UserCircleIcon className="h-5 w-5" />} title={t("profile:settings.title")} description={t("profile:settings.description")} className="overflow-hidden">
      <div className="space-y-5">
        <div className="overflow-hidden rounded-[28px] border border-border/70 bg-surface shadow-xs">
          <div className="relative min-h-[220px] overflow-hidden p-5 sm:p-6" style={effectiveBackground ? { backgroundImage: `linear-gradient(135deg, rgba(15,23,42,0.74), rgba(15,23,42,0.4)), url(${effectiveBackground})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
            {!effectiveBackground && <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_42%),radial-gradient(circle_at_bottom_left,rgba(245,158,11,0.18),transparent_38%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(30,41,59,0.88))]" />}
            <div className="relative z-10 flex h-full flex-col justify-between gap-8 text-white">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 font-semibold uppercase tracking-[0.18em] backdrop-blur-sm"><SparklesIcon className="h-3.5 w-3.5" />{t("profile:settings.summaryBadge", { defaultValue: "Profile overview" })}</span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 backdrop-blur-sm">{hasChanges ? <ArrowPathIcon className="h-3.5 w-3.5" /> : <CheckCircleIcon className="h-3.5 w-3.5" />}{hasChanges ? t("profile:settings.unsaved", { defaultValue: "Unsaved changes" }) : t("profile:settings.synced", { defaultValue: "Synced" })}</span>
              </div>
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="rounded-[1.7rem] border border-white/15 bg-white/10 p-1.5 backdrop-blur-sm"><Avatar src={avatarPreview || user?.avatar} alt={displayLabel} size="xl" className="h-24 w-24" /></div>
                  <div className="min-w-0">
                    <h3 className="truncate text-2xl font-semibold sm:text-3xl">{displayLabel}</h3>
                    <div className="mt-2 flex flex-wrap gap-2 text-sm text-white/78">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1"><AtSymbolIcon className="h-4 w-4" />{user?.username}</span>
                      {corporateEmail && <span className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1"><EnvelopeIcon className="h-4 w-4" />{corporateEmail}</span>}
                    </div>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3 backdrop-blur-sm"><p className="text-[11px] uppercase tracking-[0.18em] text-white/60">{t("profile:settings.departmentName", { defaultValue: "Department" })}</p><p className="mt-2 text-sm font-medium">{departmentName || t("common:status.unknown")}</p></div>
                  <div className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3 backdrop-blur-sm"><p className="text-[11px] uppercase tracking-[0.18em] text-white/60">{t("profile:settings.jobTitle", { defaultValue: "Title" })}</p><p className="mt-2 text-sm font-medium">{jobTitle || t("common:status.unknown")}</p></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              {[{ icon: EnvelopeIcon, label: t("profile:settings.corporateEmail"), value: corporateEmail || t("common:status.unknown") }, { icon: PhoneIcon, label: t("profile:editProfileModal.phone"), value: user?.phone || t("profile:settings.phoneEmpty", { defaultValue: "No phone number saved" }) }, { icon: BuildingOffice2Icon, label: t("profile:settings.departmentName", { defaultValue: "Department" }), value: departmentName || t("common:status.unknown") }, { icon: BriefcaseIcon, label: t("profile:settings.jobTitle", { defaultValue: "Title" }), value: jobTitle || t("common:status.unknown") }].map(({ icon: Icon, label, value }) => (
                <div key={label} className="rounded-2xl border border-border/70 bg-background/70 p-4">
                  <div className="flex items-start gap-3"><Icon className="mt-0.5 h-5 w-5 text-text-muted" /><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{label}</p><p className="mt-2 truncate text-sm font-medium text-text-primary">{value}</p></div></div>
                </div>
              ))}
            </div>

            <div className="rounded-[24px] border border-border/70 bg-background/70 p-5">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-text-primary"><PhotoIcon className="h-4 w-4" />{t("profile:settings.mediaTitle", { defaultValue: "Visual identity" })}</div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-border/70 bg-surface p-4">
                  <div className="flex items-center gap-3"><Avatar src={avatarPreview || user?.avatar} alt={displayLabel} size="lg" /><div><p className="text-sm font-semibold text-text-primary">{t("profile:settings.avatar")}</p><p className="mt-1 text-xs text-text-muted">{avatarSupport === "unsupported" ? t("profile:settings.avatarUnsupported", { defaultValue: "Avatar upload is not available in this environment right now." }) : t("profile:settings.avatarEditableHint", { defaultValue: "JPG, PNG, WEBP or GIF up to 5MB." })}</p></div></div>
                  <div className="mt-4 flex gap-2"><Button type="button" size="sm" variant="outline" disabled={isSaving || avatarSupport === "unsupported"} onClick={() => avatarInputRef.current?.click()} leftIcon={<PhotoIcon className="h-4 w-4" />}>{t("profile:settings.chooseAvatar")}</Button>{avatarFile && <Button type="button" size="sm" variant="ghost" disabled={isSaving} onClick={() => { setAvatarFile(null); setAvatarPreview(null); }}>{t("common:actions.cancel")}</Button>}</div>
                  <input ref={avatarInputRef} type="file" accept="image/*" disabled={isSaving || avatarSupport === "unsupported"} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) pickImage(file, AVATAR_MAX_SIZE, () => { setAvatarFile(file); setAvatarSupport("supported"); setAvatarPreview(URL.createObjectURL(file)); }); event.currentTarget.value = ""; }} />
                </div>
                <div className="rounded-2xl border border-border/70 bg-surface p-4">
                  <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-text-primary">{t("profile:settings.background")}</p><p className="mt-1 text-xs text-text-muted">{backgroundSupport === "unsupported" ? t("profile:settings.backgroundUnsupported", { defaultValue: "Background upload is not available in this environment right now." }) : t("profile:settings.backgroundEditableHint", { defaultValue: "Optional background image up to 8MB." })}</p></div><Button type="button" size="sm" variant="outline" disabled={isSaving || backgroundSupport === "unsupported"} onClick={() => backgroundInputRef.current?.click()} leftIcon={<PhotoIcon className="h-4 w-4" />}>{t("profile:settings.chooseBackground")}</Button></div>
                  <div className="mt-4 h-32 overflow-hidden rounded-2xl border border-border/70 bg-surface-overlay">{effectiveBackground ? <img src={effectiveBackground} alt={t("profile:settings.backgroundPreview")} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.16),transparent_36%),radial-gradient(circle_at_bottom_left,rgba(245,158,11,0.16),transparent_36%),linear-gradient(135deg,rgba(226,232,240,0.8),rgba(248,250,252,0.96))] px-4 text-center text-xs text-text-muted">{t("profile:settings.noBackground")}</div>}</div>
                  <input ref={backgroundInputRef} type="file" accept="image/*" disabled={isSaving || backgroundSupport === "unsupported"} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) pickImage(file, BACKGROUND_MAX_SIZE, () => { setBackgroundFile(file); setBackgroundSupport("supported"); setBackgroundPreview(URL.createObjectURL(file)); }); event.currentTarget.value = ""; }} />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-[24px] border border-border/70 bg-background/70 p-5">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-text-primary"><UserCircleIcon className="h-4 w-4" />{t("profile:settings.personalIdentityTitle", { defaultValue: "Profile details" })}</div>
              <div className="space-y-4">
                <Input label={t("profile:settings.displayName")} value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} placeholder={t("profile:settings.displayNamePlaceholder")} maxLength={120} disabled={isSaving} error={errors.displayName} hint={t("profile:settings.displayNameHint", { defaultValue: "This is the name everyone sees across the product." })} />
                <Input label={t("profile:editProfileModal.phone")} value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder={t("profile:editProfileModal.phonePlaceholder")} maxLength={16} disabled={isSaving} error={errors.phone} leftIcon={<PhoneIcon className="h-4 w-4" />} hint={t("profile:settings.phoneHint", { defaultValue: "Use an international format so your contact info stays consistent." })} />
                <Textarea label={t("profile:settings.bio")} value={form.bio} onChange={(event) => setForm((current) => ({ ...current, bio: event.target.value }))} rows={4} maxLength={500} disabled={isSaving} error={errors.bio} hint={t("profile:settings.bioHint", { count: form.bio.trim().length, defaultValue: "Keep it short and recognisable. {{count}} / 500 characters." })} />
              </div>
            </div>

            <div className="rounded-[24px] border border-border/70 bg-background/70 p-5">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-text-primary"><IdentificationIcon className="h-4 w-4" />{t("profile:settings.readOnlyTitle")}</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label={t("profile:settings.employeeCode")} value={employeeCode || "-"} disabled readOnly />
                <Input label={t("profile:settings.hrLegalName")} value={hrLegalName || "-"} disabled readOnly />
                <Input label={t("profile:settings.departmentName", { defaultValue: "Department" })} value={departmentName || "-"} disabled readOnly />
                <Input label={t("profile:settings.jobTitle", { defaultValue: "Title" })} value={jobTitle || "-"} disabled readOnly />
                <Input label={t("profile:settings.unitCode", { defaultValue: "Unit code" })} value={unitCode || "-"} disabled readOnly />
                <Input label={t("profile:settings.corporateEmail")} value={corporateEmail || "-"} disabled readOnly />
              </div>
            </div>

            <div className="rounded-[24px] border border-border/70 bg-surface p-5 shadow-xs">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-text-primary">{hasChanges ? t("profile:settings.unsaved", { defaultValue: "Unsaved changes" }) : t("profile:settings.synced", { defaultValue: "Everything is up to date" })}</p>
                  <p className="mt-1 text-sm text-text-muted">{isRefreshing ? t("profile:settings.refreshing", { defaultValue: "Refreshing profile data…" }) : t("profile:settings.saveHint", { defaultValue: "Save to apply your latest profile details everywhere instantly." })}</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="button" variant="ghost" disabled={!hasChanges || isSaving} onClick={resetDrafts}>{t("common:actions.cancel")}</Button>
                  <Button type="button" disabled={!hasChanges || isSaving || hasErrors} isLoading={isSaving} onClick={() => { void handleSave(); }} className={clsx(hasChanges && !hasErrors && "shadow-sm")}>{t("profile:settings.save")}</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SettingsSection>
  );
};

export default ProfileSettingsSection;
