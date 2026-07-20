import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  BriefcaseIcon,
  BuildingLibraryIcon,
  BuildingOffice2Icon,
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  CheckBadgeIcon,
  CheckIcon,
  EnvelopeIcon,
  IdentificationIcon,
  ClockIcon,
  PencilSquareIcon,
  PhoneIcon,
  UserPlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";
import { Avatar } from "../common/Avatar";
import { Button, ConfirmDialog, PanelSection, ProfileSkeleton, toast } from "../ui";
import { EditProfileModal } from "../modals/EditProfileModal";
import { useAuthStore, usePresenceStore, resolveLivePresenceStatus } from "../../stores";
import { useMyProfile } from "../../features/profile/useMyProfile";
import { useGetUserProfileQuery } from "../../features/api/chatApi";
import {
  formatJoinDate,
  resolveEmploymentStatusLabel,
} from "../../features/profile/profileFormat";
import { useFriendship } from "../../hooks/useFriendship";
import { usePresence } from "../../hooks/usePresence";
import { extractApiError } from "../../lib/apiContract";
import type { UserProfileSummaryDto } from "@hacom/chat-shared-types/auth";
import type { Message, UserSummary } from "../../types";
import { MessageType, UserStatus } from "../../types";
import { messageApi } from "../../services/api";
import { unwrapApiSuccess } from "../../lib/apiContract";
import { ReminderHistoryList } from "./ReminderHistoryList";
import { CollapsibleSection } from "./CollapsibleSection";
import { getUserDisplayName } from "../../utils/messageHelpers";
import { formatCalendarDate, formatCalendarDateTime } from "../../utils/formatTime";
import { SharedResourcesPreview } from "./shared-resources/SharedResourcesPreview";
import { resolvePublicResourceUrl } from "../../config";
import { resolveUserDisplayName } from "../../features/chat/identity/resolveUserDisplayName";
import { useEnrichedProfileStore } from "../../stores/enrichedProfileStore";
import { useFriendshipStore } from "../../stores/friendshipStore";
import { enrichUserProfile } from "../../services/enrichUserProfile";
import { friendshipApi } from "../../services/api";

type ProfileUser = Partial<UserSummary> & {
  id: string;
  firstName?: string;
  lastName?: string;
  bio?: string;
  phone?: string;
  createdAt?: string;
  fullNameFromHR?: string;
  full_name_from_hr?: string;
  employeeCode?: string;
  employee_code?: string;
  departmentName?: string;
  department_name?: string;
  department?: string;
  orgUnit?: string;
  org_unit?: string;
  company?: string;
  jobTitle?: string;
  job_title?: string;
  title?: string;
  position?: string;
  corporateEmail?: string;
  companyEmail?: string;
  emailFromHr?: string;
  email_from_hr?: string;
  employmentStatus?: string;
  dateOfJoining?: string;
};

type UserProfileConversationContext = "standalone" | "direct" | "group";

interface UserProfileProps {
  userId: string;
  currentUserId: string;
  conversationId?: string;
  initialUser?: ProfileUser | null;
  onClose: () => void;
  onStartConversation?: (userId: string) => void | Promise<void>;
  conversationContext?: UserProfileConversationContext;
  /** Jump the open timeline to a message (e.g. tapping a reminder in the history list). */
  onJumpToMessage?: (messageId: string) => void;
  className?: string;
}

const formatDisplayName = (user: ProfileUser | null | undefined): string => {
  if (!user) return "";

  return getUserDisplayName(user, { allowTechnicalFallback: true }) || user.id;
};

/** Map the latest chat-api user DTO to the panel's ProfileUser shape. */
const toProfileUser = (payload: UserProfileSummaryDto): ProfileUser => {
  // Extra fields present in real API response but not typed in UserProfileSummaryDto
  const raw = payload as unknown as Record<string, unknown>;
  return {
    // Spread first — picks up any extra fields the server sends (bio, firstName, lastName, createdAt…)
    ...(payload as Partial<ProfileUser>),
    id: payload.id,
    username: payload.username ?? undefined,
    displayName: payload.displayName ?? undefined,
    fullNameFromHR: payload.fullNameFromHr ?? undefined,
    // avatarUrl is canonical in UserProfileSummaryDto; avatar kept as runtime fallback
    avatar: resolvePublicResourceUrl(
      (raw["avatar"] as string | undefined) || payload.avatarUrl || undefined,
    ),
    phone: payload.phone ?? undefined,
    status: (payload.status as UserStatus) || UserStatus.OFFLINE,
    // HR canonical fields (UserProfileSummaryDto names — what GET /users/{id} returns)
    department: payload.department ?? undefined,
    position: payload.position ?? undefined,
    company: payload.company ?? undefined,
    employeeCode: payload.employeeCode ?? undefined,
    companyEmail: payload.companyEmail ?? undefined,
    employmentStatus: payload.employmentStatus ?? undefined,
    dateOfJoining: payload.dateOfJoining ?? undefined,
  };
};

