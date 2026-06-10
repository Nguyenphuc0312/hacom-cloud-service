import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  BriefcaseIcon,
  BuildingLibraryIcon,
  BuildingOffice2Icon,
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  EnvelopeIcon,
  IdentificationIcon,
  PencilSquareIcon,
  PhoneIcon,
  UserPlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Avatar } from "../common/Avatar";
import { Button, PanelSection, ProfileSkeleton, toast } from "../ui";
import { EditProfileModal } from "../modals/EditProfileModal";
import { useAuthStore, usePresenceStore } from "../../stores";
import { useFriendship } from "../../hooks/useFriendship";
import { usePresence } from "../../hooks/usePresence";
import { extractApiError } from "../../lib/apiContract";
import type { UserSummary } from "../../types";
import { UserStatus } from "../../types";
import {
  fetchUserProfileOnce,
  getCachedUserProfile,
  type CachedUserProfile,
} from "../../services/userProfileCache";
import { getUserDisplayName } from "../../utils/messageHelpers";
import { SharedResourcesPreview } from "./shared-resources/SharedResourcesPreview";

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
  orgUnit?: string;
  org_unit?: string;
  jobTitle?: string;
  job_title?: string;
  title?: string;
  corporateEmail?: string;
  emailFromHr?: string;
  email_from_hr?: string;
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
  className?: string;
}

const formatDisplayName = (user: ProfileUser | null | undefined): string => {
  if (!user) return "";

  return getUserDisplayName(user, { allowTechnicalFallback: true }) || user.id;
};

