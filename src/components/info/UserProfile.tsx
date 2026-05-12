import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
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
import { extractApiError, unwrapApiSuccess } from "../../lib/apiContract";
import type { UserSummary } from "../../types";
import { UserStatus } from "../../types";
import { getUserByIdUseCase } from "../../features/chat/usecases/getUserById";
import { getUserDisplayName } from "../../utils/messageHelpers";

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
};

type UserProfileConversationContext = "standalone" | "direct" | "group";

interface UserProfileProps {
  userId: string;
  currentUserId: string;
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
    | "friend"
    | "blocked",
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
  self: "bg-primary/12 text-primary",
  friend: "bg-success/12 text-success",
  incoming_request: "bg-warning/12 text-warning",
  outgoing_request: "bg-surface-overlay text-text-secondary",
  blocked: "bg-danger/12 text-danger",
  not_friend: "bg-surface-overlay text-text-secondary",
};

const statCardClass =
  "app-page-subtle rounded-lg px-3 py-2.5 transition-colors";

export const UserProfile: React.FC<UserProfileProps> = ({
  userId,
  currentUserId,
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
  const [user, setUser] = React.useState<ProfileUser | null>(
    resolvedInitialUser,
  );
  const [isLoading, setIsLoading] = React.useState(false);
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

  const isSelf = userId === currentUserId;

  usePresence({
    userIds: !isSelf ? [userId] : undefined,
    enabled: !isSelf && Boolean(userId),
  });

  const livePresence = usePresenceStore((state) =>
    userId ? state.presenceMap[userId] : undefined,
  );

  React.useEffect(() => {
    if (isSelf && authUser) {
      setUser({
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
      });
      return;
    }

    setUser(resolvedInitialUser);
  }, [authUser, isSelf, resolvedInitialUser]);

  React.useEffect(() => {
    let isMounted = true;

    const loadUser = async () => {
      if (!userId || isSelf) return;
      setUser(resolvedInitialUser);
      setIsLoading(true);
      try {
        const response = await getUserByIdUseCase(userId);
        const payload = unwrapApiSuccess(response);
        if (!isMounted) return;

        setUser({
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
      } catch {
        if (!isMounted) return;
        setUser((current) => current ?? resolvedInitialUser ?? null);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadUser();

    return () => {
      isMounted = false;
    };
  }, [isSelf, resolvedInitialUser, userId]);

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
              variant="secondary"
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
              variant="secondary"
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
                        <PhoneIcon className="mt-0.5 h-5 w-5 text-text-muted" />
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
                        <CalendarDaysIcon className="mt-0.5 h-5 w-5 text-text-muted" />
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
