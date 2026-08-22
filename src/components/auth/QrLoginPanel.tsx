import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { ArrowPathIcon, ClockIcon } from "@heroicons/react/24/outline";
import {
  QrLoginSessionStatus,
  type LoginResponse,
} from "@hacom/chat-shared-types/auth";
import { extractApiError } from "../../lib/apiContract";
import { qrLoginService } from "../../services/qrLoginService";
import { useAuthStore } from "../../stores";
import type { User } from "../../stores/authStore";
import { SafeImage } from "../common/SafeImage";

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

type AuthenticatedLoginResponse = Exclude<
  LoginResponse,
  { requiresPasswordChange: true }
>;

const isPasswordChangeRequired = (
  payload: LoginResponse,
): payload is Exclude<LoginResponse, AuthenticatedLoginResponse> =>
  "requiresPasswordChange" in payload && payload.requiresPasswordChange === true;

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

const STATUS_STYLES: Record<
  QrLoginSessionStatus,
  {
    toneClass: string;
    dotClass: string;
  }
> = {
  PENDING: {
    toneClass: "border-primary/30 bg-primary/10 text-primary",
    dotClass: "bg-primary animate-pulse",
  },
  SCANNED: {
    toneClass: "border-warning/35 bg-warning/15 text-warning",
    dotClass: "bg-warning animate-pulse",
  },
  APPROVED: {
    toneClass: "border-success/30 bg-success/12 text-success",
    dotClass: "bg-success",
  },
  REJECTED: {
    toneClass: "border-danger/35 bg-danger/12 text-danger",
    dotClass: "bg-danger",
  },
  EXPIRED: {
    toneClass: "border-danger/35 bg-danger/12 text-danger",
    dotClass: "bg-danger",
  },
  EXCHANGED: {
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
  payload: AuthenticatedLoginResponse,
): StoreAuthResponse => ({
  accessToken: payload.accessToken,
  refreshToken: payload.refreshToken,
  user: {
    id: payload.user.id,
    username: payload.user.username || payload.user.id,
    displayName: payload.user.displayName,
    fullNameFromHR: (payload.user as { fullNameFromHR?: string })
      .fullNameFromHR,
    full_name_from_hr: (payload.user as { full_name_from_hr?: string })
      .full_name_from_hr,
    employeeCode: (payload.user as { employeeCode?: string }).employeeCode,
    employee_code: (payload.user as { employee_code?: string }).employee_code,
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
  const { t } = useTranslation("auth");
  const applyLoginResponse = useAuthStore((state) => state.applyLoginResponse);
  const [panelState, setPanelState] = useState<QrPanelState | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExchanging, setIsExchanging] = useState(false);
  const [countdown, setCountdown] = useState("00:00");
  const [error, setError] = useState<string | null>(null);
  const exchangeStartedRef = useRef<string | null>(null);
  const panelSessionId = panelState?.sessionId ?? null;
  const panelWebSecret = panelState?.webSecret ?? null;
  const panelStatus = panelState?.status ?? null;
  const panelExpiresAt = panelState?.expiresAt ?? null;

  const statusCopy = useMemo(() => {
    const status = panelState?.status ?? QrLoginSessionStatus.PENDING;
    const statusKey = status.toLowerCase();
    const styles = STATUS_STYLES[status];

    return {
      title: t(`qrLogin.status.${statusKey}.title`),
      body: t(`qrLogin.status.${statusKey}.body`),
      toneClass: styles.toneClass,
      dotClass: styles.dotClass,
    };
  }, [panelState?.status, t]);
  const refreshSession = useCallback(async (): Promise<void> => {
    setError(null);
    setIsRefreshing(true);
    exchangeStartedRef.current = null;

    try {
      const session = await qrLoginService.createSession();
      const { default: QRCode } = await import("qrcode");
      const qrImageUrl = await QRCode.toDataURL(session.qrContent, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 176,
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
      setError(apiError.message || t("qrLogin.errorCreateSession"));
      setPanelState(null);
    } finally {
      setIsBootstrapping(false);
      setIsRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    if (!panelExpiresAt) {
      return;
    }

    setCountdown(formatCountdown(panelExpiresAt));
    const timer = window.setInterval(() => {
      setCountdown(formatCountdown(panelExpiresAt));
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [panelExpiresAt]);

  useEffect(() => {
    if (
      !panelSessionId ||
      !panelWebSecret ||
      !panelStatus ||
      !ACTIVE_POLLING_STATUSES.has(panelStatus)
    ) {
      return;
    }

    const poll = async () => {
      try {
        const status = await qrLoginService.getStatus(
          panelSessionId,
          panelWebSecret,
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
        setError(apiError.message || t("qrLogin.errorCheckStatus"));
      }
    };

    const interval = window.setInterval(() => {
      void poll();
    }, 2000);

    return () => {
      window.clearInterval(interval);
    };
  }, [panelSessionId, panelStatus, panelWebSecret, t]);

  useEffect(() => {
    if (
      panelStatus !== QrLoginSessionStatus.APPROVED ||
      !panelSessionId ||
      !panelWebSecret
    ) {
      return;
    }

    if (exchangeStartedRef.current === panelSessionId) {
      return;
    }

    exchangeStartedRef.current = panelSessionId;
    setIsExchanging(true);
    setError(null);

    void (async () => {
      try {
        const loginResponse = await qrLoginService.exchange(
          panelSessionId,
          panelWebSecret,
          rememberMe,
        );

        if (isPasswordChangeRequired(loginResponse)) {
          if (!loginResponse.passwordChangeContinuation) {
            throw new Error("Password-change continuation is missing");
          }
          useAuthStore.setState({
            user: null,
            authStatus: "password_change_required",
            passwordChangeContinuation: loginResponse.passwordChangeContinuation,
            isAuthenticated: false,
            isInitialized: true,
            isBootstrappingAuth: false,
          });
        } else {
          applyLoginResponse(
            normalizeLoginResponseForStore(loginResponse),
            rememberMe,
          );
        }
        setPanelState((current) =>
          current && current.sessionId === panelSessionId
            ? { ...current, status: QrLoginSessionStatus.EXCHANGED }
            : current,
        );
        onSuccess?.(loginResponse);
      } catch (cause) {
        exchangeStartedRef.current = null;
        const apiError = extractApiError(cause);
        setError(apiError.message || t("qrLogin.errorExchange"));
      } finally {
        setIsExchanging(false);
      }
    })();
  }, [
    applyLoginResponse,
    onSuccess,
    panelSessionId,
    panelStatus,
    panelWebSecret,
    rememberMe,
    t,
  ]);

  return (
    <div className="flex flex-col items-center gap-2">
      {/* QR box with refresh button overlay */}
      <div className="relative">
        <div
          className="flex items-center justify-center rounded-2xl border border-border bg-surface p-2 shadow-sm"
          style={{ width: "clamp(148px, 22vmin, 192px)", height: "clamp(148px, 22vmin, 192px)" }}
        >
          {panelState?.qrImageUrl ? (
            <SafeImage
              src={panelState.qrImageUrl}
              alt={t("qrLogin.alt")}
              className={clsx(
                "h-full w-full rounded-lg object-contain transition-opacity duration-200",
                (isRefreshing || isBootstrapping) && "opacity-40",
              )}
              objectFit="contain"
              fallback={
                <div className="h-full w-full rounded-lg bg-surface-overlay animate-pulse" />
              }
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-lg bg-surface text-xs text-text-muted">
              {t("qrLogin.creating")}
            </div>
          )}

          {/* Overlay khi expired/rejected */}
          {(panelState?.status === QrLoginSessionStatus.REJECTED ||
            panelState?.status === QrLoginSessionStatus.EXPIRED) && (
            <button
              type="button"
              onClick={() => void refreshSession()}
              disabled={isRefreshing}
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl bg-surface/90 text-sm font-semibold text-text-primary transition hover:bg-surface"
            >
              <ArrowPathIcon className={clsx("h-6 w-6", isRefreshing && "animate-spin")} />
              {t("qrLogin.createNew")}
            </button>
          )}
        </div>

        {/* Refresh button top-right */}
        <button
          type="button"
          onClick={() => void refreshSession()}
          disabled={isRefreshing || isExchanging}
          title={t("qrLogin.refresh")}
          className="absolute -right-3 -top-3 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface shadow-sm text-text-muted transition hover:text-primary disabled:opacity-40"
        >
          <ArrowPathIcon className={clsx("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
        </button>
      </div>

      {/* Status + countdown */}
      <div className="flex items-center gap-2">
        <span
          className={clsx(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
            statusCopy.toneClass,
          )}
        >
          <span className={clsx("h-1.5 w-1.5 rounded-full", statusCopy.dotClass)} />
          {statusCopy.title}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-overlay px-2.5 py-0.5 text-xs text-text-secondary">
          <ClockIcon className="h-3 w-3" />
          {countdown}
        </span>
      </div>

      {isExchanging && (
        <p className="text-center text-xs text-primary">{t("qrLogin.exchanging")}</p>
      )}

      {error && (
        <div className="w-full rounded-xl border border-danger/35 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}
    </div>
  );
};

export default QrLoginPanel;
