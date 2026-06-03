import { AI_CHAT_BASE_URL as BASE_URL } from "../../../services/ai-chat/constants";
import { fetchWithAuth } from "../../../services/ai-chat/fetchWithAuth";
import { getAccessToken } from "../../../services/tokenService";

const REMINDER_URL = `${BASE_URL}/api/chat/personal/reminder`;

export interface ReminderCheckResponse {
  pending: boolean;
  unread_count: number;
  message?: string;
  date?: string;
  items?: { key: string; time: string; message: string }[];
}

export interface ReminderActivateResponse {
  ok: boolean;
  created: boolean;
  message?: string;
}

function buildReminderHeaders(employeeCode?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (employeeCode) {
    headers["X-Employee-Code"] = employeeCode;
  }
  return headers;
}

/**
 * The reminder backend keys on a real personal-AI session id. The literal
 * "default" (and empty/nullish values) are NOT valid sessions — calling the
 * endpoint with them produces a noisy, meaningless request (historically a red
 * `reminder?session_id=default` 4xx). We refuse to send those client-side so an
 * optional widget never pressures the auth layer.
 */
export function isCallableReminderSession(
  sessionId: string | null | undefined,
): sessionId is string {
  if (typeof sessionId !== "string") return false;
  const normalized = sessionId.trim();
  return normalized.length > 0 && normalized.toLowerCase() !== "default";
}

export async function checkPersonalReminder(
  sessionId: string,
  employeeCode?: string,
): Promise<ReminderCheckResponse> {
  const token = getAccessToken();
  if (!token) return { pending: false, unread_count: 0, items: [] };

  // Skip placeholder/empty sessions entirely — never hit the network with them.
  if (!isCallableReminderSession(sessionId)) {
    return { pending: false, unread_count: 0, items: [] };
  }

  const params = new URLSearchParams({ session_id: sessionId });
  const response = await fetchWithAuth(
    `${REMINDER_URL}?${params.toString()}`,
    { headers: buildReminderHeaders(employeeCode) },
  );
  if (!response.ok) {
    throw new Error(`Reminder check failed: ${response.status}`);
  }
  return response.json() as Promise<ReminderCheckResponse>;
}

export async function activatePersonalReminder(
  sessionId: string,
  employeeCode?: string,
): Promise<ReminderActivateResponse> {
  // Guard against placeholder/empty sessions — these are business-invalid, not
  // an auth failure, so we short-circuit rather than calling the API.
  if (!isCallableReminderSession(sessionId)) {
    return { ok: false, created: false };
  }

  const response = await fetchWithAuth(
    `${REMINDER_URL}/activate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildReminderHeaders(employeeCode),
      },
      body: JSON.stringify({ session_id: sessionId }),
    },
  );
  if (!response.ok) {
    throw new Error(`Reminder activate failed: ${response.status}`);
  }
  return response.json() as Promise<ReminderActivateResponse>;
}
