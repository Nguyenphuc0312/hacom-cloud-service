import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  ClockIcon,
  NoSymbolIcon,
  PencilSquareIcon,
  PhoneIcon,
  TrashIcon,
  UserPlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Avatar } from "../common/Avatar";
import { Button, Spinner, toast } from "../ui";
import { EditProfileModal } from "../modals/EditProfileModal";
import { useAuthStore, usePresenceStore } from "../../stores";
import { useFriendship } from "../../hooks/useFriendship";
import { usePresence } from "../../hooks/usePresence";
import { extractApiError, unwrapApiSuccess } from "../../lib/apiContract";
import type { UserSummary } from "../../types";
import { UserStatus } from "../../types";
import { getUserByIdUseCase } from "../../features/chat/usecases/getUserById";

type ProfileUser = Partial<UserSummary> & {
  id: string;
  firstName?: string;
  lastName?: string;
  bio?: string;
  phone?: string;
  createdAt?: string;
};

interface UserProfileProps {
  userId: string;
  currentUserId: string;
  initialUser?: ProfileUser | null;
  onClose: () => void;
  onStartConversation?: (userId: string) => void | Promise<void>;
  onDeleteConversation?: () => void | Promise<void>;
  className?: string;
}

const formatDisplayName = (user: ProfileUser | null | undefined): string => {
  if (!user) return "";

  const displayName =
    typeof user.displayName === "string" ? user.displayName.trim() : "";
  if (displayName) return displayName;

  const firstName =
    typeof user.firstName === "string" ? user.firstName.trim() : "";
  const lastName =
    typeof user.lastName === "string" ? user.lastName.trim() : "";
  const fullName = `${firstName} ${lastName}`.trim();
  if (fullName) return fullName;

  return typeof user.username === "string" ? user.username : user.id;
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
      defaultValue: `Last seen ${new Date(lastSeenAt).toLocaleString()}`,
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
      return t("friends:relationship.self", { defaultValue: "Your profile" });
    case "friend":
      return t("friends:relationship.friend", { defaultValue: "Friend" });
    case "incoming_request":
      return t("friends:relationship.incoming", {
        defaultValue: "Wants to connect",
      });
    case "outgoing_request":
      return t("friends:relationship.outgoing", { defaultValue: "Requested" });
    case "blocked":
      return t("friends:relationship.blocked", { defaultValue: "Blocked" });
    default:
      return t("friends:relationship.notFriend", {
        defaultValue: "Not in contacts",
      });
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
  "rounded-2xl border border-border/80 bg-surface px-3 py-3 transition-colors";

export const UserProfile: React.FC<UserProfileProps> = ({
  userId,
  currentUserId,
  initialUser,
  onClose,
  onStartConversation,
  onDeleteConversation,
  className,
}) => {
  const { t } = useTranslation(["profile", "common", "friends"]);
  const authUser = useAuthStore((state) => state.user);
  const [user, setUser] = React.useState<ProfileUser | null>(
    initialUser && initialUser.id ? initialUser : null,
  );
  const [isLoading, setIsLoading] = React.useState(false);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [actingKey, setActingKey] = React.useState<string | null>(null);

  const {
    refreshDirectory,
    getRelationshipState,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    cancelFriendRequest,
    removeFriend,
    blockUser,
    unblockUser,
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
        id: authUser.id,
        username: authUser.username,
        firstName: authUser.firstName,
        lastName: authUser.lastName,
        displayName:
          `${authUser.firstName || ""} ${authUser.lastName || ""}`.trim() ||
          authUser.username,
        avatar: authUser.avatar,
        bio: authUser.bio,
        phone: authUser.phone,
        createdAt: authUser.createdAt,
        status: authUser.status as UserStatus,
      });
      return;
    }

    setUser((current) =>
      current?.id === initialUser?.id && initialUser
        ? { ...current, ...initialUser }
        : (initialUser ?? current),
    );
  }, [authUser, initialUser, isSelf]);

  React.useEffect(() => {
    let isMounted = true;

    const loadUser = async () => {
      if (!userId || isSelf) return;
      setIsLoading(true);
      try {
        const response = await getUserByIdUseCase(userId);
        const payload = unwrapApiSuccess(response);
        if (!isMounted) return;

        setUser({
          id: payload.id,
          username: payload.username,
          firstName: payload.firstName,
          lastName: payload.lastName,
          displayName:
            `${payload.firstName || ""} ${payload.lastName || ""}`.trim() ||
            payload.username,
          avatar: payload.avatar,
          bio: payload.bio,
          phone: payload.phone,
          createdAt: payload.createdAt,
          status: (payload.status as UserStatus) || UserStatus.OFFLINE,
        });
      } catch {
        if (!isMounted) return;
        setUser((current) => current ?? initialUser ?? null);
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
  }, [initialUser, isSelf, userId]);

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
      toast.error(
        apiError.message ||
          t("error:chat.startConversationFailed", {
            defaultValue: "Unable to start conversation",
          }),
      );
    } finally {
      setActingKey(null);
    }
  }, [isSelf, onStartConversation, t, userId]);

  const renderActions = () => {
    if (relationship.kind === "self") {
      return (
        <div className="flex gap-2">
          <Button
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
      return (
        <div className="flex gap-2">
          {capabilities.canMessage ? (
            <Button
              type="button"
              fullWidth
              leftIcon={<ChatBubbleLeftRightIcon className="h-4 w-4" />}
              isLoading={actingKey === "message"}
              onClick={() => void handleMessage()}
            >
              {t("friends:message", { defaultValue: "Message" })}
            </Button>
          ) : null}
          {capabilities.canUnfriend ? (
            <Button
              type="button"
              variant="secondary"
              isLoading={actingKey === "unfriend"}
              onClick={() =>
                void handleAsyncAction(
                  "unfriend",
                  () => removeFriend(relationship.friendshipId),
                  t("friends:unfriendSuccess", {
                    defaultValue: "Removed friend",
                  }),
                  t("friends:actionFailed", { defaultValue: "Action failed" }),
                )
              }
            >
              {t("friends:unfriend", { defaultValue: "Unfriend" })}
            </Button>
          ) : null}
          {capabilities.canBlock ? (
            <Button
              type="button"
              variant="secondary"
              leftIcon={<NoSymbolIcon className="h-4 w-4" />}
              isLoading={actingKey === "block"}
              onClick={() =>
                void handleAsyncAction(
                  "block",
                  () => blockUser(userId),
                  t("friends:blockSuccess", { defaultValue: "User blocked" }),
                  t("friends:actionFailed", { defaultValue: "Action failed" }),
                )
              }
            >
              {t("profile:userProfile.blockUser")}
            </Button>
          ) : null}
        </div>
      );
    }

    if (relationship.kind === "incoming_request") {
      return (
        <div className="flex gap-2">
          {capabilities.canAccept ? (
            <Button
              type="button"
              fullWidth
              isLoading={actingKey === "accept"}
              onClick={() =>
                void handleAsyncAction(
                  "accept",
                  () => acceptFriendRequest(relationship.requestId),
                  t("friends:requestAccepted", {
                    defaultValue: "Request accepted",
                  }),
                  t("friends:actionFailed", { defaultValue: "Action failed" }),
                )
              }
            >
              {t("friends:accept", { defaultValue: "Accept" })}
            </Button>
          ) : null}
          {capabilities.canDecline ? (
            <Button
              type="button"
              variant="secondary"
              isLoading={actingKey === "decline"}
              onClick={() =>
                void handleAsyncAction(
                  "decline",
                  () => rejectFriendRequest(relationship.requestId),
                  t("friends:requestRejected", {
                    defaultValue: "Request declined",
                  }),
                  t("friends:actionFailed", { defaultValue: "Action failed" }),
                )
              }
            >
              {t("friends:reject", { defaultValue: "Decline" })}
            </Button>
          ) : null}
        </div>
      );
    }

    if (relationship.kind === "outgoing_request") {
      return (
        <div className="flex gap-2">
          <Button type="button" fullWidth variant="secondary" disabled>
            {t("friends:relationship.outgoing", { defaultValue: "Requested" })}
          </Button>
          {capabilities.canCancel ? (
            <Button
              type="button"
              variant="ghost"
              isLoading={actingKey === "cancel"}
              onClick={() =>
                void handleAsyncAction(
                  "cancel",
                  () => cancelFriendRequest(relationship.requestId),
                  t("friends:requestCancelled", {
                    defaultValue: "Request cancelled",
                  }),
                  t("friends:actionFailed", { defaultValue: "Action failed" }),
                )
              }
            >
              {t("friends:sentRequests.cancel", { defaultValue: "Cancel" })}
            </Button>
          ) : null}
        </div>
      );
    }

    if (relationship.kind === "blocked") {
      return (
        <div className="flex gap-2">
          {capabilities.canUnblock ? (
            <Button
              type="button"
              fullWidth
              variant="secondary"
              isLoading={actingKey === "unblock"}
              onClick={() =>
                void handleAsyncAction(
                  "unblock",
                  () => unblockUser(userId),
                  t("friends:unblockSuccess", {
                    defaultValue: "User unblocked",
                  }),
                  t("friends:actionFailed", { defaultValue: "Action failed" }),
                )
              }
            >
              {t("friends:unblock", { defaultValue: "Unblock" })}
            </Button>
          ) : null}
        </div>
      );
    }

    return (
      <div className="flex gap-2">
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
                t("friends:requestSent", {
                  defaultValue: "Friend request sent",
                }),
                t("friends:actionFailed", { defaultValue: "Action failed" }),
              )
            }
          >
            {t("friends:addFriend", { defaultValue: "Add friend" })}
          </Button>
        ) : null}
        {capabilities.canBlock ? (
          <Button
            type="button"
            variant="secondary"
            leftIcon={<NoSymbolIcon className="h-4 w-4" />}
            isLoading={actingKey === "block"}
            onClick={() =>
              void handleAsyncAction(
                "block",
                () => blockUser(userId),
                t("friends:blockSuccess", { defaultValue: "User blocked" }),
                t("friends:actionFailed", { defaultValue: "Action failed" }),
              )
            }
          >
            {t("profile:userProfile.blockUser")}
          </Button>
        ) : null}
      </div>
    );
  };

  return (
    <>
      <div className={clsx("flex h-full flex-col bg-surface", className)}>
        <div className="flex items-center justify-between border-b border-border/80 px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-text-primary">
              {isSelf
                ? t("friends:relationship.self", {
                    defaultValue: "Your profile",
                  })
                : t("profile:userProfile.title")}
            </h3>
            <p className="text-xs text-text-muted">
              {t("friends:profileHint", {
                defaultValue: "Quick actions and contact details",
              })}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
            aria-label={t("common:actions.close")}
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && !user ? (
            <div className="flex h-full items-center justify-center">
              <Spinner size="md" />
            </div>
          ) : (
            <div className="space-y-6 px-4 py-5">
              <section className="rounded-[28px] border border-border/80 bg-gradient-to-b from-surface to-surface-overlay/60 px-5 py-6">
                <div className="flex flex-col items-start gap-4 sm:items-center sm:text-center">
                  <Avatar
                    src={user?.avatar}
                    alt={displayName}
                    size="xl"
                    status={effectiveStatus}
                    showStatus
                  />

                  <div className="w-full min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 sm:justify-center">
                      <h2 className="truncate text-2xl font-semibold text-text-primary">
                        {displayName}
                      </h2>
                      <span
                        className={clsx(
                          "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
                          badgeToneByRelationship[relationship.kind],
                        )}
                      >
                        {relationshipLabel}
                      </span>
                    </div>

                    {username && (
                      <p className="truncate text-sm text-text-secondary">
                        {username}
                      </p>
                    )}

                    <p
                      className={clsx(
                        "text-sm",
                        effectiveStatus === UserStatus.ONLINE
                          ? "text-success"
                          : "text-text-secondary",
                      )}
                    >
                      {presenceLabel}
                    </p>

                    <p className="mx-auto max-w-sm text-sm leading-6 text-text-secondary">
                      {user?.bio?.trim() ||
                        (isSelf
                          ? t("profile:userProfile.emptyBioSelf", {
                              defaultValue:
                                "Add a short bio so people know who they're chatting with.",
                            })
                          : t("profile:userProfile.emptyBioOther", {
                              defaultValue: "No bio added yet.",
                            }))}
                    </p>
                  </div>
                </div>
              </section>

              <section className="space-y-3">{renderActions()}</section>

              <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className={statCardClass}>
                  <div className="flex items-start gap-3">
                    <ClockIcon className="mt-0.5 h-5 w-5 text-text-muted" />
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                        {t("common:statusLabel", { defaultValue: "Status" })}
                      </p>
                      <p className="mt-1 text-sm text-text-primary">
                        {presenceLabel}
                      </p>
                    </div>
                  </div>
                </div>

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
                          {t("friends:joined", { defaultValue: "Joined" })}
                        </p>
                        <p className="mt-1 text-sm text-text-primary">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className={statCardClass}>
                  <div className="flex items-start gap-3">
                    <UserPlusIcon className="mt-0.5 h-5 w-5 text-text-muted" />
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                        {t("friends:relationshipLabel", {
                          defaultValue: "Relationship",
                        })}
                      </p>
                      <p className="mt-1 text-sm text-text-primary">
                        {relationshipLabel}
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              {!isSelf &&
              onStartConversation &&
              relationship.kind === "friend" ? (
                <section className="rounded-2xl border border-border/80 bg-surface px-4 py-4">
                  <div className="flex items-start gap-3">
                    <ChatBubbleLeftRightIcon className="mt-0.5 h-5 w-5 text-text-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-primary">
                        {t("friends:startChatTitle", {
                          defaultValue: "Open this conversation quickly",
                        })}
                      </p>
                      <p className="mt-1 text-sm text-text-secondary">
                        {t("friends:startChatHint", {
                          defaultValue:
                            "Use Message to jump back into chat without leaving context.",
                        })}
                      </p>
                    </div>
                  </div>
                </section>
              ) : null}

              {onDeleteConversation ? (
                <section className="border-t border-border/80 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      void onDeleteConversation();
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-danger transition-colors hover:bg-danger/8"
                  >
                    <TrashIcon className="h-5 w-5" />
                    <span className="text-sm font-medium">
                      {t("profile:userProfile.deleteConversation")}
                    </span>
                  </button>
                </section>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {isSelf && (
        <EditProfileModal
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
        />
      )}
    </>
  );
};

export default UserProfile;