const formatPresenceLabel = (
  status: UserStatus | undefined,
  lastSeenAt: string | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): string => {
  if (status === UserStatus.ONLINE) {
    return t("common:status.online");
  }

  if (lastSeenAt) {
    return t("common:status.lastSeen", {
      time: formatCalendarDateTime(new Date(lastSeenAt)),
    });
  }

  return t("common:status.offline");
};

const formatRelationshipLabel = (
  kind:
    | "self"
    | "not_friend"
    | "outgoing_request"
    | "incoming_request"
    | "friend",
  t: (key: string, options?: Record<string, unknown>) => string,
): string => {
  switch (kind) {
    case "self":
      return t("friends:relationship.self");
    case "friend":
      return t("friends:relationship.friend");
    case "incoming_request":
      return t("friends:relationship.incoming");
    case "outgoing_request":
      return t("friends:relationship.outgoing");
    default:
      return t("friends:relationship.notFriend");
  }
};

const badgeToneByRelationship: Record<string, string> = {
  self: "bg-[#1976D2]/10 text-[#1565C0]",
  friend: "bg-success/12 text-success",
  incoming_request: "bg-warning/12 text-warning",
  outgoing_request: "bg-surface-overlay text-text-secondary",
  not_friend: "bg-surface-overlay text-text-secondary",
};

const statCardClass =
  "app-page-subtle rounded-lg px-3 py-2.5 transition-colors";

