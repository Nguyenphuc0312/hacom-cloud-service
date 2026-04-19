import { StatusBadge } from '@/components/StatusBadge';
import { SurfaceCard } from '@/components/ui/SurfaceCard';

interface FeatureDisabledNoticeProps {
  title?: string;
  description: string;
}

export const FeatureDisabledNotice = ({
  title = 'Tác vụ ghi hiện không khả dụng',
  description,
}: FeatureDisabledNoticeProps) => {
  return (
    <SurfaceCard
      eyebrow="Ràng buộc phát hành"
      title={title}
      description={description}
      status={<StatusBadge status="warning" />}
      className="ds-feature-disabled-notice"
    />
  );
};
