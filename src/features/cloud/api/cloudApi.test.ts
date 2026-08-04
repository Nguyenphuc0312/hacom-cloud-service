import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAccessToken } from "../../../services/tokenService";
import { refreshAccessTokenShared } from "../../../services/authRefreshCoordinator";
import { cloudApi, CloudApiError } from "./cloudApi";

vi.mock("../../../services/tokenService", () => ({
  getAccessToken: vi.fn(),
}));

vi.mock("../../../services/authRefreshCoordinator", () => ({
  refreshAccessTokenShared: vi.fn(),
}));

const userId = "11111111-1111-4111-8111-111111111111";

const jsonResponse = (
  payload: unknown,
  init: ResponseInit = {},
): Response =>
  new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

describe("cloudApi", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv("VITE_CLOUD_DEMO_MODE", "true");
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(getAccessToken).mockReturnValue(null);
    vi.mocked(refreshAccessTokenShared).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("sends the local user contract and exact text payload", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "item-1",
        type: "text",
        status: "ready",
        content: "B?o c?o",
        sizeBytes: 7,
        createdAt: "2026-07-30T08:00:00Z",
        updatedAt: "2026-07-30T08:00:00Z",
      }),
    );

    await cloudApi.createText(userId, "B?o c?o");

    expect(fetchMock).toHaveBeenCalledWith(
      "/cloud-api/api/v1/cloud/texts",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ content: "B?o c?o" }),
      }),
    );
    const requestHeaders = fetchMock.mock.calls[0]?.[1]?.headers;
    expect(requestHeaders).toBeInstanceOf(Headers);
    expect((requestHeaders as Headers).get("Content-Type")).toBe("application/json");
    expect((requestHeaders as Headers).get("Accept")).toBe("application/json");
    expect((requestHeaders as Headers).get("X-Demo-User-ID")).toBe(userId);
  });

  it("keeps cursors opaque when requesting the next page", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ items: [], nextCursor: "opaque+cursor/value==" }),
    );

    await cloudApi.listItems(userId, {
      cursor: "opaque+cursor/value==",
      limit: 30,
    });

    const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestedUrl).toContain("limit=30");
    expect(requestedUrl).toContain("cursor=opaque%2Bcursor%2Fvalue%3D%3D");
  });

  it("preserves backend error codes and request IDs", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            code: "QUOTA_EXCEEDED",
            message: "quota reservation exceeds available bytes",
          },
        },
        {
          status: 409,
          headers: { "X-Request-ID": "request-123" },
        },
      ),
    );

    const error = await cloudApi
      .createLink(userId, "https://hacom.vn", "Hacom")
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(CloudApiError);
    expect(error).toMatchObject({
      status: 409,
      code: "QUOTA_EXCEEDED",
      requestId: "request-123",
    });
  });

  it("sends the auth-store bearer token without the demo header in production mode", async () => {
    vi.stubEnv("VITE_CLOUD_DEMO_MODE", "false");
    vi.mocked(getAccessToken).mockReturnValue("access-token");
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [], nextCursor: null }));

    await cloudApi.listItems(userId);

    const requestHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(requestHeaders.get("Authorization")).toBe("Bearer access-token");
    expect(requestHeaders.get("X-Demo-User-ID")).toBeNull();
  });

  it("refreshes once after an expired token and retries with the refreshed token", async () => {
    vi.stubEnv("VITE_CLOUD_DEMO_MODE", "false");
    vi.mocked(getAccessToken).mockReturnValue("expired-token");
    vi.mocked(refreshAccessTokenShared).mockResolvedValue("fresh-token");
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { code: "TOKEN_EXPIRED" } }, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ items: [], nextCursor: null }));

    await cloudApi.listItems(userId);

    expect(refreshAccessTokenShared).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      (fetchMock.mock.calls[1]?.[1]?.headers as Headers).get("Authorization"),
    ).toBe("Bearer fresh-token");
  });

  it("does not loop when a revoked session remains forbidden after one retry", async () => {
    vi.stubEnv("VITE_CLOUD_DEMO_MODE", "false");
    vi.mocked(getAccessToken).mockReturnValue("revoked-token");
    vi.mocked(refreshAccessTokenShared).mockResolvedValue("still-revoked-token");
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { code: "SESSION_REVOKED" } }, { status: 403 }))
      .mockResolvedValueOnce(jsonResponse({ error: { code: "SESSION_REVOKED" } }, { status: 403 }));

    const error = await cloudApi.listItems(userId).catch((reason: unknown) => reason);

    expect(error).toMatchObject({ status: 403, code: "SESSION_REVOKED" });
    expect(refreshAccessTokenShared).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
