import React from "react";
import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { AppErrorPage } from "../error";
import {
  ForbiddenPage,
  MaintenancePage,
  NotFoundPage,
  RateLimitPage,
  ServerErrorPage,
  UnauthorizedPage,
} from "../../pages/errors";
import { ROUTE_PATHS } from "../../router/paths";

const getRouteErrorDetails = (error: unknown): string | undefined => {
  if (isRouteErrorResponse(error)) {
    const data =
      typeof error.data === "string"
        ? error.data
        : JSON.stringify(error.data, null, 2);
    return `HTTP ${error.status} ${error.statusText}\n${data}`;
  }

  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return undefined;
};

const readRouteErrorRequestId = (error: unknown): string | undefined => {
  if (!isRouteErrorResponse(error) || typeof error.data !== "object" || !error.data) {
    return undefined;
  }

  const data = error.data as Record<string, unknown>;
  return typeof data.requestId === "string" ? data.requestId : undefined;
};

const readRetryAfterSeconds = (error: unknown): number | undefined => {
  if (!isRouteErrorResponse(error) || typeof error.data !== "object" || !error.data) {
    return undefined;
  }

  const data = error.data as Record<string, unknown>;
  return typeof data.retryAfterSeconds === "number"
    ? data.retryAfterSeconds
    : undefined;
};

export const RouterErrorBoundary: React.FC = () => {
  const error = useRouteError();
  const details = getRouteErrorDetails(error);
  const requestId = readRouteErrorRequestId(error);

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      return <UnauthorizedPage />;
    }
    if (error.status === 403) {
      return <ForbiddenPage />;
    }
    if (error.status === 404) {
      return <NotFoundPage />;
    }
    if (error.status === 429) {
      return (
        <RateLimitPage
          requestId={requestId}
          retryAfterSeconds={readRetryAfterSeconds(error)}
        />
      );
    }
    if (error.status === 503) {
      return <MaintenancePage requestId={requestId} />;
    }
    if (error.status === 500 || error.status === 502 || error.status === 504) {
      return (
        <ServerErrorPage
          statusCode={error.status}
          requestId={requestId}
          details={details}
        />
      );
    }
  }

  return (
    <AppErrorPage
      statusCode={500}
      variant="server"
      title="Hệ thống đang gặp sự cố"
      description="Vui lòng thử lại. Nếu lỗi tiếp tục xảy ra, hãy gửi mã yêu cầu cho quản trị viên."
      details={details}
      primaryAction={{ label: "Thử lại", reload: true }}
      secondaryAction={{ label: "Về trang chat", to: ROUTE_PATHS.CHAT }}
    />
  );
};

export default RouterErrorBoundary;
