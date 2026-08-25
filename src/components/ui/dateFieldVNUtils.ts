import React, { useRef } from "react";

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const daysInMonth = (year: number, month: number): number => {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
};

export function isValidIsoDate(iso: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  return (
    year >= 1 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

export function normalizeVnDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function vnToIso(vn: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(vn.trim());
  if (!match) return "";
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  return isValidIsoDate(iso) ? iso : "";
}

export function isoToVn(iso: string): string {
  if (!isValidIsoDate(iso)) return "";
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

export function useIsoDateField(
  iso: string,
  onIsoChange: (iso: string) => void,
) {
  const [draft, setDraft] = React.useState<string | null>(null);
  const previousIsoRef = useRef(iso);
  const isTypingRef = useRef(false);

  React.useEffect(() => {
    if (previousIsoRef.current === iso) return;
    previousIsoRef.current = iso;
    if (isTypingRef.current) {
      isTypingRef.current = false;
      return;
    }
    setDraft(null);
  }, [iso]);

  const reset = React.useCallback(() => setDraft(null), []);

  return {
    value: draft ?? isoToVn(iso),
    reset,
    onChange: (value: string) => {
      const vn = normalizeVnDateInput(value);
      const next = vnToIso(vn);
      setDraft(next ? null : vn);
      isTypingRef.current = true;
      onIsoChange(next);
      if (previousIsoRef.current === next) isTypingRef.current = false;
    },
  };
}
