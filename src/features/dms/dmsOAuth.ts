import { DMS_OAUTH_ISSUER_URL } from "../../config";

const TOKEN_KEY = "hacom.dms.access-token";
const STATE_KEY = "hacom.dms.oauth-state";
const VERIFIER_KEY = "hacom.dms.oauth-verifier";
const REDIRECT_KEY = "hacom.dms.oauth-redirect";

const base64Url = (value: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(value)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const randomValue = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes.buffer);
};

const redirectUri = (): string => `${window.location.origin}${window.location.pathname}`;

const tokenExpiry = (token: string): number => {
  try {
    const payload = token.split(".")[1];
    if (!payload) return 0;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(normalized)) as { exp?: unknown };
    return typeof decoded.exp === "number" ? decoded.exp * 1000 : 0;
  } catch {
    return 0;
  }
};

export const getDmsAccessToken = (): string | null => {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token || tokenExpiry(token) <= Date.now() + 30_000) {
    sessionStorage.removeItem(TOKEN_KEY);
    return null;
  }
  return token;
};

export const clearDmsAccessToken = (): void => sessionStorage.removeItem(TOKEN_KEY);

export const beginDmsAuthorization = async (): Promise<void> => {
  const state = randomValue();
  const verifier = randomValue();
  const challenge = base64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const callback = redirectUri();
  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(REDIRECT_KEY, callback);
  const authorize = new URL(`${DMS_OAUTH_ISSUER_URL}/authorize`);
  Object.entries({
    response_type: "code",
    client_id: "dms-web",
    redirect_uri: callback,
    scope: "openid profile email",
    resource: "dms-api",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    nonce: randomValue(),
  }).forEach(([key, value]) => authorize.searchParams.set(key, value));
  window.location.assign(authorize.toString());
};

let callbackExchange: Promise<boolean> | null = null;

// React may mount effects twice; an authorization code must be redeemed once.
export const completeDmsAuthorization = (): Promise<boolean> => {
  if (!callbackExchange) {
    callbackExchange = exchangeDmsAuthorization().finally(() => {
      callbackExchange = null;
    });
  }
  return callbackExchange;
};

const exchangeDmsAuthorization = async (): Promise<boolean> => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  if (!code && !params.get("error")) return false;
  const expectedState = sessionStorage.getItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  const callback = sessionStorage.getItem(REDIRECT_KEY);
  try {
    if (params.get("error")) throw new Error(params.get("error") ?? "oauth_error");
    if (!code || !state || state !== expectedState || !verifier || !callback) {
      throw new Error("DMS_OAUTH_CALLBACK_INVALID");
    }
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: "dms-web",
      redirect_uri: callback,
      code_verifier: verifier,
    });
    const response = await fetch(`${DMS_OAUTH_ISSUER_URL}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const payload = await response.json() as { access_token?: unknown };
    if (!response.ok || typeof payload.access_token !== "string") {
      throw new Error("DMS_OAUTH_EXCHANGE_FAILED");
    }
    sessionStorage.setItem(TOKEN_KEY, payload.access_token);
    return true;
  } finally {
    sessionStorage.removeItem(STATE_KEY);
    sessionStorage.removeItem(VERIFIER_KEY);
    sessionStorage.removeItem(REDIRECT_KEY);
    params.delete("code");
    params.delete("state");
    params.delete("error");
    params.delete("error_description");
    const query = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }
};
