import { useEffect, useRef } from 'react';
import { reportActivity } from '../services/activityAnalytics';

const MIN_INTERVAL_MS = 60_000;

const createEventId = (): string => crypto.randomUUID();

export const useActivityAnalytics = (): void => {
  const lastReportedAt = useRef(0);

  useEffect(() => {
    const report = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastReportedAt.current < MIN_INTERVAL_MS) return;
      lastReportedAt.current = Date.now();
      const eventId = createEventId();
      const occurredAt = new Date();
      void reportActivity(eventId, occurredAt).catch(() => {
        window.setTimeout(() => void reportActivity(eventId, occurredAt).catch(() => undefined), 1_000);
      });
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') report(); };
    report();
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('pointerdown', report, { passive: true });
    document.addEventListener('keydown', report);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('pointerdown', report);
      document.removeEventListener('keydown', report);
    };
  }, []);
};
