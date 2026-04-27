import { Button } from 'antd';

import { AppIcon } from '@/components/AppIcon';

interface RateLimitStateProps {
  onRetry?: () => void;
}

export const RateLimitState = ({ onRetry }: RateLimitStateProps) => (
  <div className="ds-error-state">
    <div className="ds-error-state-copy">
      <strong>Rate limit reached</strong>
      <p>Too many admin requests were sent in a short period. Wait briefly, then retry.</p>
    </div>
    {onRetry ? (
      <Button icon={<AppIcon name="refresh" size={14} />} onClick={onRetry}>
        Retry
      </Button>
    ) : null}
  </div>
);
