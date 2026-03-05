import React from "react";
import {
  isRouteErrorResponse,
  Link,
  useRouteError,
} from "react-router-dom";
import { ROUTE_PATHS } from "../../router/paths";

const getErrorMessage = (error: unknown): string => {
  if (isRouteErrorResponse(error)) {
    return error.data?.message ?? error.statusText ?? `HTTP ${error.status}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected error occurred while loading this page.";
};

export const RouterErrorBoundary: React.FC = () => {
  const error = useRouteError();
  const message = getErrorMessage(error);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-xl rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-red-700">Something went wrong</h1>
        <p className="mt-2 text-sm text-gray-700">{message}</p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Retry
          </button>
          <Link
            to={ROUTE_PATHS.CHAT}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Back to chat
          </Link>
        </div>
      </div>
    </div>
  );
};

export default RouterErrorBoundary;
