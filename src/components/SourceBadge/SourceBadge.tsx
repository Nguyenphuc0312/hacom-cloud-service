import { Tag } from 'antd';

import { AppTooltip } from '@/components/AppTooltip/AppTooltip';

interface SourceBadgeProps {
  source?: string | null;
  title?: string;
}

const sourceTone: Record<string, string> = {
  manual: 'default',
  bootstrap: 'purple',
  request: 'blue',
  rule: 'purple',
  auto_detected: 'blue',
  imported: 'default',
};

const formatSource = (source?: string | null) => {
  if (!source) {
    return 'Unknown';
  }

  return source
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

export const SourceBadge = ({ source, title }: SourceBadgeProps) => {
  const normalized = source?.toLowerCase() ?? 'unknown';
  const node = <Tag color={sourceTone[normalized] ?? 'default'}>{formatSource(source)}</Tag>;

  return title ? <AppTooltip title={title}>{node}</AppTooltip> : node;
};
