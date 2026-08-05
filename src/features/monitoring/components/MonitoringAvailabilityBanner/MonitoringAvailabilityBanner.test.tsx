import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { MonitoringOverviewResponse } from '@/api/types/monitoring/monitoring';

import { MonitoringAvailabilityBanner } from './MonitoringAvailabilityBanner';

const warnings: MonitoringOverviewResponse['warnings'] = [
  {
    key: 'prometheus-unavailable',
    code: 'datasource_unreachable',
    source: 'prometheus',
    message: 'Prometheus is temporarily unavailable',
    severity: 'warning',
    suggestedAction: 'Check the source connection',
  },
];

describe('MonitoringAvailabilityBanner', () => {
  it('stays compact and exposes warning detail only on demand', () => {
    render(
      <MonitoringAvailabilityBanner
        freshness="partial"
        warnings={warnings}
        prometheusStatus="unavailable"
        lokiStatus="available"
      />,
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Check the source connection')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Chi tiết' }));
    expect(screen.getByText('Check the source connection')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Thu gọn' }));
    expect(screen.queryByText('Check the source connection')).not.toBeInTheDocument();
  });

  it('opens source diagnostics without treating monitoring loss as system health', () => {
    render(
      <MonitoringAvailabilityBanner
        freshness="partial"
        warnings={warnings}
        prometheusStatus="unavailable"
        lokiStatus="available"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Chẩn đoán nguồn' }));
    expect(screen.getByText('Chẩn đoán nguồn monitoring')).toBeInTheDocument();
    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName === 'LI' &&
          (element.textContent ?? '').includes('Prometheus is temporarily unavailable'),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Prometheus:/)).toHaveTextContent('unavailable');
  });

  it('does not render when all sources and freshness are live', () => {
    const { container } = render(
      <MonitoringAvailabilityBanner
        freshness="live"
        warnings={[]}
        prometheusStatus="available"
        lokiStatus="available"
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
