import { useEffect, useMemo, useState } from "react";

const formatCountdown = (seconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
};

const parseTimeValue = (
  value: string | Date | null | undefined,
): number | null => {
  if (!value) {
    return null;
  }

  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(time) ? null : time;
};

export interface UseResendCooldownResult {
  now: number;
  secondsRemaining: number | null;
  formattedRemaining: string | null;
  canResend: boolean;
}

export const useResendCooldown = (
  resendAvailableAt: string | Date | null | undefined,
): UseResendCooldownResult => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const secondsRemaining = useMemo(() => {
    const targetTime = parseTimeValue(resendAvailableAt);
    if (targetTime === null) {
      return null;
    }

    return Math.max(0, Math.ceil((targetTime - now) / 1000));
  }, [now, resendAvailableAt]);

  return {
    now,
    secondsRemaining,
    formattedRemaining:
      secondsRemaining === null ? null : formatCountdown(secondsRemaining),
    canResend: (secondsRemaining ?? 0) === 0,
  };
};

export default useResendCooldown;
