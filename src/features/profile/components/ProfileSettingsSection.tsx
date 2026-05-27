import React from "react";
import { PencilSquareIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { Avatar } from "../../../components/common/Avatar";
import { SettingsCard, SettingsSection } from "../../../components/settings";
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
  <div className="grid min-w-0 gap-1 border-b border-border px-5 py-3.5 last:border-b-0 hover:bg-[#FFC857]/4 sm:grid-cols-[180px,minmax(0,1fr)] sm:gap-4">
    <dt className="text-sm font-medium text-text-secondary">
      {label}
    </dt>
    <dd className="break-words text-sm font-medium text-text-primary sm:text-right">
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
  const username = displayName;
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
    readValue(userRecord, "departmentName", "department_name") ||
    t("common:status.unknown");
  const orgUnit =
    readValue(userRecord, "orgUnit", "org_unit") || t("common:status.unknown");
  const jobTitle =
    readValue(userRecord, "jobTitle", "job_title", "title", "position") ||
    t("profile:settings.jobTitleEmpty", {
      defaultValue: "Chưa cập nhật chức danh",
    });
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
            variant="brand"
            size="sm"
            leftIcon={<PencilSquareIcon className="h-4 w-4" />}
            onClick={() => setIsDialogOpen(true)}
          >
            {t("profile:editProfileModal.title")}
          </Button>
        }
      >
        <SettingsCard bodyClassName="p-0">
          <div className="flex flex-col gap-5 border-b border-border bg-[#FFC857]/4 p-5 sm:flex-row sm:items-center">
            <div className="relative shrink-0">
              <Avatar
                src={user?.avatar}
                alt={displayName}
                size="xl"
                className="h-16 w-16 rounded-2xl ring-2 ring-[#C41E3A]/20"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="break-words text-lg font-semibold leading-7 text-text-primary">
                {displayName}
              </p>
              <p className="mt-1 break-words text-sm font-medium text-[#C41E3A]">
                {jobTitle}
              </p>
              <p className="mt-1 break-words text-sm text-text-secondary">
                {departmentName}
              </p>
              <p className="mt-1 break-words text-sm text-text-secondary">
                {orgUnit}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                  <span className="h-2 w-2 rounded-full bg-success" />
                  {userStatus === "online"
                    ? t("common:status.online")
                    : userStatus}
                </span>
              </div>
            </div>
          </div>

          <dl>
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
              label={t("profile:settings.orgUnit", {
                defaultValue: "Công ty",
              })}
              value={orgUnit}
            />
            <SummaryItem
              label={t("profile:settings.employeeCode")}
              value={employeeCode}
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
