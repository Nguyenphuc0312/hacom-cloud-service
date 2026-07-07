import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  CameraIcon,
  CheckCircleIcon,
  LinkIcon,
  QrCodeIcon,
  UserPlusIcon,
  ArrowDownTrayIcon,
  ChatBubbleLeftRightIcon,
} from "@heroicons/react/24/outline";
import { ErrorCode } from "@hacom/chat-shared-types/core";
import type { FriendshipRelationDto } from "@hacom/chat-shared-types/chat";
import { Avatar } from "../common/Avatar";
import { SafeImage } from "../common/SafeImage";
import {
  Button,
  ConfirmDialog,
  Input,
  Modal,
  Skeleton,
  SkeletonCircle,
  toast,
} from "../ui";
import { useAuthStore } from "../../stores";
import { useMyProfile } from "../../features/profile/useMyProfile";
import { useFriendshipStore } from "../../stores/friendshipStore";
import { useFriendship } from "../../hooks/useFriendship";
import {
  conversationApi,
  friendQrApi,
  userApi,
  type FriendDiscoveryResolvedDto,
  type FriendQrPayloadDto,
} from "../../services/api";
import { extractApiError, unwrapApiSuccess } from "../../lib/apiContract";
import { formatCalendarDateTime } from "../../utils/formatTime";
import { ROUTE_PATHS } from "../../router/paths";
import { parseShareCodeInput } from "../../features/friend-qr/shareCode";
import { useNavigate, useSearchParams } from "react-router-dom";

interface FriendQrWorkspaceProps {
  initialShareCode?: string | null;
}

type BarcodeDetectorResult = {
  rawValue?: string;
};

type BarcodeDetectorInstance = {
  detect: (source: unknown) => Promise<BarcodeDetectorResult[]>;
};

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorInstance;

const getDisplayName = (
  user: ReturnType<typeof useAuthStore.getState>["user"],
  fallback: string,
): string => {
  if (!user) {
    return fallback;
  }

  const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim();
  if (fullName) {
    return fullName;
  }

  return user.username || user.email || user.id;
};

