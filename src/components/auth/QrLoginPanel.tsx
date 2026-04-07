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
  {
    title: string;
    body: string;
    toneClass: string;
    dotClass: string;
  }
> = {
  PENDING: {
    title: "Đang chờ quét",
    body: "Mở Hacom Chat trên điện thoại và quét mã để bắt đầu.",
    toneClass: "border-primary/30 bg-primary/10 text-primary",
    dotClass: "bg-primary animate-pulse",
  },
  SCANNED: {
    title: "Đã quét, chờ xác nhận",
    body: "Kiểm tra điện thoại và xác nhận đăng nhập để tiếp tục.",
    toneClass: "border-warning/35 bg-warning/15 text-warning",
    dotClass: "bg-warning animate-pulse",
  },
  APPROVED: {
    title: "Đã xác nhận",
    body: "Đang đăng nhập trên trình duyệt này.",
    toneClass: "border-success/30 bg-success/12 text-success",
    dotClass: "bg-success",
  },
  REJECTED: {
    title: "Đã bị từ chối",
    body: "Bạn đã từ chối yêu cầu đăng nhập trên điện thoại.",
    toneClass: "border-danger/35 bg-danger/12 text-danger",
    dotClass: "bg-danger",
  },
  EXPIRED: {
    title: "Mã đã hết hạn",
    body: "Tạo mã mới để tiếp tục đăng nhập bằng QR.",
    toneClass: "border-danger/35 bg-danger/12 text-danger",
    dotClass: "bg-danger",
  },
  EXCHANGED: {
    title: "Đăng nhập thành công",
    body: "Phiên đăng nhập đã hoàn tất.",
    toneClass: "border-success/30 bg-success/12 text-success",
    dotClass: "bg-success",
  },
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
    <section className="panel-section rounded-xl bg-surface px-4 py-4 sm:px-5 sm:py-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text-primary sm:text-base">
            Đăng nhập bằng QR
          </h2>
          <p className="mt-1 text-xs text-text-muted sm:text-sm">
            Quét mã bằng điện thoại để đăng nhập nhanh.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void refreshSession()}
          disabled={isRefreshing || isExchanging}
          leftIcon={<ArrowPathIcon className="h-4 w-4" />}
          className="h-9 rounded-lg"
        >
          Làm mới
        </Button>
      </header>

      <div className="mt-4 space-y-4">
        <div className="mx-auto flex h-60 w-60 items-center justify-center rounded-xl border border-border bg-white p-3 shadow-sm sm:h-64 sm:w-64">
          {panelState?.qrImageUrl ? (
            <img
              src={panelState.qrImageUrl}
              alt="QR login"
              className={clsx(
                "h-full w-full rounded-lg object-contain transition-opacity duration-200",
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

        <div className="flex flex-wrap items-center justify-center gap-2">
          <span
            className={clsx(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
              statusCopy.toneClass,
            )}
          >
            <span
              className={clsx("h-2 w-2 rounded-full", statusCopy.dotClass)}
            />
            <span>{statusCopy.title}</span>
          </span>

          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-overlay px-3 py-1 text-xs text-text-secondary">
            <ClockIcon className="h-3.5 w-3.5" />
            <span>{countdown}</span>
          </span>
        </div>

        <div className="text-center text-sm text-text-secondary">
          {panelState?.displayHint === "waiting_for_mobile_confirm"
            ? "Đã quét. Chờ xác nhận trên điện thoại."
            : statusCopy.body}
        </div>

        <div className="flex items-center justify-center gap-2 text-xs text-text-muted">
          {panelState?.status === QrLoginSessionStatus.APPROVED ||
          panelState?.status === QrLoginSessionStatus.EXCHANGED ? (
            <CheckCircleIcon className="h-4 w-4 text-success" />
          ) : panelState?.status === QrLoginSessionStatus.REJECTED ||
            panelState?.status === QrLoginSessionStatus.EXPIRED ? (
            <ExclamationTriangleIcon className="h-4 w-4 text-danger" />
          ) : (
            <DevicePhoneMobileIcon className="h-4 w-4 text-primary" />
          )}
          <span>Chỉ thiết bị đã đăng nhập mới có thể xác nhận.</span>
        </div>

        {isExchanging && (
          <p className="text-center text-sm text-primary">
            Đang hoàn tất đăng nhập...
          </p>
        )}

        {error && (
          <div className="rounded-xl border border-danger/35 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </div>
        )}

        {(panelState?.status === QrLoginSessionStatus.REJECTED ||
          panelState?.status === QrLoginSessionStatus.EXPIRED) && (
          <Button
            type="button"
            variant="secondary"
            fullWidth
            onClick={() => void refreshSession()}
            isLoading={isRefreshing}
            className="h-10 rounded-xl"
          >
            Tạo mã mới
          </Button>
        )}
      </div>
    </section>
  );
};

export default QrLoginPanel;
