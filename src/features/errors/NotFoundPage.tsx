import { Button } from 'antd';
import { useNavigate } from 'react-router-dom';

import { AppIcon } from '@/components/AppIcon';
import { PageShell } from '@/components/PageShell';
import { EmptyState } from '@/components/ui/EmptyState';

export const NotFoundPage = () => {
  const navigate = useNavigate();

  return (
    <PageShell
      eyebrow="Navigation"
      title="Page Not Found"
      description="The requested admin route does not exist in this panel."
      headerExtra={
        <Button icon={<AppIcon name="dashboard" size={14} />} onClick={() => navigate('/')}>
          Go Dashboard
        </Button>
      }
    >
      <div className="ds-ops-panel">
        <EmptyState
          title="404 Not Found"
          description="Check the URL or return to the admin dashboard."
          action={<Button onClick={() => navigate(-1)}>Back</Button>}
        />
      </div>
    </PageShell>
  );
};
