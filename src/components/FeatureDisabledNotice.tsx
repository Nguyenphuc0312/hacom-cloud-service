import { StatusBadge } from '@/components/StatusBadge';
import { SurfaceCard } from '@/components/ui/SurfaceCard';

interface FeatureDisabledNoticeProps {
  title?: string;
  description: string;
}

export const FeatureDisabledNotice = ({
  title = 'Write actions unavailable',
  description,
}: FeatureDisabledNoticeProps) => {
  return (
    <SurfaceCard
      eyebrow="Release guard"
      title={title}
      description={description}
      status={<StatusBadge status="warning" />}
      className="ds-feature-disabled-notice"
    />
  );
};
