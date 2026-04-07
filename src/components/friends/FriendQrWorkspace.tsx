import React from "react";
import clsx from "clsx";
import QRCode from "qrcode";
import {
  CameraIcon,
  CheckCircleIcon,
  LinkIcon,
  QrCodeIcon,
  UserPlusIcon,
  ArrowPathIcon,
  ChatBubbleLeftRightIcon,
  NoSymbolIcon,
} from "@heroicons/react/24/outline";
import type { FriendshipRelationDto } from "@hacom/chat-shared-types";
import { Avatar } from "../common/Avatar";
import { Button, ConfirmDialog, Input, Modal, Spinner, toast } from "../ui";
import { useAuthStore } from "../../stores";
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
import { ROUTE_PATHS } from "../../router/paths";
import {
  parseShareCodeInput,
  invalidQrCodeMessage,
} from "../../features/friend-qr/shareCode";
import { useNavigate, useSearchParams } from "react-router-dom";

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
): string => {
  if (!user) {
    return "Unknown user";
  }

  const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim();
  if (fullName) {
    return fullName;
  }

  return user.username || user.email || user.id;
};

const toFriendlyResolveMessage = (message: string | undefined): string => {
  if (!message) {
    return invalidQrCodeMessage;
  }

  const normalized = message.toLowerCase();
  if (normalized.includes("invalid") || normalized.includes("expired")) {
    return invalidQrCodeMessage;
  }

  return message;
};

