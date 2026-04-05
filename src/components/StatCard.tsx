import { Card, Skeleton, Statistic, Typography } from 'antd';

interface StatCardProps {
  title: string;
  value?: number;
  loading?: boolean;
  error?: boolean;
  suffix?: string;
  hint?: string;
}

export const StatCard = ({
  title,
  value = 0,
  loading = false,
  error = false,
  suffix,
  hint,
}: StatCardProps) => {
  return (
    <Card className="stat-card">
      {loading ? (
        <Skeleton active paragraph={{ rows: 1 }} title={{ width: '70%' }} />
      ) : error ? (
        <div>
          <Typography.Text strong>{title}</Typography.Text>
          <br />
          <Typography.Text type="danger">Unavailable</Typography.Text>
        </div>
      ) : (
        <>
          <Statistic title={title} value={value} suffix={suffix} />
          {hint ? (
            <Typography.Text type="secondary" className="stat-card-hint">
              {hint}
            </Typography.Text>
          ) : null}
        </>
      )}
    </Card>
  );
};
