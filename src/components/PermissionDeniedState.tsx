import { Button } from 'antd';
import { useNavigate } from 'react-router-dom';

import { AppIcon } from '@/components/AppIcon';

interface PermissionDeniedStateProps {
  title?: string;
  description?: string;
}

export const PermissionDeniedState = ({
  title = 'Permission denied',
  description = 'Your current admin role cannot access this area.',
}: PermissionDeniedStateProps) => {
  const navigate = useNavigate();

  return (
    <div className="ds-error-state">
      <div className="ds-error-state-copy">
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <Button icon={<AppIcon name="dashboard" size={14} />} onClick={() => navigate('/')}>
        Go Dashboard
      </Button>
    </div>
  );
};
