import { Alert } from 'antd';

interface FeatureDisabledNoticeProps {
  title?: string;
  description: string;
}

export const FeatureDisabledNotice = ({
  title = 'Write actions unavailable',
  description,
}: FeatureDisabledNoticeProps) => {
  return <Alert type="info" showIcon message={title} description={description} />;
};
