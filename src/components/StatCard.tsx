import { Card, Skeleton, Statistic, Typography } from 'antd';

interface StatCardProps {
  title: string;
  value?: number;
  loading?: boolean;
  error?: boolean;
  suffix?: string;
  hint?: string;
  compact?: boolean;
}

export const StatCard = ({
  title,
  value = 0,
  loading = false,
  error = false,
  suffix,
  hint,
  compact = false,
}: StatCardProps) => {
  return (
    <Card className={`stat-card${compact ? ' stat-card--compact' : ''}`}>
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
          <Statistic
            title={title}
            value={value}
            suffix={suffix}
            valueStyle={compact ? { fontSize: 28, lineHeight: 1.15 } : undefined}
          />
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
