/**
 * Date helpers shared by the resource/search filters.
 *
 * Display format is dd/mm/yyyy (what Vietnamese users type and read); the
 * internal format is ISO yyyy-mm-dd, which sorts lexicographically and so can
 * be compared with plain string operators when testing range membership.
 */

/** yyyy-mm-dd → dd/mm/yyyy (empty string if not a full ISO day). */
export const isoToDisplay = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};

/** dd/mm/yyyy → yyyy-mm-dd, or null if incomplete/invalid. */
export const displayToIso = (display: string): string | null => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  // Reject overflow like 31/02 (Date rolls it over).
  if (d.getDate() !== Number(dd) || d.getMonth() + 1 !== Number(mm)) return null;
  return `${yyyy}-${mm}-${dd}`;
};

/** Insert `/` separators as the user types digits (dd/mm/yyyy). */
export const maskDateInput = (raw: string): string => {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)];
  return parts.filter((p) => p.length > 0).join("/");
};

const pad2 = (n: number): string => String(n).padStart(2, "0");

export const toIso = (y: number, m0: number, d: number): string =>
  `${y}-${pad2(m0 + 1)}-${pad2(d)}`;

/**
 * Local-time ISO day for a timestamp.
 *
 * `Date.prototype.toISOString` converts to UTC first, which shifts a late
 * evening message in UTC+7 onto the next day. Range filtering and day grouping
 * must agree with the date the user sees on the row, so derive the parts from
 * the local-time getters instead.
 */
export const toLocalIsoDay = (value: Date): string =>
  toIso(value.getFullYear(), value.getMonth(), value.getDate());

/**
 * Turn the picker's inclusive ISO days into the `from`/`to` instants that
 * `GET /messages/search` expects.
 *
 * The endpoint validates both bounds with `Joi.date().iso()` and compares them
 * as instants, so a bare `to=2026-08-14` becomes midnight UTC and drops every
 * message actually sent that day — measured against the live API: `from` and
 * `to` both `2026-08-14` returned `total=0` while the same range widened to
 * `2026-08-15` returned 19 messages, all dated 08-14.
 *
 * So `to` is pushed to the last millisecond of the chosen local day. Both ends
 * are built from local-time parts and serialised WITH the offset, so the window
 * matches the calendar day the user picked in their own timezone rather than in
 * UTC.
 */
export const isoRangeToSearchWindow = (
  fromIso: string | null,
  toIso: string | null,
): { from?: string; to?: string } => {
  const window: { from?: string; to?: string } = {};
  if (fromIso) {
    const start = new Date(`${fromIso}T00:00:00`);
    if (!Number.isNaN(start.getTime())) window.from = start.toISOString();
  }
  if (toIso) {
    const end = new Date(`${toIso}T23:59:59.999`);
    if (!Number.isNaN(end.getTime())) window.to = end.toISOString();
  }
  return window;
};

/** Build the 6×7 grid of days for the month containing (year, month0). */
export const buildMonthCells = (
  year: number,
  month0: number,
): Array<{ iso: string; day: number; inMonth: boolean }> => {
  const firstDow = new Date(year, month0, 1).getDay(); // 0=CN
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const cells: Array<{ iso: string; day: number; inMonth: boolean }> = [];

  // Leading days from previous month
  const prevDays = new Date(year, month0, 0).getDate();
  for (let i = firstDow - 1; i >= 0; i -= 1) {
    const d = prevDays - i;
    const m = month0 - 1;
    const y = m < 0 ? year - 1 : year;
    cells.push({ iso: toIso(y, (m + 12) % 12, d), day: d, inMonth: false });
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push({ iso: toIso(year, month0, d), day: d, inMonth: true });
  }
  // Trailing to fill 6 rows (42 cells)
  let next = 1;
  while (cells.length < 42) {
    const m = month0 + 1;
    const y = m > 11 ? year + 1 : year;
    cells.push({ iso: toIso(y, m % 12, next), day: next, inMonth: false });
    next += 1;
  }
  return cells;
};
