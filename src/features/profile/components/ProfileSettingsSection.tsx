import React from "react";
import { PencilSquareIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { Avatar } from "../../../components/common/Avatar";
import { SettingsCard, SettingsRow, SettingsSection } from "../../../components/settings";
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
  <div className="min-w-0 space-y-1 rounded-xl border border-border bg-surface-overlay px-3 py-3">
    <dt className="text-xs font-medium uppercase tracking-[0.08em] text-text-secondary">
      {label}
    </dt>
    <dd className="break-words text-sm font-medium text-text-primary">
      {value}
    </dd>
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
  const jobTitle =
    readValue(userRecord, "jobTitle", "job_title", "title", "position") ||
    t("profile:settings.jobTitleEmpty", {
      defaultValue: "Chưa cập nhật chức danh",
    });
  const managerName =
    readValue(userRecord, "managerName", "manager_name", "directManager") ||
    t("common:status.unknown");
  const joinedAt =
    readValue(userRecord, "joinedAt", "joined_at", "startDate", "start_date") ||
    t("common:status.unknown");
  const userStatus = user?.status || "online";

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
        <SettingsCard bodyClassName="p-0">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1.05fr),minmax(280px,0.95fr)]">
            <div className="flex flex-col gap-5 border-b border-border p-5 sm:flex-row sm:items-start lg:border-b-0 lg:border-r">
              <Avatar
                src={user?.avatar}
                alt={displayName}
                size="xl"
                className="h-20 w-20 rounded-2xl"
              />
              <div className="min-w-0 flex-1">
                <p className="break-words text-xl font-semibold leading-7 text-text-primary">
                  {displayName}
                </p>
                <p className="mt-1 break-words text-sm font-medium text-text-secondary">
                  {jobTitle}
                </p>
                <p className="mt-1 break-words text-sm text-text-secondary">
                  {corporateEmail}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                    <span className="h-2 w-2 rounded-full bg-success" />
                    {userStatus === "online"
                      ? t("common:status.online")
                      : userStatus}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-center gap-3 p-5">
              <p className="text-sm leading-6 text-text-secondary">
                {t("profile:settings.personalIdentityDescription")}
              </p>
              <SettingsRow
                label={t("profile:settings.managerName", {
                  defaultValue: "Quản lý trực tiếp",
                })}
                description={managerName}
                className="py-0"
              />
            </div>
          </div>

          <dl className="grid gap-3 border-t border-border p-5 sm:grid-cols-2 xl:grid-cols-3">
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
              label={t("profile:settings.managerName", {
                defaultValue: "Quản lý trực tiếp",
              })}
              value={managerName}
            />
            <SummaryItem
              label={t("profile:settings.employeeCode")}
              value={employeeCode}
            />
            <SummaryItem
              label={t("profile:settings.joinedAt", {
                defaultValue: "Ngày gia nhập",
              })}
              value={joinedAt}
            />
          </dl>
        </SettingsCard>
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
