import { Alert, Button } from 'antd';

interface SystemDegradedBannerProps {
  visible: boolean;
  title: string;
  description: string;
  onRetry?: () => void;
  retryLabel?: string;
  retrying?: boolean;
}

export const SystemDegradedBanner = ({
  visible,
  title,
  description,
  onRetry,
  retryLabel = 'Thử lại',
  retrying = false,
}: SystemDegradedBannerProps) => {
  if (!visible) {
    return null;
  }

  return (
    <Alert
      type="warning"
      showIcon
      message={title}
      description={description}
      action={
        onRetry ? (
          <Button size="small" onClick={onRetry} loading={retrying}>
            {retryLabel}
          </Button>
        ) : undefined
      }
    />
  );
};