export const FriendQrWorkspace: React.FC<FriendQrWorkspaceProps> = ({
  initialShareCode,
}) => {
  const { t } = useTranslation(["friends", "common"]);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const currentUser = useAuthStore((state) => state.user);
  const currentUserId = currentUser?.id ?? null;
  const myProfile = useMyProfile();

  const {
    getRelationshipState,
    refreshDirectory,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    cancelFriendRequest,
  } = useFriendship();

  const [myQr, setMyQr] = React.useState<FriendQrPayloadDto | null>(null);
  const [myQrImageUrl, setMyQrImageUrl] = React.useState<string>("");
  const [isMyQrLoading, setIsMyQrLoading] = React.useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = React.useState(false);
  const [isResetting, setIsResetting] = React.useState(false);
  const [resetNotice, setResetNotice] = React.useState<string | null>(null);

  const [resolveInput, setResolveInput] = React.useState("");
  const [isResolving, setIsResolving] = React.useState(false);
  const [resolveError, setResolveError] = React.useState<string | null>(null);
  const [resolved, setResolved] =
    React.useState<FriendDiscoveryResolvedDto | null>(null);
  const [isProfileOpen, setIsProfileOpen] = React.useState(false);
  const [profileBio, setProfileBio] = React.useState<string | null>(null);
  const [isProfileActionLoading, setIsProfileActionLoading] = React.useState<
    string | null
  >(null);
  const [isScanningImage, setIsScanningImage] = React.useState(false);

  const autoResolvedFromUrlRef = React.useRef(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const initialDeepLinkCode = React.useMemo(() => {
    const routeCode = initialShareCode?.trim();
    if (routeCode) {
      return routeCode;
    }

    const queryCode = searchParams.get("code")?.trim();
    return queryCode || "";
  }, [initialShareCode, searchParams]);

  const supportsImageScan = React.useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }

    const maybeWindow = window as unknown as {
      BarcodeDetector?: BarcodeDetectorConstructor;
      createImageBitmap?: (file: Blob) => Promise<unknown>;
    };

    return Boolean(
      maybeWindow.BarcodeDetector &&
      maybeWindow.createImageBitmap &&
      typeof maybeWindow.createImageBitmap === "function",
    );
  }, []);

  const refreshMyQr = React.useCallback(async () => {
    setIsMyQrLoading(true);
    try {
      const response = await friendQrApi.getMyFriendQr();
      const payload = unwrapApiSuccess(response);
      setMyQr(payload);
    } catch (error) {
      const apiError = extractApiError(error);
      toast.error(apiError.message || t("friends:qr.errorLoadQr"));
    } finally {
      setIsMyQrLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void refreshMyQr();
  }, [refreshMyQr]);

  React.useEffect(() => {
    let isMounted = true;

    const renderQr = async () => {
      if (!myQr) {
        setMyQrImageUrl("");
        return;
      }

      try {
        const value = myQr.deepLink || myQr.shareCode;
        const { default: QRCode } = await import("qrcode");
        const imageUrl = await QRCode.toDataURL(value, {
          errorCorrectionLevel: "M",
          width: 240,
          margin: 1,
        });

        if (isMounted) {
          setMyQrImageUrl(imageUrl);
        }
      } catch {
        if (isMounted) {
          setMyQrImageUrl("");
        }
      }
    };

    void renderQr();

    return () => {
      isMounted = false;
    };
  }, [myQr]);

  React.useEffect(() => {
    if (autoResolvedFromUrlRef.current) {
      return;
    }

    if (!initialDeepLinkCode) {
      return;
    }

    autoResolvedFromUrlRef.current = true;
    setResolveInput(initialDeepLinkCode);
  }, [initialDeepLinkCode]);

  const copyText = React.useCallback(
    async (value: string, successMessage: string) => {
      try {
        await navigator.clipboard.writeText(value);
        toast.success(successMessage);
        return true;
      } catch {
        toast.error(t("friends:qr.copyFailed"));
        return false;
      }
    },
    [t],
  );

  const handleDownloadQr = React.useCallback(() => {
    if (!myQrImageUrl) return;
    const link = document.createElement("a");
    link.href = myQrImageUrl;
    link.download = "hacom-chat-qr.png";
    link.click();
  }, [myQrImageUrl]);

  const handleShare = React.useCallback(async () => {
    if (!myQr) {
      return;
    }

    const shareTitle = t("friends:qr.myCodeTitle");
    const shareText = `${t("friends:qr.resolveTitle")}: ${myQr.deepLink}`;

    const maybeNavigator = navigator as Navigator & {
      share?: (data: ShareData) => Promise<void>;
    };

    if (typeof maybeNavigator.share === "function") {
      try {
        await maybeNavigator.share({
          title: shareTitle,
          text: shareText,
          url: myQr.deepLink,
        });
        return;
      } catch {
        // Fallback to copy below.
      }
    }

    await copyText(myQr.deepLink, t("friends:qr.shareCopied"));
  }, [copyText, myQr, t]);

  const handleResetQr = React.useCallback(async () => {
    setIsResetting(true);
    try {
      const response = await friendQrApi.resetMyFriendQr();
      const payload = unwrapApiSuccess(response);
      setMyQr(payload);
      setResetNotice(t("friends:qr.resetNotice"));
      toast.success(t("friends:qr.resetSuccess"));
      setIsResetConfirmOpen(false);
    } catch (error) {
      const apiError = extractApiError(error);
      toast.error(apiError.message || t("friends:qr.errorResetQr"));
    } finally {
      setIsResetting(false);
    }
  }, [t]);

  const applyResolvedRelation = React.useCallback(
    (relation: FriendshipRelationDto | null) => {
      if (!relation) {
        return;
      }

      useFriendshipStore.getState().applyRelation(relation);
    },
    [],
  );

  const resolveCode = React.useCallback(
    async (rawInput: string) => {
      const toFriendlyResolveMessage = (
        message: string | undefined,
        originalError?: unknown,
      ): string => {
        const originalMessage =
          originalError instanceof Error ? originalError.message : undefined;
        const candidate = [message, originalMessage]
          .filter((value): value is string => Boolean(value))
          .join(" ");

        if (!candidate) {
          return t("friends:qr.invalidCode");
        }

        const normalized = candidate.toLowerCase();
        if (normalized.includes("invalid") || normalized.includes("expired")) {
          return t("friends:qr.invalidCode");
        }

        return message ?? t("friends:qr.invalidCode");
      };

      const parsedCode = parseShareCodeInput(rawInput);
      if (!parsedCode) {
        setResolveError(t("friends:qr.invalidCode"));
        return;
      }

      setResolveError(null);
      setIsResolving(true);

      try {
        const response = await friendQrApi.resolveCode(parsedCode);
        const payload = unwrapApiSuccess(response);

        applyResolvedRelation(payload.relationship.friendship);

        setResolved(payload);
        setProfileBio(payload.profile.bio ?? null);
        setIsProfileOpen(true);
        setResolveInput(parsedCode);
      } catch (error) {
        const apiError = extractApiError(error);
        setResolveError(toFriendlyResolveMessage(apiError.message, error));
      } finally {
        setIsResolving(false);
      }
    },
    [applyResolvedRelation, t],
  );

  React.useEffect(() => {
    if (!autoResolvedFromUrlRef.current) {
      return;
    }

    if (!resolveInput) {
      return;
    }

    void resolveCode(resolveInput);
  }, [resolveCode, resolveInput]);

  React.useEffect(() => {
    let isMounted = true;

    const loadProfileBio = async () => {
      if (!isProfileOpen || !resolved?.profile.id) {
        return;
      }

      if (resolved.profile.id === currentUserId) {
        if (isMounted) {
          setProfileBio(currentUser?.bio ?? null);
        }
        return;
      }

      try {
        const response = await userApi.getUserById(resolved.profile.id);
        const payload = unwrapApiSuccess(response);
        const bio = (payload as unknown as Record<string, unknown>)["bio"];
        if (isMounted) {
          setProfileBio(
            typeof bio === "string" && bio.trim() ? bio.trim() : null,
          );
        }
      } catch {
        if (isMounted) {
          setProfileBio((current) => current ?? null);
        }
      }
    };

    void loadProfileBio();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.bio, currentUserId, isProfileOpen, resolved?.profile.id]);

  const handleScanImage = React.useCallback(
    async (file: File) => {
      const maybeWindow = window as unknown as {
        BarcodeDetector?: BarcodeDetectorConstructor;
        createImageBitmap?: (blob: Blob) => Promise<unknown>;
      };

      const DetectorCtor = maybeWindow.BarcodeDetector;
      const createBitmap = maybeWindow.createImageBitmap;

      if (!DetectorCtor || !createBitmap) {
        toast.error(t("friends:qr.errorScanNotSupported"));
        return;
      }

      setIsScanningImage(true);
      try {
        const detector = new DetectorCtor({ formats: ["qr_code"] });
        const bitmap = await createBitmap(file);
        const results = await detector.detect(bitmap);
        const rawValue = results[0]?.rawValue;

        if (!rawValue) {
          setResolveError(t("friends:qr.errorScanNotFound"));
          return;
        }

        const parsed = parseShareCodeInput(rawValue);
        if (!parsed) {
          setResolveError(t("friends:qr.invalidCode"));
          return;
        }

        setResolveInput(parsed);
        await resolveCode(parsed);
      } catch {
        setResolveError(t("friends:qr.errorScanFailed"));
      } finally {
        setIsScanningImage(false);
      }
    },
    [resolveCode, t],
  );

  const resolvedProfile = resolved?.profile ?? null;
  const relationship = resolvedProfile
    ? getRelationshipState(resolvedProfile.id, currentUserId)
    : null;

  const handleProfileAction = React.useCallback(
    async (
      key: string,
      action: () => Promise<boolean>,
      successMessage: string,
    ) => {
      setIsProfileActionLoading(key);
      try {
        const success = await action();
        if (!success) {
          toast.error(t("friends:actionFailed"));
          return;
        }

        toast.success(successMessage);
      } finally {
        setIsProfileActionLoading(null);
      }
    },
    [t],
  );

  const handleOpenMessage = React.useCallback(async () => {
    if (!resolvedProfile?.id) {
      return;
    }

    setIsProfileActionLoading("message");
    try {
      const response = await conversationApi.createPrivateConversation(
        resolvedProfile.id,
      );
      const room = unwrapApiSuccess(response) as { id?: string };
      if (room.id) {
        navigate(`${ROUTE_PATHS.CHAT}/${room.id}`);
      }
      setIsProfileOpen(false);
    } catch (error) {
      const apiError = extractApiError(error);
      if (apiError.code === ErrorCode.DIRECT_CHAT_TARGET_UNAVAILABLE) {
        void refreshDirectory();
      }
      toast.error(apiError.message || t("friends:qr.errorOpenConversation"));
    } finally {
      setIsProfileActionLoading(null);
    }
  }, [navigate, refreshDirectory, resolvedProfile?.id, t]);

  const renderProfileActions = () => {
    if (!relationship || !resolvedProfile) {
      return null;
    }

    const capabilities = relationship.capabilities;

    if (relationship.kind === "self") {
      return (
        <p className="rounded-xl bg-surface-overlay px-3 py-2 text-sm text-text-secondary">
          {t("friends:qr.selfProfile")}
        </p>
      );
    }

    if (relationship.kind === "friend") {
      return (
        <div className="flex flex-wrap gap-2">
          {capabilities.canMessage ? (
            <Button
              type="button"
              variant="brand-yellow"
              leftIcon={<ChatBubbleLeftRightIcon className="h-4 w-4" />}
              isLoading={isProfileActionLoading === "message"}
              onClick={() => void handleOpenMessage()}
            >
              {t("friends:message")}
            </Button>
          ) : null}
        </div>
      );
    }

    if (relationship.kind === "incoming_request") {
      return (
        <div className="flex flex-wrap gap-2">
          {capabilities.canAccept ? (
            <Button
              type="button"
              variant="brand"
              isLoading={isProfileActionLoading === "accept"}
              onClick={() =>
                void handleProfileAction(
                  "accept",
                  () => acceptFriendRequest(relationship.requestId),
                  t("friends:qr.toastAccepted"),
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
              isLoading={isProfileActionLoading === "decline"}
              onClick={() =>
                void handleProfileAction(
                  "decline",
                  () => rejectFriendRequest(relationship.requestId),
                  t("friends:qr.toastDeclined"),
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
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled>
            {t("friends:qr.pending")}
          </Button>
          {capabilities.canCancel ? (
            <Button
              type="button"
              variant="brand-outline"
              isLoading={isProfileActionLoading === "cancel"}
              onClick={() =>
                void handleProfileAction(
                  "cancel",
                  () => cancelFriendRequest(relationship.requestId),
                  t("friends:qr.toastCancelled"),
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
      <div className="flex flex-wrap gap-2">
        {capabilities.canSendRequest ? (
          <Button
            type="button"
            variant="brand"
            leftIcon={<UserPlusIcon className="h-4 w-4" />}
            isLoading={isProfileActionLoading === "add"}
            onClick={() =>
              void handleProfileAction(
                "add",
                () => sendFriendRequest(resolvedProfile.id),
                t("friends:qr.toastSent"),
              )
            }
          >
            {t("friends:addFriend")}
          </Button>
        ) : null}
      </div>
    );
  };

  const relationshipLabel = React.useMemo(() => {
    if (!relationship) {
      return "";
    }

    switch (relationship.kind) {
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
  }, [relationship, t]);

  const resolvedDisplayName =
    resolvedProfile?.displayName || t("friends:qr.unknownUser");
  const resolvedUsername = resolvedProfile?.username
    ? `@${resolvedProfile.username}`
    : t("friends:qr.missingUsername");

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-text-primary">
            {t("friends:qr.myCodeTitle")}
          </h3>
          {isMyQrLoading ? <SkeletonCircle size={16} /> : null}
        </div>

        <div className="mt-6 flex flex-col items-center gap-4">
          <Avatar
            src={myProfile.avatar ?? currentUser?.avatar}
            alt={myProfile.displayName || getDisplayName(currentUser, t("friends:qr.unknownUser"))}
            size="lg"
          />
          <div className="text-center">
            <p className="text-base font-semibold text-text-primary">
              {myProfile.displayName ||
                getDisplayName(currentUser, t("friends:qr.unknownUser"))}
            </p>
            {myProfile.departmentName ? (
              <p className="text-sm text-text-secondary">
                {myProfile.departmentName}
              </p>
            ) : null}
            {myProfile.orgUnit ? (
              <p className="text-sm text-text-muted">{myProfile.orgUnit}</p>
            ) : null}
          </div>

          <div className="mx-auto flex h-52 w-52 items-center justify-center rounded-2xl border border-border bg-white p-3 shadow-sm">
            {myQrImageUrl ? (
              <SafeImage
                src={myQrImageUrl}
                alt={t("friends:tabs.qr")}
                className="h-full w-full rounded-lg"
                fallback={
                  <div
                    className="h-full w-full space-y-3 p-4"
                    aria-busy="true"
                    aria-label={t("auth:qrLogin.creating")}
                    role="status"
                  >
                    <Skeleton className="h-full w-full" rounded="lg" />
                  </div>
                }
              />
            ) : (
              <div
                className="h-full w-full space-y-3 p-4"
                aria-busy="true"
                aria-label={t("auth:qrLogin.creating")}
                role="status"
              >
                <Skeleton className="h-full w-full" rounded="lg" />
              </div>
            )}
          </div>

          <p className="max-w-xs text-center text-sm text-text-secondary">
            {t("friends:qr.myCodeHint")}
          </p>

          {myQr?.updatedAt ? (
            <p className="text-xs text-text-muted">
              {t("friends:qr.updatedAt", {
                time: formatCalendarDateTime(new Date(myQr.updatedAt)),
              })}
            </p>
          ) : null}

          {resetNotice ? (
            <div className="w-full rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-center text-sm text-warning">
              {resetNotice}
            </div>
          ) : null}

          <div className="flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              variant="brand"
              leftIcon={<ArrowDownTrayIcon className="h-4 w-4" />}
              onClick={handleDownloadQr}
              disabled={!myQrImageUrl}
            >
              {t("friends:qr.download")}
            </Button>
            <Button
              type="button"
              variant="brand-outline"
              leftIcon={<LinkIcon className="h-4 w-4" />}
              onClick={() =>
                myQr
                  ? void copyText(
                      myQr.deepLink,
                      t("friends:qr.deepLinkCopied"),
                    )
                  : undefined
              }
              disabled={!myQr}
            >
              {t("friends:qr.copyLink")}
            </Button>
            <Button
              type="button"
              variant="brand-outline"
              onClick={() => void handleShare()}
              disabled={!myQr}
            >
              {t("friends:qr.share")}
            </Button>
          </div>

          <button
            type="button"
            onClick={() => setIsResetConfirmOpen(true)}
            disabled={!myQr}
            className="text-xs text-text-muted transition-colors hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("friends:qr.reset")}
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-surface p-5">
        <div className="flex items-center gap-2">
          <QrCodeIcon className="h-5 w-5 text-[#1565C0]" />
          <h3 className="text-base font-semibold text-text-primary">
            {t("friends:qr.resolveTitle")}
          </h3>
        </div>

        <p className="mt-2 text-sm text-text-secondary">
          {t("friends:qr.resolveHint")}
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Input
            value={resolveInput}
            onChange={(event) => setResolveInput(event.target.value)}
            placeholder={t("friends:qr.resolvePlaceholder")}
            containerClassName="flex-1"
          />
          <Button
            type="button"
            variant="brand"
            isLoading={isResolving}
            leftIcon={<CheckCircleIcon className="h-4 w-4" />}
            onClick={() => void resolveCode(resolveInput)}
          >
            {t("friends:qr.resolve")}
          </Button>
          <Button
            type="button"
            variant="brand-outline"
            leftIcon={<CameraIcon className="h-4 w-4" />}
            disabled={!supportsImageScan || isScanningImage}
            isLoading={isScanningImage}
            onClick={() => fileInputRef.current?.click()}
          >
            {t("friends:qr.scanImage")}
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) {
              return;
            }

            void handleScanImage(file);
            event.target.value = "";
          }}
        />

        {!supportsImageScan ? (
          <p className="mt-3 text-xs text-text-muted">
            {t("friends:qr.scanNotSupported")}
          </p>
        ) : null}

        {resolveError ? (
          <div className="mt-3 rounded-xl border border-danger/35 bg-danger/10 px-3 py-2 text-sm text-danger">
            {resolveError}
          </div>
        ) : null}
      </section>

      <ConfirmDialog
        isOpen={isResetConfirmOpen}
        onClose={() => setIsResetConfirmOpen(false)}
        onConfirm={() => void handleResetQr()}
        title={t("friends:qr.resetDialogTitle")}
        message={t("friends:qr.resetDialogMessage")}
        confirmText={t("friends:qr.resetDialogConfirm")}
        cancelText={t("common:actions.cancel")}
        variant="warning"
        isLoading={isResetting}
      />

      <Modal
        isOpen={isProfileOpen && Boolean(resolvedProfile)}
        onClose={() => setIsProfileOpen(false)}
        title={t("friends:qr.miniProfileTitle")}
        size="md"
      >
        {resolvedProfile ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar
                src={resolvedProfile.avatarUrl}
                alt={resolvedDisplayName}
                size="lg"
              />
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-text-primary">
                  {resolvedDisplayName}
                </p>
                <p className="truncate text-sm text-text-secondary">
                  {resolvedUsername}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {relationshipLabel}
                </p>
              </div>
            </div>

            <p
              className={clsx(
                "rounded-xl border px-3 py-2 text-sm",
                profileBio
                  ? "border-border bg-surface-overlay text-text-secondary"
                  : "border-border/60 bg-surface text-text-muted",
              )}
            >
              {profileBio || t("friends:qr.noBio")}
            </p>

            {renderProfileActions()}
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

export default FriendQrWorkspace;