/** Map a fetched user-detail payload to the panel's ProfileUser shape. */
const toProfileUser = (payload: CachedUserProfile): ProfileUser => ({
  ...(payload as Partial<ProfileUser>),
  id: payload.id,
  username: payload.username,
  firstName: payload.firstName,
  lastName: payload.lastName,
  displayName: payload.displayName,
  avatar: payload.avatar,
  bio: payload.bio,
  phone: payload.phone,
  createdAt: payload.createdAt,
  status: (payload.status as UserStatus) || UserStatus.OFFLINE,
});

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
      time: new Date(lastSeenAt).toLocaleString(),
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
  className,
}) => {
  const { t } = useTranslation(["profile", "common", "friends"]);
  const authUser = useAuthStore((state) => state.user);
  const resolvedInitialUser = React.useMemo(
    () =>
      initialUser && initialUser.id === userId
        ? initialUser
        : null,
    [initialUser, userId],
  );
  const isSelf = userId === currentUserId;

  // Profile fetched from GET /users/{id} for the *other* user. Updated only via
  // the async fetch below — never synchronously in an effect — so it never
  // reacts to message/conversation/render churn.
  const [fetchedUser, setFetchedUser] = React.useState<ProfileUser | null>(
    () => {
      if (isSelf || !userId) return null;
      const cached = getCachedUserProfile(userId);
      return cached ? toProfileUser(cached) : null;
    },
  );
  const [isLoading, setIsLoading] = React.useState<boolean>(
    () => !isSelf && Boolean(userId) && !getCachedUserProfile(userId),
  );
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [actingKey, setActingKey] = React.useState<string | null>(null);
  const editButtonRef = React.useRef<HTMLButtonElement | null>(null);

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

  // Self profile is derived from the auth store, never the /users endpoint.
  const selfProfile = React.useMemo<ProfileUser | null>(() => {
    if (!isSelf || !authUser) return null;
    return {
      ...(authUser as Partial<ProfileUser>),
      id: authUser.id,
      username: authUser.username,
      firstName: authUser.firstName,
      lastName: authUser.lastName,
      displayName: authUser.displayName,
      avatar: authUser.avatar,
      bio: authUser.bio,
      phone: authUser.phone,
      createdAt: authUser.createdAt,
      status: authUser.status as UserStatus,
    };
  }, [authUser, isSelf]);

  // Single resolved user for rendering. For the other user we prefer the
  // fetched detail (only when it matches the current target), else fall back to
  // the placeholder — this stays correct even if `userId` changes without a
  // remount (e.g. the friends preview panel).
  const user: ProfileUser | null = isSelf
    ? selfProfile
    : fetchedUser && fetchedUser.id === userId
      ? fetchedUser
      : (resolvedInitialUser ?? null);

  // Fetch the target user's detail ONCE per userId (cached + in-flight deduped
  // in userProfileCache). Depends only on `userId`/`isSelf` — NOT on the
  // conversation, messages, lastMessage or initialUser object — so new
  // messages, realtime events and re-renders never re-trigger GET /users/{id}.
  // setState happens only in the async callbacks, never synchronously here.
  React.useEffect(() => {
    if (isSelf || !userId) return;

    let isMounted = true;

    fetchUserProfileOnce(userId)
      .then((payload) => {
        if (isMounted) setFetchedUser(toProfileUser(payload));
      })
      .catch(() => {
        // Keep whatever placeholder/cached value is already displayed.
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isSelf, userId]);

  React.useEffect(() => {
    void refreshDirectory();
  }, [refreshDirectory]);

  const displayName = formatDisplayName(user);
  const username = user?.username ? `@${user.username}` : null;
  const effectiveStatus = livePresence
    ? livePresence.state === "online"
      ? UserStatus.ONLINE
      : UserStatus.OFFLINE
    : user?.status;
  const lastSeenAt = livePresence?.lastSeenAt;
  const relationship = getRelationshipState(userId, currentUserId);
  const capabilities = relationship.capabilities;

  const presenceLabel = formatPresenceLabel(effectiveStatus, lastSeenAt, t);
  const relationshipLabel = formatRelationshipLabel(relationship.kind, t);
  const shouldShowMessageAction =
    !isSelf &&
    Boolean(onStartConversation) &&
    capabilities.canMessage &&
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
      const secondaryActions = [
        capabilities.canUnfriend ? (
          <Button
            key="unfriend"
            type="button"
            variant="secondary"
            size="sm"
            isLoading={actingKey === "unfriend"}
            onClick={() =>
              void handleAsyncAction(
                "unfriend",
                () => removeFriend(relationship.friendshipId),
                t("friends:unfriendSuccess"),
                t("friends:actionFailed"),
              )
            }
          >
            {t("friends:unfriend")}
          </Button>
        ) : null,
      ].filter(Boolean);

      return (
        <div className="space-y-2">
          {shouldShowMessageAction ? (
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
          ) : null}
          {secondaryActions.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {secondaryActions}
            </div>
          ) : null}
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
                <div className="flex flex-col items-start gap-3 sm:items-center sm:text-center">
                  <Avatar
                    src={user?.avatar}
                    alt={displayName}
                    size="xl"
                    status={effectiveStatus}
                    showStatus
                  />

                  <div className="w-full min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 sm:justify-center">
                      <h2 className="truncate text-title text-text-primary">
                        {displayName}
                      </h2>
                      <span
                        className={clsx(
                          "inline-flex rounded-full px-2.5 py-1 text-caption font-medium",
                          badgeToneByRelationship[relationship.kind],
                        )}
                      >
                        {relationshipLabel}
                      </span>
                    </div>

                    {username && (
                      <p className="truncate text-body-sm text-text-secondary">
                        {username}
                      </p>
                    )}

                    {readUserValue(user, "title", "jobTitle", "job_title") && (
                      <p className="truncate text-body-sm font-medium text-text-primary">
                        {readUserValue(user, "title", "jobTitle", "job_title")}
                      </p>
                    )}

                    {(readUserValue(user, "departmentName", "department_name") ||
                      readUserValue(user, "orgUnit", "org_unit")) && (
                      <p className="truncate text-body-sm text-text-muted">
                        {[
                          readUserValue(user, "departmentName", "department_name"),
                          readUserValue(user, "orgUnit", "org_unit"),
                        ]
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
                            {new Date(user.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </section>
              )}

              {(readUserValue(user, "title", "jobTitle", "job_title") ||
                readUserValue(user, "departmentName", "department_name") ||
                readUserValue(user, "orgUnit", "org_unit") ||
                readUserValue(user, "corporateEmail", "emailFromHr", "email_from_hr") ||
                readUserValue(user, "employeeCode", "employee_code")) && (
                <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {readUserValue(user, "title", "jobTitle", "job_title") && (
                    <div className={statCardClass}>
                      <div className="flex items-start gap-3">
                        <BriefcaseIcon className="mt-0.5 h-5 w-5 text-[#1565C0]" />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                            {t("profile:settings.jobTitle", { defaultValue: "Chức danh" })}
                          </p>
                          <p className="mt-1 text-sm text-text-primary">
                            {readUserValue(user, "title", "jobTitle", "job_title")}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {readUserValue(user, "departmentName", "department_name") && (
                    <div className={statCardClass}>
                      <div className="flex items-start gap-3">
                        <BuildingOffice2Icon className="mt-0.5 h-5 w-5 text-[#1565C0]" />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                            {t("profile:settings.departmentName", { defaultValue: "Phòng ban" })}
                          </p>
                          <p className="mt-1 text-sm text-text-primary">
                            {readUserValue(user, "departmentName", "department_name")}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {readUserValue(user, "orgUnit", "org_unit") && (
                    <div className={statCardClass}>
                      <div className="flex items-start gap-3">
                        <BuildingLibraryIcon className="mt-0.5 h-5 w-5 text-[#1565C0]" />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                            {t("profile:settings.orgUnit", { defaultValue: "Công ty" })}
                          </p>
                          <p className="mt-1 text-sm text-text-primary">
                            {readUserValue(user, "orgUnit", "org_unit")}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {readUserValue(user, "corporateEmail", "emailFromHr", "email_from_hr") && (
                    <div className={statCardClass}>
                      <div className="flex items-start gap-3">
                        <EnvelopeIcon className="mt-0.5 h-5 w-5 text-[#1565C0]" />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                            {t("profile:settings.corporateEmail", { defaultValue: "Email công ty" })}
                          </p>
                          <p className="mt-1 text-sm text-text-primary">
                            {readUserValue(user, "corporateEmail", "emailFromHr", "email_from_hr")}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {readUserValue(user, "employeeCode", "employee_code") && (
                    <div className={statCardClass}>
                      <div className="flex items-start gap-3">
                        <IdentificationIcon className="mt-0.5 h-5 w-5 text-[#1565C0]" />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                            {t("profile:settings.employeeCode", { defaultValue: "Mã nhân viên" })}
                          </p>
                          <p className="mt-1 text-sm text-text-primary">
                            {readUserValue(user, "employeeCode", "employee_code")}
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
    </>
  );
};

export default UserProfile;
