import React from "react";
import { AppErrorPage } from "../../components/error";
import { ROUTE_PATHS } from "../../router/paths";

interface RateLimitPageProps {
  retryAfterSeconds?: number;
  requestId?: string;
  onRetry?: () => void;
}

export const RateLimitPage: React.FC<RateLimitPageProps> = ({
  retryAfterSeconds,
  requestId,
  onRetry,
}) => {
  const [remainingSeconds, setRemainingSeconds] = React.useState(
    retryAfterSeconds ?? 0,
  );

  React.useEffect(() => {
    setRemainingSeconds(retryAfterSeconds ?? 0);
  }, [retryAfterSeconds]);

  React.useEffect(() => {
    if (remainingSeconds <= 0) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setRemainingSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [remainingSeconds]);

  const hasCountdown = retryAfterSeconds !== undefined;
  const canRetry = remainingSeconds <= 0;

  return (
    <AppErrorPage
      statusCode={429}
      variant="rate-limit"
      title="Bạn thao tác quá nhanh"
      description="Hệ thống đang giới hạn tần suất yêu cầu. Hãy thử lại sau ít phút."
      requestId={requestId}
      retryAfterSeconds={hasCountdown ? remainingSeconds : undefined}
      primaryAction={{
        label: canRetry ? "Thử lại" : `Thử lại sau ${remainingSeconds}s`,
        onClick: onRetry,
        reload: !onRetry,
        disabled: !canRetry,
      }}
      secondaryAction={{ label: "Về trang chat", to: ROUTE_PATHS.CHAT }}
    />
  );
};

export default RateLimitPage;