export const FriendQrWorkspace: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const currentUser = useAuthStore((state) => state.user);
  const currentUserId = currentUser?.id ?? null;

  const {
    getRelationshipState,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    cancelFriendRequest,
    blockUser,
    unblockUser,
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
      toast.error(apiError.message || "Khong the tai QR ban be");
    } finally {
      setIsMyQrLoading(false);
    }
  }, []);

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

    const fromQuery = searchParams.get("code");
    if (!fromQuery) {
      return;
    }

    autoResolvedFromUrlRef.current = true;
    setResolveInput(fromQuery);
  }, [searchParams]);

  const copyText = React.useCallback(
    async (value: string, successMessage: string) => {
      try {
        await navigator.clipboard.writeText(value);
        toast.success(successMessage);
        return true;
      } catch {
        toast.error("Khong the sao chep. Vui long thu lai");
        return false;
      }
    },
    [],
  );

  const handleShare = React.useCallback(async () => {
    if (!myQr) {
      return;
    }

    const shareTitle = "Ho so ket ban";
    const shareText = `Ket ban voi toi qua ma QR: ${myQr.deepLink}`;

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

    await copyText(myQr.deepLink, "Da sao chep lien ket QR");
  }, [copyText, myQr]);

  const handleResetQr = React.useCallback(async () => {
    setIsResetting(true);
    try {
      const response = await friendQrApi.resetMyFriendQr();
      const payload = unwrapApiSuccess(response);
      setMyQr(payload);
      setResetNotice(
        "QR cu khong con su dung duoc. Hay chia se ma moi de ket ban.",
      );
      toast.success("Da tao QR moi thanh cong");
      setIsResetConfirmOpen(false);
    } catch (error) {
      const apiError = extractApiError(error);
      toast.error(apiError.message || "Khong the reset QR");
    } finally {
      setIsResetting(false);
    }
  }, []);

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
      const parsedCode = parseShareCodeInput(rawInput);
      if (!parsedCode) {
        setResolveError(invalidQrCodeMessage);
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
        setResolveError(toFriendlyResolveMessage(apiError.message));
      } finally {
        setIsResolving(false);
      }
    },
    [applyResolvedRelation],
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
        if (isMounted) {
          setProfileBio(
            typeof payload.bio === "string" && payload.bio.trim()
              ? payload.bio.trim()
              : null,
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
        toast.error("Trinh duyet hien tai khong ho tro quet QR tu anh");
        return;
      }

      setIsScanningImage(true);
      try {
        const detector = new DetectorCtor({ formats: ["qr_code"] });
        const bitmap = await createBitmap(file);
        const results = await detector.detect(bitmap);
        const rawValue = results[0]?.rawValue;

        if (!rawValue) {
          setResolveError("Khong tim thay ma QR hop le trong anh");
          return;
        }

        const parsed = parseShareCodeInput(rawValue);
        if (!parsed) {
          setResolveError(invalidQrCodeMessage);
          return;
        }

        setResolveInput(parsed);
        await resolveCode(parsed);
      } catch {
        setResolveError("Khong the quet QR tu anh. Vui long thu lai");
      } finally {
        setIsScanningImage(false);
      }
    },
    [resolveCode],
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
          toast.error("Khong the thuc hien thao tac");
          return;
        }

        toast.success(successMessage);
      } finally {
        setIsProfileActionLoading(null);
      }
    },
    [],
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
      toast.error(apiError.message || "Khong the mo cuoc tro chuyen");
    } finally {
      setIsProfileActionLoading(null);
    }
  }, [navigate, resolvedProfile?.id]);

  const renderProfileActions = () => {
    if (!relationship || !resolvedProfile) {
      return null;
    }

    const capabilities = relationship.capabilities;

    if (relationship.kind === "self") {
      return (
        <p className="rounded-xl bg-surface-overlay px-3 py-2 text-sm text-text-secondary">
          Day la ho so cua ban
        </p>
      );
    }

    if (relationship.kind === "friend") {
      return (
        <div className="flex flex-wrap gap-2">
          {capabilities.canMessage ? (
            <Button
              type="button"
              leftIcon={<ChatBubbleLeftRightIcon className="h-4 w-4" />}
              isLoading={isProfileActionLoading === "message"}
              onClick={() => void handleOpenMessage()}
            >
              Message
            </Button>
          ) : null}
          {capabilities.canBlock ? (
            <Button
              type="button"
              variant="secondary"
              leftIcon={<NoSymbolIcon className="h-4 w-4" />}
              isLoading={isProfileActionLoading === "block"}
              onClick={() =>
                void handleProfileAction(
                  "block",
                  () => blockUser(resolvedProfile.id),
                  "Da chan nguoi dung",
                )
              }
            >
              Block
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
              isLoading={isProfileActionLoading === "accept"}
              onClick={() =>
                void handleProfileAction(
                  "accept",
                  () => acceptFriendRequest(relationship.requestId),
                  "Da chap nhan loi moi ket ban",
                )
              }
            >
              Accept
            </Button>
          ) : null}
          {capabilities.canDecline ? (
            <Button
              type="button"
              variant="secondary"
              isLoading={isProfileActionLoading === "decline"}
              onClick={() =>
                void handleProfileAction(
                  "decline",
                  () => rejectFriendRequest(relationship.requestId),
                  "Da tu choi loi moi",
                )
              }
            >
              Decline
            </Button>
          ) : null}
        </div>
      );
    }

    if (relationship.kind === "outgoing_request") {
      return (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled>
            Pending
          </Button>
          {capabilities.canCancel ? (
            <Button
              type="button"
              variant="ghost"
              isLoading={isProfileActionLoading === "cancel"}
              onClick={() =>
                void handleProfileAction(
                  "cancel",
                  () => cancelFriendRequest(relationship.requestId),
                  "Da huy loi moi ket ban",
                )
              }
            >
              Cancel
            </Button>
          ) : null}
        </div>
      );
    }

    if (relationship.kind === "blocked") {
      return capabilities.canUnblock ? (
        <Button
          type="button"
          variant="secondary"
          isLoading={isProfileActionLoading === "unblock"}
          onClick={() =>
            void handleProfileAction(
              "unblock",
              () => unblockUser(resolvedProfile.id),
              "Da bo chan nguoi dung",
            )
          }
        >
          Unblock
        </Button>
      ) : null;
    }

    return (
      <div className="flex flex-wrap gap-2">
        {capabilities.canSendRequest ? (
          <Button
            type="button"
            leftIcon={<UserPlusIcon className="h-4 w-4" />}
            isLoading={isProfileActionLoading === "add"}
            onClick={() =>
              void handleProfileAction(
                "add",
                () => sendFriendRequest(resolvedProfile.id),
                "Da gui loi moi ket ban",
              )
            }
          >
            Add Friend
          </Button>
        ) : null}
        {capabilities.canBlock ? (
          <Button
            type="button"
            variant="secondary"
            leftIcon={<NoSymbolIcon className="h-4 w-4" />}
            isLoading={isProfileActionLoading === "block"}
            onClick={() =>
              void handleProfileAction(
                "block",
                () => blockUser(resolvedProfile.id),
                "Da chan nguoi dung",
              )
            }
          >
            Block
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
        return "Ho so cua ban";
      case "friend":
        return "Da la ban be";
      case "incoming_request":
        return "Da nhan loi moi ket ban";
      case "outgoing_request":
        return "Dang cho xac nhan";
      case "blocked":
        return "Da chan";
      default:
        return "Chua ket ban";
    }
  }, [relationship]);

  const resolvedDisplayName = resolvedProfile?.displayName || "Unknown user";
  const resolvedUsername = resolvedProfile?.username
    ? `@${resolvedProfile.username}`
    : "Khong co username";

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar
              src={currentUser?.avatar}
              alt={getDisplayName(currentUser)}
              size="lg"
            />
            <div>
              <p className="text-base font-semibold text-text-primary">
                {getDisplayName(currentUser)}
              </p>
              <p className="text-sm text-text-secondary">
                {currentUser?.username
                  ? `@${currentUser.username}`
                  : "Khong co username"}
              </p>
            </div>
          </div>
          {isMyQrLoading ? <Spinner size="xs" /> : null}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[15rem_1fr]">
          <div className="mx-auto flex h-60 w-60 items-center justify-center rounded-2xl border border-border bg-white p-3 shadow-sm">
            {myQrImageUrl ? (
              <img
                src={myQrImageUrl}
                alt="Friend QR"
                className="h-full w-full rounded-lg"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-text-secondary">
                Dang tao QR...
              </div>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-sm text-text-secondary">
              Chia se ma nay de nguoi khac quet va mo mini profile cua ban.
            </p>

            <div className="rounded-xl border border-border bg-surface-overlay px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-text-muted">
                Share Code
              </p>
              <p className="mt-1 break-all text-sm font-medium text-text-primary">
                {myQr?.shareCode || "--"}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-surface-overlay px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-text-muted">
                Deep Link
              </p>
              <p className="mt-1 break-all text-sm text-text-primary">
                {myQr?.deepLink || "--"}
              </p>
            </div>

            {myQr?.updatedAt ? (
              <p className="text-xs text-text-muted">
                Cap nhat luc {new Date(myQr.updatedAt).toLocaleString()}
              </p>
            ) : null}

            {resetNotice ? (
              <div className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                {resetNotice}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                leftIcon={<ArrowPathIcon className="h-4 w-4" />}
                onClick={() => void refreshMyQr()}
                disabled={isMyQrLoading}
              >
                Refresh
              </Button>
              <Button
                type="button"
                leftIcon={<LinkIcon className="h-4 w-4" />}
                onClick={() => void handleShare()}
                disabled={!myQr}
              >
                Share
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  myQr
                    ? void copyText(myQr.deepLink, "Da sao chep lien ket")
                    : undefined
                }
                disabled={!myQr}
              >
                Copy link
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  myQr
                    ? void copyText(myQr.shareCode, "Da sao chep share code")
                    : undefined
                }
                disabled={!myQr}
              >
                Copy code
              </Button>
              <Button
                type="button"
                variant="danger"
                leftIcon={<ArrowPathIcon className="h-4 w-4" />}
                onClick={() => setIsResetConfirmOpen(true)}
                disabled={!myQr}
              >
                Reset QR
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-surface p-5">
        <div className="flex items-center gap-2">
          <QrCodeIcon className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold text-text-primary">
            Resolve QR / Share Code
          </h3>
        </div>

        <p className="mt-2 text-sm text-text-secondary">
          Dan deep link, nhap share code, hoac quet tu anh neu trinh duyet ho
          tro.
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Input
            value={resolveInput}
            onChange={(event) => setResolveInput(event.target.value)}
            placeholder="Nhap share code hoac deep link"
            containerClassName="flex-1"
          />
          <Button
            type="button"
            isLoading={isResolving}
            leftIcon={<CheckCircleIcon className="h-4 w-4" />}
            onClick={() => void resolveCode(resolveInput)}
          >
            Resolve
          </Button>
          <Button
            type="button"
            variant="secondary"
            leftIcon={<CameraIcon className="h-4 w-4" />}
            disabled={!supportsImageScan || isScanningImage}
            isLoading={isScanningImage}
            onClick={() => fileInputRef.current?.click()}
          >
            Scan QR
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
            Trinh duyet hien tai khong ho tro scan QR tu anh. Ban van co the
            nhap share code.
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
        title="Reset QR ket ban"
        message="Ban co chac muon tao QR moi? QR cu se het hieu luc ngay lap tuc."
        confirmText="Reset ngay"
        cancelText="Huy"
        variant="warning"
        isLoading={isResetting}
      />

      <Modal
        isOpen={isProfileOpen && Boolean(resolvedProfile)}
        onClose={() => setIsProfileOpen(false)}
        title="Mini profile"
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
              {profileBio || "Chua co gioi thieu ngan"}
            </p>

            {renderProfileActions()}
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

export default FriendQrWorkspace;
