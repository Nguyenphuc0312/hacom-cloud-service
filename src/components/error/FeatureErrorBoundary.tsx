import React from "react";
import { useLocation } from "react-router-dom";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Button } from "../ui";
import { reportError } from "../../utils/errorReporter";
import { attemptChunkReloadOnce } from "../../utils/chunkReload";
import { isChunkLoadError } from "../../utils/errorClassification";

export interface FeatureErrorBoundaryProps {
  children: React.ReactNode;
  /** Human-readable name for error reporting. */
  name: string;
  /** Fallback content when an error occurs (replaces children). */
  fallback?: React.ReactNode;
  /** Called when error resets (e.g. route change). */
  onReset?: () => void;
  /** Hide error details in production. */
  showDetails?: boolean;
}

interface FeatureErrorBoundaryState {
  error: Error | null;
}

class FeatureErrorBoundaryInner extends React.Component<
  FeatureErrorBoundaryProps,
  FeatureErrorBoundaryState
> {
  public state: FeatureErrorBoundaryState = { error: null };

  public static getDerivedStateFromError(error: Error): FeatureErrorBoundaryState {
    return { error };
  }

  public componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Isolated panel crash — log it (never swallow), but keep the app shell.
    reportError(error, {
      boundary: this.props.name,
      componentStack: info.componentStack ?? undefined,
    });

    // A lazily-loaded panel can hit a stale-deploy chunk error; recover once.
    if (isChunkLoadError(error)) {
      attemptChunkReloadOnce();
    }
  }

  public componentDidUpdate(prevProps: FeatureErrorBoundaryProps): void {
    if (this.state.error && prevProps.name !== this.props.name) {
      this.setState({ error: null });
      this.props.onReset?.();
    }
  }

  public render(): React.ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 py-8 text-center">
        <div className="rounded-full bg-danger/10 p-3">
          <ExclamationTriangleIcon className="h-6 w-6 text-danger" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <p className="text-body-sm font-semibold text-text-primary">
            {this.props.name} gặp sự cố
          </p>
          <p className="text-body-xs text-text-secondary">
            Vui lòng thử tải lại trang hoặc quay lại danh sách hội thoại.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.location.reload()}
          >
            Tải lại trang
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              this.setState({ error: null });
              this.props.onReset?.();
            }}
          >
            Thử lại
          </Button>
        </div>
        {this.props.showDetails && (
          <details className="w-full max-w-md">
            <summary className="cursor-pointer text-body-xs text-text-tertiary hover:text-text-secondary">
              Chi tiết lỗi (chỉ dành cho phát triển)
            </summary>
            <pre className="mt-1 max-h-32 overflow-auto rounded bg-surface-hover p-2 text-left text-body-xs text-danger">
              {this.state.error.stack ?? this.state.error.message}
            </pre>
          </details>
        )}
      </div>
    );
  }
}

/**
 * Wraps a feature area with a React Error Boundary.
 * Prevents component crashes from taking down the entire page.
 * Resets on route change via pathname key.
 */
export const FeatureErrorBoundary: React.FC<Omit<FeatureErrorBoundaryProps, "onReset">> = ({
  children,
  name,
  fallback,
  showDetails,
}) => {
  const location = useLocation();

  return (
    <FeatureErrorBoundaryInner
      key={location.pathname}
      name={name}
      fallback={fallback}
      onReset={() => {}}
      showDetails={showDetails ?? import.meta.env.DEV}
    >
      {children}
    </FeatureErrorBoundaryInner>
  );
};

export default FeatureErrorBoundary;
