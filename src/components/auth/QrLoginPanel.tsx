import React, { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import QRCode from "qrcode";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  DevicePhoneMobileIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import {
  QrLoginSessionStatus,
  type LoginResponse,
} from "@hacom/chat-shared-types";
import { Button } from "../ui";
import { extractApiError } from "../../lib/apiContract";
import { qrLoginService } from "../../services/qrLoginService";
import { useAuthStore } from "../../stores";
import type { User } from "../../stores/authStore";

interface QrLoginPanelProps {
  rememberMe?: boolean;
  onSuccess?: (payload: LoginResponse) => void;
}

type StoreAuthResponse = {
  user: User;
  accessToken?: string;
  refreshToken?: string;
  tokens?: {
    accessToken?: string;
    refreshToken?: string;
  };
};

type QrPanelState = {
  sessionId: string;
  webSecret: string;
  qrContent: string;
  qrImageUrl: string;
  status: QrLoginSessionStatus;
  expiresAt: string;
  displayHint: string;
  approvedAt?: string;
};

const ACTIVE_POLLING_STATUSES = new Set<QrLoginSessionStatus>([
  QrLoginSessionStatus.PENDING,
  QrLoginSessionStatus.SCANNED,
  QrLoginSessionStatus.APPROVED,
]);

const STATUS_COPY: Record<
  QrLoginSessionStatus,
  { title: string; body: string }
> = {
  PENDING: {
    title: "Đang chờ quét",
    body: "Mở Hacom Chat trên điện thoại đã đăng nhập và quét mã này.",
  },
  SCANNED: {
    title: "Đã quét trên điện thoại",
    body: "Kiểm tra thông tin trình duyệt trên điện thoại rồi bấm xác nhận.",
  },
  APPROVED: {
    title: "Đã xác nhận",
    body: "Đang hoàn tất đăng nhập trên trình duyệt này.",
  },
  REJECTED: {
    title: "Đã bị từ chối",
    body: "Bạn đã từ chối yêu cầu đăng nhập trên điện thoại.",
  },
  EXPIRED: {
    title: "Mã đã hết hạn",
    body: "Tạo mã mới để tiếp tục đăng nhập bằng QR.",
  },
  EXCHANGED: {
    title: "Đã đăng nhập",
    body: "Phiên QR này đã được sử dụng thành công.",
  },
};

const STATUS_CHIP_CLASS: Record<QrLoginSessionStatus, string> = {
  PENDING: "border-primary/25 bg-primary/10 text-primary",
  SCANNED: "border-warning/30 bg-warning/12 text-warning",
  APPROVED: "border-success/25 bg-success/12 text-success",
  REJECTED: "border-danger/25 bg-danger/12 text-danger",
  EXPIRED: "border-danger/25 bg-danger/12 text-danger",
  EXCHANGED: "border-success/25 bg-success/12 text-success",
};

const formatCountdown = (expiresAt: string): string => {
  const remainingMs = new Date(expiresAt).getTime() - Date.now();
  if (remainingMs <= 0) {
    return "00:00";
  }

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
};

const toIsoString = (value: string | Date | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
};

const normalizeLoginResponseForStore = (
  payload: LoginResponse,
): StoreAuthResponse => ({
  accessToken: payload.accessToken,
  refreshToken: payload.refreshToken,
  user: {
    id: payload.user.id,
    username:
      payload.user.username ||
      payload.user.displayName ||
      payload.user.email ||
      payload.user.id,
    email: payload.user.email,
    firstName: payload.user.firstName,
    lastName: payload.user.lastName,
    avatar: payload.user.avatar,
    phone: payload.user.phone,
    status: payload.user.status,
    isVerified: payload.user.isVerified,
    createdAt: toIsoString(payload.user.createdAt),
  },
});

export const QrLoginPanel: React.FC<QrLoginPanelProps> = ({
  rememberMe = false,
  onSuccess,
}) => {
  const applyLoginResponse = useAuthStore((state) => state.applyLoginResponse);
  const [panelState, setPanelState] = useState<QrPanelState | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExchanging, setIsExchanging] = useState(false);
  const [countdown, setCountdown] = useState("00:00");
  const [error, setError] = useState<string | null>(null);
  const exchangeStartedRef = useRef<string | null>(null);

  const statusCopy = useMemo(() => {
    if (!panelState) {
      return STATUS_COPY.PENDING;
    }

    return STATUS_COPY[panelState.status];
  }, [panelState]);
  const isWaitingForPhone =
    panelState?.status === QrLoginSessionStatus.PENDING ||
    panelState?.status === QrLoginSessionStatus.SCANNED;

  const refreshSession = async (): Promise<void> => {
    setError(null);
    setIsRefreshing(true);
    exchangeStartedRef.current = null;

    try {
      const session = await qrLoginService.createSession();
      const qrImageUrl = await QRCode.toDataURL(session.qrContent, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 240,
      });

      setPanelState({
        sessionId: session.sessionId,
        webSecret: session.webSecret,
        qrContent: session.qrContent,
        qrImageUrl,
        status: session.status,
        expiresAt: session.expiresAt,
        displayHint: "waiting_for_mobile_scan",
      });
      setCountdown(formatCountdown(session.expiresAt));
    } catch (cause) {
      const apiError = extractApiError(cause);
      setError(apiError.message || "Không thể tạo mã QR đăng nhập.");
      setPanelState(null);
    } finally {
      setIsBootstrapping(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void refreshSession();
  }, []);

  useEffect(() => {
    if (!panelState) {
      return;
    }

    setCountdown(formatCountdown(panelState.expiresAt));
    const timer = window.setInterval(() => {
      setCountdown(formatCountdown(panelState.expiresAt));
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [panelState?.expiresAt]);

  useEffect(() => {
    if (!panelState || !ACTIVE_POLLING_STATUSES.has(panelState.status)) {
      return;
    }

    const poll = async () => {
      try {
        const status = await qrLoginService.getStatus(
          panelState.sessionId,
          panelState.webSecret,
        );

        setPanelState((current) => {
          if (!current || current.sessionId !== status.sessionId) {
            return current;
          }

          return {
            ...current,
            status: status.status,
            expiresAt: status.expiresAt,
            displayHint: status.displayHint,
            approvedAt: status.approvedAt,
          };
        });
      } catch (cause) {
        const apiError = extractApiError(cause);
        setError(apiError.message || "Không thể kiểm tra trạng thái QR login.");
      }
    };

    const interval = window.setInterval(() => {
      void poll();
    }, 2000);

    return () => {
      window.clearInterval(interval);
    };
  }, [panelState?.sessionId, panelState?.status, panelState?.webSecret]);

  useEffect(() => {
    if (!panelState || panelState.status !== QrLoginSessionStatus.APPROVED) {
      return;
    }

    if (exchangeStartedRef.current === panelState.sessionId) {
      return;
    }

    exchangeStartedRef.current = panelState.sessionId;
    setIsExchanging(true);
    setError(null);

    void (async () => {
      try {
        const loginResponse = await qrLoginService.exchange(
          panelState.sessionId,
          panelState.webSecret,
        );

        applyLoginResponse(
          normalizeLoginResponseForStore(loginResponse),
          rememberMe,
        );
        setPanelState((current) =>
          current && current.sessionId === panelState.sessionId
            ? { ...current, status: QrLoginSessionStatus.EXCHANGED }
            : current,
        );
        onSuccess?.(loginResponse);
      } catch (cause) {
        exchangeStartedRef.current = null;
        const apiError = extractApiError(cause);
        setError(apiError.message || "Không thể hoàn tất đăng nhập bằng QR.");
      } finally {
        setIsExchanging(false);
      }
    })();
  }, [applyLoginResponse, onSuccess, panelState, rememberMe]);

  return (
    <section className="rounded-2xl border border-border bg-surface-overlay/60 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-text-primary sm:text-base">
            Đăng nhập bằng QR
          </h2>
          <p className="mt-1 text-xs text-text-muted sm:text-sm">
            {statusCopy.body}
          </p>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void refreshSession()}
          disabled={isRefreshing || isExchanging}
          leftIcon={<ArrowPathIcon className="h-4 w-4" />}
        >
          Làm mới
        </Button>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-[264px_1fr] sm:items-center">
        <div className="mx-auto flex h-[264px] w-[264px] items-center justify-center rounded-2xl border border-border bg-white p-3 shadow-sm">
          {panelState?.qrImageUrl ? (
            <img
              src={panelState.qrImageUrl}
              alt="QR login"
              className={clsx(
                "h-full w-full rounded-lg object-contain transition-opacity",
                (isRefreshing || isBootstrapping) && "opacity-50",
                isWaitingForPhone && "animate-pulse",
              )}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-lg bg-surface text-sm text-text-muted">
              Đang tạo mã QR...
            </div>
          )}
        </div>

        <div className="space-y-3">
          {panelState && (
            <div
              className={clsx(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
                STATUS_CHIP_CLASS[panelState.status],
              )}
            >
              <span
                className={clsx(
                  "h-2 w-2 rounded-full",
                  panelState.status === QrLoginSessionStatus.PENDING &&
                    "bg-primary animate-pulse",
                  panelState.status === QrLoginSessionStatus.SCANNED &&
                    "bg-warning animate-pulse",
                  panelState.status === QrLoginSessionStatus.APPROVED &&
                    "bg-success",
                  (panelState.status === QrLoginSessionStatus.REJECTED ||
                    panelState.status === QrLoginSessionStatus.EXPIRED) &&
                    "bg-danger",
                  panelState.status === QrLoginSessionStatus.EXCHANGED &&
                    "bg-success",
                )}
              />
              <span>{statusCopy.title}</span>
            </div>
          )}

          <div className="rounded-xl border border-border bg-surface p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
              {panelState?.status === QrLoginSessionStatus.APPROVED ||
              panelState?.status === QrLoginSessionStatus.EXCHANGED ? (
                <CheckCircleIcon className="h-5 w-5 text-success" />
              ) : panelState?.status === QrLoginSessionStatus.REJECTED ||
                panelState?.status === QrLoginSessionStatus.EXPIRED ? (
                <ExclamationTriangleIcon className="h-5 w-5 text-danger" />
              ) : (
                <DevicePhoneMobileIcon className="h-5 w-5 text-primary" />
              )}
              <span>{statusCopy.title}</span>
            </div>

            <div className="mt-3 flex items-center gap-2 text-sm text-text-secondary">
              <ClockIcon className="h-4 w-4" />
              <span>Mã còn hiệu lực: {countdown}</span>
            </div>

            {panelState?.displayHint === "waiting_for_mobile_confirm" && (
              <p className="mt-3 text-sm text-text-secondary">
                Điện thoại đã quét mã. Hãy xác nhận trên mobile để tiếp tục.
              </p>
            )}

            {isExchanging && (
              <p className="mt-3 text-sm text-primary">
                Đang trao đổi phiên đăng nhập với máy chủ...
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-xl border border-danger/35 bg-danger/10 p-3 text-sm text-danger">
              {error}
            </div>
          )}

          <div className="rounded-xl border border-border bg-surface p-3 text-xs leading-5 text-text-muted">
            Chỉ điện thoại đã đăng nhập mới có thể xác nhận.
            <br />
            Trình duyệt chỉ được đăng nhập sau khi bước exchange hoàn tất.
          </div>

          {(panelState?.status === QrLoginSessionStatus.REJECTED ||
            panelState?.status === QrLoginSessionStatus.EXPIRED) && (
            <Button
              type="button"
              variant="primary"
              fullWidth
              onClick={() => void refreshSession()}
              isLoading={isRefreshing}
            >
              Tạo mã mới
            </Button>
          )}
        </div>
      </div>
    </section>
  );
};

export default QrLoginPanel;
