import React from "react";
import { PencilSquareIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { Avatar } from "../../../components/common/Avatar";
import { SettingsSection } from "../../../components/settings";
import { Button } from "../../../components/ui";
import { useAuthStore } from "../../../stores";
import { resolveUserDisplayName } from "../../chat/identity/resolveUserDisplayName";
import { ProfileEditDialog } from "./ProfileEditDialog";

interface ProfileSettingsSectionProps {
  id?: string;
}

interface SummaryItemProps {
  label: string;
  value: string;
}

const SummaryItem: React.FC<SummaryItemProps> = ({ label, value }) => (
  <div className="space-y-1 py-3 first:pt-0 last:pb-0">
    <dt className="text-xs font-medium uppercase tracking-[0.12em] text-text-muted">
      {label}
    </dt>
    <dd className="text-sm text-text-primary">{value}</dd>
  </div>
);

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

export const ProfileSettingsSection: React.FC<ProfileSettingsSectionProps> = ({
  id,
}) => {
  const { t } = useTranslation(["profile", "common"]);
  const user = useAuthStore((state) => state.user);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const actionButtonRef = React.useRef<HTMLButtonElement | null>(null);

  const userRecord = (user as Record<string, unknown> | null) ?? null;
  const displayName =
    resolveUserDisplayName(user, { allowLegacyFallback: true }) ||
    t("common:labels.user");
  const username = user?.username ? `@${user.username}` : t("common:status.unknown");
  const phone =
    user?.phone ||
    t("profile:settings.phoneEmpty", {
      defaultValue: "No phone number saved",
    });
  const corporateEmail =
    readValue(userRecord, "corporateEmail", "emailFromHr", "email_from_hr") ||
    user?.email ||
    t("common:status.unknown");
  const employeeCode =
    readValue(userRecord, "employeeCode", "employee_code") ||
    t("common:status.unknown");
  const departmentName =
    readValue(
      userRecord,
      "departmentName",
      "department_name",
      "orgUnit",
      "org_unit",
    ) || t("common:status.unknown");

  return (
    <>
      <SettingsSection
        id={id}
        title={t("profile:settings.title")}
        description={t("profile:settings.description")}
        headerActions={
          <Button
            ref={actionButtonRef}
            type="button"
            size="sm"
            leftIcon={<PencilSquareIcon className="h-4 w-4" />}
            onClick={() => setIsDialogOpen(true)}
          >
            {t("profile:editProfileModal.title")}
          </Button>
        }
      >
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-surface">
          <div className="flex flex-col gap-4 border-b border-border/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex min-w-0 items-center gap-4">
              <Avatar
                src={user?.avatar}
                alt={displayName}
                size="xl"
                className="h-16 w-16 rounded-2xl"
              />
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-text-primary">
                  {displayName}
                </p>
                <p className="mt-1 truncate text-sm text-text-secondary">
                  {corporateEmail}
                </p>
              </div>
            </div>
            <p className="max-w-sm text-sm text-text-muted">
              {t("profile:settings.personalIdentityDescription")}
            </p>
          </div>

          <dl className="grid divide-y divide-border/60 px-4 py-4 sm:grid-cols-2 sm:gap-x-8 sm:px-5 [&>div:nth-child(-n+2)]:pt-0 [&>div:nth-last-child(-n+2)]:pb-0 sm:[&>div]:border-t-0 sm:[&>div]:py-3">
            <SummaryItem
              label={t("profile:settings.username")}
              value={username}
            />
            <SummaryItem
              label={t("profile:editProfileModal.phone")}
              value={phone}
            />
            <SummaryItem
              label={t("profile:settings.corporateEmail")}
              value={corporateEmail}
            />
            <SummaryItem
              label={t("profile:settings.departmentName")}
              value={departmentName}
            />
            <SummaryItem
              label={t("profile:settings.employeeCode")}
              value={employeeCode}
            />
          </dl>
        </div>
      </SettingsSection>

      <ProfileEditDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        mode="full"
        restoreFocusRef={actionButtonRef}
      />
    </>
  );
};

export default ProfileSettingsSection;