const readUserValue = (
  u: ProfileUser | null | undefined,
  ...keys: string[]
): string | null => {
  if (!u) return null;
  const rec = u as Record<string, unknown>;
  for (const key of keys) {
    const v = rec[key];
    if (typeof v === "string") {
      const trimmed = v.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
};

export const UserProfile: React.FC<UserProfileProps> = ({
  userId,
  currentUserId,
  conversationId,
  initialUser,
  onClose,
  onStartConversation,
  conversationContext = "standalone",
  onJumpToMessage,
  className,
}) => {
  const { t } = useTranslation(["profile", "common", "friends"]);
  const authUser = useAuthStore((state) => state.user);
  const refreshProfile = useAuthStore((state) => state.refreshProfile);
  const resolvedInitialUser = React.useMemo(
    () =>
      initialUser && initialUser.id === userId
        ? initialUser
        : null,
    [initialUser, userId],
  );
  const isSelf = userId === currentUserId;
  // Same canonical self-profile resolver as Settings → Hồ sơ cá nhân, so both
  // surfaces always show identical values (HR over chat). Skipped for others.
  const myProfile = useMyProfile({ enabled: isSelf });

  const {
    data: latestUserProfile,
    isLoading: isLoadingLatestUser,
  } = useGetUserProfileQuery(userId, {
    skip: isSelf || !userId,
    refetchOnMountOrArgChange: true,
  });
  const navigate = useNavigate();
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isUnfriendConfirmOpen, setIsUnfriendConfirmOpen] = React.useState(false);
  const [actingKey, setActingKey] = React.useState<string | null>(null);
  const editButtonRef = React.useRef<HTMLButtonElement | null>(null);

  // Reminder history for 1-1 DMs — in-chat reminder cards live as REMINDER messages.
  const [reminders, setReminders] = React.useState<Message[]>([]);
  const [remindersLoading, setRemindersLoading] = React.useState(false);
  const showReminders = conversationContext === "direct" && Boolean(conversationId);
  React.useEffect(() => {
    if (!showReminders || !conversationId) return;
    setRemindersLoading(true);
    void messageApi
      .searchMessages({ conversationId, type: MessageType.REMINDER, q: "", limit: 30 })
      .then((res) => setReminders(unwrapApiSuccess(res)?.messages ?? []))
      .catch(() => setReminders([]))
      .finally(() => setRemindersLoading(false));
  }, [showReminders, conversationId]);

  const currentAlias = useFriendshipStore((s) => s.friendByUserId[userId]?.alias ?? null);
  const [isEditingAlias, setIsEditingAlias] = React.useState(false);
  const [aliasInput, setAliasInput] = React.useState("");
  const [isSavingAlias, setIsSavingAlias] = React.useState(false);
  const aliasInputRef = React.useRef<HTMLInputElement>(null);

  const {
    refreshDirectory,
    getRelationshipState,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    cancelFriendRequest,
    removeFriend,
  } = useFriendship();

  usePresence({
    userIds: !isSelf ? [userId] : undefined,
    enabled: !isSelf && Boolean(userId),
  });

  const livePresence = usePresenceStore((state) =>
    userId ? state.presenceMap[userId] : undefined,
  );

  // Self profile is derived from the canonical resolver (auth store + HR),
  // never the /users endpoint — keeping it identical to the Settings view.
  const selfProfile = React.useMemo<ProfileUser | null>(() => {
    if (!isSelf || !authUser) return null;
    return {
      ...(authUser as Partial<ProfileUser>),
      id: authUser.id,
      username: authUser.username,
      firstName: authUser.firstName,
      lastName: authUser.lastName,
      // HR-aware name so the self view matches Settings.
      displayName: myProfile.displayName,
      avatar: authUser.avatar,
      bio: authUser.bio,
      // HR fields override the chat copy when an HR profile is linked.
      phone: myProfile.phone ?? undefined,
      // Canonical new names (UserProfileSummaryDto) — checked first by readUserValue
      position: myProfile.jobTitle ?? undefined,
      department: myProfile.departmentName ?? undefined,
      company: myProfile.orgUnit ?? undefined,
      companyEmail: myProfile.corporateEmail ?? undefined,
      // Legacy aliases — fallback for readUserValue when new names absent
      title: myProfile.jobTitle ?? undefined,
      jobTitle: myProfile.jobTitle ?? undefined,
      departmentName: myProfile.departmentName ?? undefined,
      orgUnit: myProfile.orgUnit ?? undefined,
      corporateEmail: myProfile.corporateEmail ?? undefined,
      employeeCode: myProfile.employeeCode ?? undefined,
      employmentStatus: myProfile.employmentStatus ?? undefined,
      dateOfJoining: myProfile.dateOfJoining ?? undefined,
      createdAt: authUser.createdAt,
      status: authUser.status as UserStatus,
    };
  }, [authUser, isSelf, myProfile]);

  const latestOtherProfile = React.useMemo<ProfileUser | null>(() => {
    if (isSelf || !latestUserProfile || latestUserProfile.id !== userId) {
      return null;
    }
    return toProfileUser(latestUserProfile);
  }, [isSelf, latestUserProfile, userId]);

  // Single resolved user for rendering. For other users the latest API DTO wins;
  // snapshots passed by message/conversation/member surfaces are placeholders only.
  const user: ProfileUser | null = isSelf
    ? selfProfile
    : latestOtherProfile
      ? { ...latestOtherProfile, avatar: latestOtherProfile.avatar || resolvedInitialUser?.avatar }
      : (resolvedInitialUser ?? null);

  React.useEffect(() => {
    if (!isSelf) return;
    void refreshProfile().catch(() => null);
  }, [isSelf, refreshProfile]);

  React.useEffect(() => {
    if (isSelf || !userId || !latestUserProfile) return;
    const resolvedName = resolveUserDisplayName(latestUserProfile, {
      allowLegacyFallback: false,
    });
    if (resolvedName && resolvedName !== "Unknown user") {
      useEnrichedProfileStore.getState().setEnrichedName(userId, resolvedName);
    }
  }, [isSelf, latestUserProfile, userId]);

  React.useEffect(() => {
    void refreshDirectory();
  }, [refreshDirectory]);

  const displayName = formatDisplayName(user);
  const username = user?.username ? `@${user.username}` : null;
  const isLoading = !isSelf && Boolean(userId) && isLoadingLatestUser && !resolvedInitialUser;

  // Resolve employment fields once. Canonical BE field names
  // (position/department/company/companyEmail) are checked first so the panel
  // auto-populates the moment chat-api enriches /users/{id} from HR; the legacy
  // field names remain as fallback. See docs/USER_PROFILE_HR_SYNC_API.md.
  const jobTitleValue = readUserValue(
    user,
    "position",
    "title",
    "jobTitle",
    "job_title",
  );
  const departmentValue = readUserValue(
    user,
    "department",
    "departmentName",
    "department_name",
  );
  const companyValue = readUserValue(user, "company", "orgUnit", "org_unit");
  const corporateEmailValue = readUserValue(
    user,
    "companyEmail",
    "corporateEmail",
    "emailFromHr",
    "email_from_hr",
  );
  const employeeCodeValue = readUserValue(user, "employeeCode", "employee_code");
  const employmentStatusValue = resolveEmploymentStatusLabel(
    readUserValue(user, "employmentStatus"),
    t,
  );
  const joinDateValue = formatJoinDate(readUserValue(user, "dateOfJoining"));
  const hasEmploymentInfo = Boolean(
    jobTitleValue ||
      departmentValue ||
      companyValue ||
      corporateEmailValue ||
      employeeCodeValue ||
      employmentStatusValue ||
      joinDateValue,
  );
  // Live presence (WS) is the only source of truth — never `user.status`.
  // Self is always shown ONLINE (you are actively using the app and we don't
  // subscribe to our own presence channel).
  const effectiveStatus = isSelf
    ? UserStatus.ONLINE
    : resolveLivePresenceStatus(livePresence);
  const lastSeenAt = isSelf ? undefined : livePresence?.lastSeenAt;
  const relationship = getRelationshipState(userId, currentUserId);
  const capabilities = relationship.capabilities;

  const presenceLabel = formatPresenceLabel(effectiveStatus, lastSeenAt, t);
  const relationshipLabel = formatRelationshipLabel(relationship.kind, t);
  const shouldShowMessageAction =
    !isSelf &&
    Boolean(onStartConversation) &&
    (capabilities.canMessage || relationship.kind === "friend") &&
    conversationContext !== "direct";

  const handleAsyncAction = React.useCallback(
    async (
      key: string,
      action: () => Promise<boolean>,
      successMessage: string,
      failureMessage: string,
    ) => {
      setActingKey(key);
      try {
        const success = await action();
        if (!success) {
          toast.error(failureMessage);
          return;
        }
        toast.success(successMessage);
      } catch (error) {
        const apiError = extractApiError(error);
        toast.error(apiError.message || failureMessage);
      } finally {
        setActingKey(null);
      }
    },
    [],
  );

  const handleMessage = React.useCallback(async () => {
    if (!onStartConversation || isSelf) return;

    setActingKey("message");
    try {
      await Promise.resolve(onStartConversation(userId));
    } catch (error) {
      const apiError = extractApiError(error);
      toast.error(apiError.message || t("error:chat.startConversationFailed"));
    } finally {
      setActingKey(null);
    }
  }, [isSelf, onStartConversation, t, userId]);

  const startEditAlias = React.useCallback(() => {
    setAliasInput(currentAlias ?? displayName);
    setIsEditingAlias(true);
    setTimeout(() => aliasInputRef.current?.focus(), 0);
  }, [currentAlias, displayName]);

  const saveAlias = React.useCallback(async () => {
    const friendshipId =
      relationship.kind === "friend" ? relationship.friendshipId : undefined;
    if (!friendshipId) return;
    const trimmed = aliasInput.trim();
    const newAlias = trimmed || null;
    setIsSavingAlias(true);
    try {
      await friendshipApi.setAlias(friendshipId, newAlias);
      useFriendshipStore.getState().setLocalAlias(userId, newAlias);
      if (!newAlias) enrichUserProfile(userId);
      setIsEditingAlias(false);
    } catch (error) {
      const apiError = extractApiError(error);
      toast.error(apiError.message || t("friends:alias.saveFailed"));
    } finally {
      setIsSavingAlias(false);
    }
  }, [aliasInput, relationship, t, userId]);

  const renderActions = () => {
    if (relationship.kind === "self") {
      return (
        <div className="flex gap-2">
          <Button
            ref={editButtonRef}
            type="button"
            variant="brand"
            fullWidth
            leftIcon={<PencilSquareIcon className="h-4 w-4" />}
            onClick={() => setIsEditOpen(true)}
          >
            {t("profile:editProfileModal.title")}
          </Button>
        </div>
      );
    }

    if (relationship.kind === "friend") {
      // The "unfriend" action is rendered separately at the bottom of the
      // panel (centered, danger color) — here we only surface the message CTA.
      if (!shouldShowMessageAction) return null;

      return (
        <div className="space-y-2">
          <Button
            type="button"
            variant="brand-yellow"
            fullWidth
            leftIcon={<ChatBubbleLeftRightIcon className="h-4 w-4" />}
            isLoading={actingKey === "message"}
            onClick={() => void handleMessage()}
          >
            {t("friends:message")}
          </Button>
        </div>
      );
    }

    if (relationship.kind === "incoming_request") {
      return (
        <div className="space-y-2">
          {capabilities.canAccept ? (
            <Button
              type="button"
              variant="brand"
              fullWidth
              isLoading={actingKey === "accept"}
              onClick={() =>
                void handleAsyncAction(
                  "accept",
                  () => acceptFriendRequest(relationship.requestId),
                  t("friends:requestAccepted"),
                  t("friends:actionFailed"),
                )
              }
            >
              {t("friends:accept")}
            </Button>
          ) : null}
          {capabilities.canDecline ? (
            <Button
              type="button"
              variant="brand-outline"
              fullWidth
              isLoading={actingKey === "decline"}
              onClick={() =>
                void handleAsyncAction(
                  "decline",
                  () => rejectFriendRequest(relationship.requestId),
                  t("friends:requestRejected"),
                  t("friends:actionFailed"),
                )
              }
            >
              {t("friends:reject")}
            </Button>
          ) : null}
        </div>
      );
    }

    if (relationship.kind === "outgoing_request") {
      return (
        <div className="space-y-2">
          <div className="rounded-lg border border-border/70 bg-surface-overlay px-3 py-2 text-sm text-text-secondary">
            {t("friends:relationship.outgoing")}
          </div>
          {capabilities.canCancel ? (
            <Button
              type="button"
              fullWidth
              variant="brand-outline"
              isLoading={actingKey === "cancel"}
              onClick={() =>
                void handleAsyncAction(
                  "cancel",
                  () => cancelFriendRequest(relationship.requestId),
                  t("friends:requestCancelled"),
                  t("friends:actionFailed"),
                )
              }
            >
              {t("friends:sentRequests.cancel")}
            </Button>
          ) : null}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {capabilities.canSendRequest ? (
          <Button
            type="button"
            variant="brand"
            fullWidth
            leftIcon={<UserPlusIcon className="h-4 w-4" />}
            isLoading={actingKey === "add"}
            onClick={() =>
              void handleAsyncAction(
                "add",
                () => sendFriendRequest(userId),
                t("friends:requestSent"),
                t("friends:actionFailed"),
              )
            }
          >
            {t("friends:addFriend")}
          </Button>
        ) : null}
      </div>
    );
  };

  return (
    <>
      <div className={clsx("flex h-full flex-col bg-[hsl(var(--chat-panel-bg))]", className)}>
        <div className="app-page-header flex items-center justify-between px-4 py-2.5">
          <div>
            <h3 className="text-title-sm text-text-primary">
              {isSelf
                ? t("friends:relationship.self")
                : t("profile:userProfile.title")}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="icon-button-surface h-9 w-9"
            aria-label={t("common:actions.close")}
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && !user ? (
            <ProfileSkeleton />
          ) : (
            <div className="space-y-4 px-4 py-4">
              <PanelSection className="rounded-2xl border-transparent bg-[hsl(var(--chat-panel-bg))] px-4 py-4 shadow-none">
                <div className="flex flex-col items-center gap-3 text-center">
                  <Avatar
                    src={user?.avatar}
                    alt={displayName}
                    size="2xl"
                    status={effectiveStatus}
                    showStatus
                  />

                  <div className="w-full min-w-0 space-y-1.5">
                    {isEditingAlias ? (
                      <div className="flex flex-col items-center gap-3 py-1">
                        <input
                          ref={aliasInputRef}
                          value={aliasInput}
                          onChange={(e) => setAliasInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void saveAlias();
                            if (e.key === "Escape") setIsEditingAlias(false);
                          }}
                          placeholder={t("friends:alias.placeholder")}
                          maxLength={100}
                          disabled={isSavingAlias}
                          className="w-full border-0 border-b-2 border-[#1565C0]/40 bg-transparent pb-1 text-center text-2xl font-semibold text-text-primary placeholder:font-normal placeholder:text-text-muted/50 focus:border-[#1565C0] focus:outline-none disabled:opacity-50 transition-colors"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void saveAlias()}
                            disabled={isSavingAlias}
                            className="inline-flex items-center gap-1.5 rounded-full bg-[#1565C0] px-4 py-1.5 text-sm font-medium text-[#E7E9EB] transition-colors hover:bg-[#1976D2] disabled:opacity-50"
                          >
                            <CheckIcon className="h-3.5 w-3.5" />
                            {t("common:actions.save")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsEditingAlias(false)}
                            disabled={isSavingAlias}
                            className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-surface-overlay px-4 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
                          >
                            <XMarkIcon className="h-3.5 w-3.5" />
                            {t("common:actions.cancel")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <h2 className="text-2xl font-semibold text-text-primary">
                          {currentAlias || displayName}
                        </h2>
                        {relationship.kind === "friend" && (
                          <button
                            type="button"
                            onClick={startEditAlias}
                            title={t("friends:alias.editTitle")}
                            className="icon-button-surface h-6 w-6 opacity-50 transition-opacity hover:opacity-100"
                          >
                            <PencilSquareIcon className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <span
                          className={clsx(
                            "inline-flex rounded-full px-2.5 py-1 text-caption font-medium",
                            badgeToneByRelationship[relationship.kind],
                          )}
                        >
                          {relationshipLabel}
                        </span>
                      </div>
                    )}
                    {currentAlias && !isEditingAlias && (
                      <p className="text-body-sm text-text-muted">
                        {t("friends:alias.realName")} {displayName}
                      </p>
                    )}

                    {username && (
                      <p className="truncate text-body-sm text-text-secondary">
                        {username}
                      </p>
                    )}

                    {jobTitleValue && (
                      <p className="truncate text-body-sm font-medium text-text-primary">
                        {jobTitleValue}
                      </p>
                    )}

                    {(departmentValue || companyValue) && (
                      <p className="truncate text-body-sm text-text-muted">
                        {[departmentValue, companyValue]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}

                    <p
                      className={clsx(
                        "text-body-sm",
                        effectiveStatus === UserStatus.ONLINE
                          ? "text-success"
                          : "text-text-secondary",
                      )}
                    >
                      {presenceLabel}
                    </p>

                    <p className="mx-auto max-w-sm text-body-sm leading-6 text-text-secondary">
                      {user?.bio?.trim() ||
                        (isSelf
                          ? t("profile:userProfile.emptyBioSelf")
                          : t("profile:userProfile.emptyBioOther"))}
                    </p>
                  </div>
                </div>
              </PanelSection>

              <section className="space-y-3">{renderActions()}</section>

              {(user?.phone || user?.createdAt) && (
                <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {user?.phone ? (
                    <div className={statCardClass}>
                      <div className="flex items-start gap-3">
                        <PhoneIcon className="mt-0.5 h-5 w-5 text-[#1565C0]" />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                            {t("profile:editProfileModal.phone")}
                          </p>
                          <p className="mt-1 text-sm text-text-primary">
                            {user.phone}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {user?.createdAt ? (
                    <div className={statCardClass}>
                      <div className="flex items-start gap-3">
                        <CalendarDaysIcon className="mt-0.5 h-5 w-5 text-[#1565C0]" />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                            {t("friends:joined")}
                          </p>
                          <p className="mt-1 text-sm text-text-primary">
                            {formatCalendarDate(new Date(user.createdAt))}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </section>
              )}

              {hasEmploymentInfo && (
                <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {jobTitleValue && (
                    <div className={statCardClass}>
                      <div className="flex items-start gap-3">
                        <BriefcaseIcon className="mt-0.5 h-5 w-5 text-[#1565C0]" />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                            {t("profile:settings.jobTitle", { defaultValue: "Chức danh" })}
                          </p>
                          <p className="mt-1 text-sm text-text-primary">
                            {jobTitleValue}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {departmentValue && (
                    <div className={statCardClass}>
                      <div className="flex items-start gap-3">
                        <BuildingOffice2Icon className="mt-0.5 h-5 w-5 text-[#1565C0]" />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                            {t("profile:settings.departmentName", { defaultValue: "Phòng ban" })}
                          </p>
                          <p className="mt-1 text-sm text-text-primary">
                            {departmentValue}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {companyValue && (
                    <div className={statCardClass}>
                      <div className="flex items-start gap-3">
                        <BuildingLibraryIcon className="mt-0.5 h-5 w-5 text-[#1565C0]" />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                            {t("profile:settings.orgUnit", { defaultValue: "Công ty" })}
                          </p>
                          <p className="mt-1 text-sm text-text-primary">
                            {companyValue}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {corporateEmailValue && (
                    <div className={statCardClass}>
                      <div className="flex items-start gap-3">
                        <EnvelopeIcon className="mt-0.5 h-5 w-5 shrink-0 text-[#1565C0]" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                            {t("profile:settings.corporateEmail", { defaultValue: "Email công ty" })}
                          </p>
                          <p className="mt-1 break-all text-sm text-text-primary">
                            {corporateEmailValue}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {employeeCodeValue && (
                    <div className={statCardClass}>
                      <div className="flex items-start gap-3">
                        <IdentificationIcon className="mt-0.5 h-5 w-5 text-[#1565C0]" />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                            {t("profile:settings.employeeCode", { defaultValue: "Mã nhân viên" })}
                          </p>
                          <p className="mt-1 text-sm text-text-primary">
                            {employeeCodeValue}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {employmentStatusValue && (
                    <div className={statCardClass}>
                      <div className="flex items-start gap-3">
                        <CheckBadgeIcon className="mt-0.5 h-5 w-5 text-[#1565C0]" />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                            {t("profile:settings.employmentStatus", { defaultValue: "Trạng thái nhân sự" })}
                          </p>
                          <p className="mt-1 text-sm text-text-primary">
                            {employmentStatusValue}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {joinDateValue && (
                    <div className={statCardClass}>
                      <div className="flex items-start gap-3">
                        <CalendarDaysIcon className="mt-0.5 h-5 w-5 text-[#1565C0]" />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                            {t("profile:settings.joinDate", { defaultValue: "Ngày vào làm" })}
                          </p>
                          <p className="mt-1 text-sm text-text-primary">
                            {joinDateValue}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              )}

              {conversationContext === "direct" && conversationId && (
                <section className="space-y-2">
                  <SharedResourcesPreview conversationId={conversationId} />
                </section>
              )}

              {showReminders && (
                <CollapsibleSection
                  title="Nhắc hẹn"
                  icon={<ClockIcon className="h-4 w-4" />}
                  defaultOpen={false}
                  badge={
                    reminders.length > 0 ? (
                      <span className="rounded-full bg-surface-overlay px-1.5 py-0.5 text-[11px] font-medium text-text-muted tabular-nums">
                        {reminders.length}
                      </span>
                    ) : undefined
                  }
                >
                  <ReminderHistoryList
                    reminders={reminders}
                    loading={remindersLoading}
                    onJumpToMessage={onJumpToMessage}
                    onOpenCalendar={() => navigate("/calendar")}
                  />
                </CollapsibleSection>
              )}

              {relationship.kind === "friend" && capabilities.canUnfriend && (
                <section className="flex justify-center pt-2">
                  <Button
                    type="button"
                    variant="danger"
                    isLoading={actingKey === "unfriend"}
                    onClick={() => setIsUnfriendConfirmOpen(true)}
                  >
                    {t("friends:unfriend")}
                  </Button>
                </section>
              )}

            </div>
          )}
        </div>
      </div>

      {isSelf && (
        <EditProfileModal
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          restoreFocusRef={editButtonRef}
        />
      )}

      <ConfirmDialog
        isOpen={isUnfriendConfirmOpen}
        onClose={() => {
          if (actingKey !== "unfriend") setIsUnfriendConfirmOpen(false);
        }}
        onConfirm={() => {
          if (relationship.kind !== "friend") {
            setIsUnfriendConfirmOpen(false);
            return;
          }
          const friendshipId = relationship.friendshipId;
          void handleAsyncAction(
            "unfriend",
            () => removeFriend(friendshipId),
            t("friends:unfriendSuccess"),
            t("friends:actionFailed"),
          ).finally(() => setIsUnfriendConfirmOpen(false));
        }}
        title={t("friends:unfriendConfirmTitle")}
        message={t("friends:unfriendConfirmMessage", { name: displayName })}
        confirmText={t("friends:unfriend")}
        variant="danger"
        isLoading={actingKey === "unfriend"}
      />
    </>
  );
};

export default UserProfile;
