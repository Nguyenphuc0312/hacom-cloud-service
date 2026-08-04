import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ArrowPathIcon, CloudArrowDownIcon, SignalSlashIcon } from "@heroicons/react/24/outline";
import { AppErrorPage } from "./AppErrorPage";
import { Button } from "../ui";
import { ROUTE_PATHS } from "../../router/paths";
import { reportError } from "../../utils/errorReporter";
import { attemptChunkReloadOnce } from "../../utils/chunkReload";
import { classifyRuntimeError, type RuntimeErrorKind } from "../../utils/errorClassification";

interface AppErrorBoundaryProps {
  children: React.ReactNode;
  /** Changing this (route pathname) auto-clears a captured error. */
  resetKey?: string;
  /** Full route (pathname + search) for diagnostics. */
  route?: string;
}

interface AppErrorBoundaryState {
  error: Error | null;
  correlationId?: string;
  requestId?: string;
  /** True once a chunk reload was attempted but did not recover (avoid loop). */
  chunkGaveUp: boolean;
}

const readRequestId = (error: unknown): string | undefined => {
  if (error !== null && typeof error === "object") {
    const value = (error as { requestId?: unknown }).requestId;
    if (typeof value === "string") return value;
  }
  return undefined;
};

const makeCorrelationId = (): string =>
  `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Lightweight, non-alarming screen while a stale-deploy reload happens. */
const ChunkUpdateFallback: React.FC<{ reloading: boolean }> = ({ reloading }) => (
  <main className="flex min-h-[var(--app-dvh)] w-full flex-col items-center justify-center bg-background px-4 py-8 text-text-primary">
    <div className="flex w-full max-w-sm flex-col items-center text-center">
      <div className="mb-4 rounded-full bg-primary/10 p-3">
        <CloudArrowDownIcon className="h-7 w-7 text-primary" aria-hidden="true" />
      </div>
      <h1 className="text-lg font-semibold">Đang cập nhật phiên bản mới…</h1>
      <p className="mt-2 text-body-sm text-text-secondary">
        Ứng dụng vừa được cập nhật. Chúng tôi đang tải lại để áp dụng thay đổi.
      </p>
      {!reloading && (
        <Button
          variant="primary"
          size="md"
          className="mt-5 min-w-[8rem]"
          onClick={() => window.location.reload()}
        >
          Tải lại ngay
        </Button>
      )}
    </div>
  </main>
);

/** Soft recovery for transient network/connectivity errors (no scary 500). */
const NetworkRecoveryFallback: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <main className="flex min-h-[var(--app-dvh)] w-full flex-col items-center justify-center bg-background px-4 py-8 text-text-primary">
    <div className="flex w-full max-w-sm flex-col items-center text-center">
      <div className="mb-4 rounded-full bg-warning/10 p-3">
        <SignalSlashIcon className="h-7 w-7 text-warning-dark" aria-hidden="true" />
      </div>
      <h1 className="text-lg font-semibold">Kết nối chưa ổn định</h1>
      <p className="mt-2 text-body-sm text-text-secondary">
        Không tải được dữ liệu do mạng gián đoạn. Hãy kiểm tra kết nối rồi thử lại.
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Button variant="primary" size="md" className="min-w-[8rem]" onClick={onRetry}>
          <ArrowPathIcon className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Thử lại
        </Button>
        <Button
          variant="secondary"
          size="md"
          className="min-w-[8rem]"
          onClick={() => window.location.reload()}
        >
          Tải lại trang
        </Button>
      </div>
    </div>
  </main>
);

class AppErrorBoundaryInner extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  public state: AppErrorBoundaryState = {
    error: null,
    chunkGaveUp: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { error };
  }

  public componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const correlationId = makeCorrelationId();
    const requestId = readRequestId(error);

    // Never lose the log — always reported (redacted), even in production.
    reportError(error, {
      boundary: "AppRoot",
      route: this.props.route,
      componentStack: info.componentStack ?? undefined,
      extra: { correlationId },
    });

    // Stale-deploy recovery: reload once to fetch the new asset manifest.
    // `attemptChunkReloadOnce` returns false when a reload was already tried and
    // did not recover → show a manual reload button instead of looping.
    const chunkGaveUp =
      classifyRuntimeError(error) === "chunk" ? !attemptChunkReloadOnce() : false;

    this.setState({ correlationId, requestId, chunkGaveUp });
  }

  public componentDidUpdate(previousProps: AppErrorBoundaryProps): void {
    if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
      this.reset();
    }
  }

  private reset = (): void => {
    this.setState({
      error: null,
      correlationId: undefined,
      requestId: undefined,
      chunkGaveUp: false,
    });
  };

  public render(): React.ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    const kind: RuntimeErrorKind = classifyRuntimeError(error);

    if (kind === "chunk") {
      // While reloading, hide the button; if the reload already failed once,
      // show a manual reload affordance instead of looping.
      return <ChunkUpdateFallback reloading={!this.state.chunkGaveUp} />;
    }

    if (kind === "auth") {
      // Expired/invalid session bubbled to the root — send to login softly.
      return (
        <Navigate
          to={ROUTE_PATHS.LOGIN}
          replace
          state={{ sessionExpired: true, from: this.props.route }}
        />
      );
    }

    if (kind === "network") {
      return <NetworkRecoveryFallback onRetry={this.reset} />;
    }

    // Genuinely fatal UI error — keep the explicit error page, but with a
    // correlation id for admin debugging.
    return (
      <AppErrorPage
        statusCode={500}
        variant="server"
        title="Hệ thống đang gặp sự cố"
        description="Vui lòng thử lại. Nếu lỗi tiếp tục xảy ra, hãy gửi mã yêu cầu cho quản trị viên."
        requestId={this.state.requestId ?? this.state.correlationId}
        details={error.stack ?? error.message}
        primaryAction={{ label: "Thử lại", onClick: this.reset }}
        secondaryAction={{ label: "Về trang chat", to: ROUTE_PATHS.CHAT }}
      />
    );
  }
}

export const AppErrorBoundary: React.FC<Omit<AppErrorBoundaryProps, "resetKey" | "route">> = ({
  children,
}) => {
  const location = useLocation();
  return (
    <AppErrorBoundaryInner
      resetKey={location.pathname}
      route={`${location.pathname}${location.search}`}
    >
      {children}
    </AppErrorBoundaryInner>
  );
};

export default AppErrorBoundary;
