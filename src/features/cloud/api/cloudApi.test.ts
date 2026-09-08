import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAccessToken } from "../../../services/tokenService";
import { refreshAccessTokenShared } from "../../../services/authRefreshCoordinator";
import { cloudApi, CloudApiError, resolveCloudObjectUrl } from "./cloudApi";

vi.mock("../../../services/tokenService", () => ({
  getAccessToken: vi.fn(),
}));

vi.mock("../../../services/authRefreshCoordinator", () => ({
  refreshAccessTokenShared: vi.fn(),
}));

const userId = "11111111-1111-4111-8111-111111111111";

const jsonResponse = (payload: unknown, init: ResponseInit = {}): Response =>
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

  it("routes Docker-facing MinIO URLs through the local object proxy", () => {
    expect(
      resolveCloudObjectUrl(
        "http://host.docker.internal:9000/bucket/image.png?X-Amz-Signature=abc",
      ),
    ).toBe(
      `${window.location.origin}/cloud-object/bucket/image.png?X-Amz-Signature=abc`,
    );
    expect(
      resolveCloudObjectUrl("https://objects.example.com/bucket/image.png"),
    ).toBe("https://objects.example.com/bucket/image.png");
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
    expect((requestHeaders as Headers).get("Content-Type")).toBe(
      "application/json",
    );
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
      q: "quarterly report",
      type: "file",
    });

    const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestedUrl).toContain("limit=30");
    expect(requestedUrl).toContain("cursor=opaque%2Bcursor%2Fvalue%3D%3D");
    expect(requestedUrl).toContain("q=quarterly+report");
    expect(requestedUrl).toContain("type=file");
  });

  it("omits the default newest sort for legacy Cloud API compatibility", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [] }));

    await cloudApi.listItems(userId, { limit: 50 });

    const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestedUrl).toBe("/cloud-api/api/v1/cloud/items?limit=50");
    expect(requestedUrl).not.toContain("sort=");
    expect(requestedUrl).not.toContain("order=");
  });

  it("serializes management filters without leaking them into the path", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [] }));

    await cloudApi.listItems(userId, {
      limit: 50,
      q: "invoice",
      type: "file",
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-31T23:59:59.999Z",
      minSizeBytes: 1_000_000,
      maxSizeBytes: 9_999_999,
      sort: "size_bytes",
      order: "desc",
    });

    const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestedUrl).toContain("limit=50");
    expect(requestedUrl).toContain("q=invoice");
    expect(requestedUrl).toContain("type=file");
    expect(requestedUrl).toContain("from=2026-08-01T00%3A00%3A00.000Z");
    expect(requestedUrl).toContain("to=2026-08-31T23%3A59%3A59.999Z");
    expect(requestedUrl).toContain("min_size_bytes=1000000");
    expect(requestedUrl).toContain("max_size_bytes=9999999");
    expect(requestedUrl).toContain("sort=size_bytes");
    expect(requestedUrl).toContain("order=desc");
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

  it("classifies an empty unauthorized response for the UI", async () => {
    vi.stubEnv("VITE_CLOUD_DEMO_MODE", "false");
    vi.mocked(refreshAccessTokenShared).mockRejectedValue(new Error("expired"));
    fetchMock.mockResolvedValueOnce(new Response("", { status: 401 }));

    const error = await cloudApi
      .listItems(userId)
      .catch((reason: unknown) => reason);

    expect(error).toMatchObject({
      status: 401,
      code: "CLOUD_AUTH_REQUIRED",
    });
  });

  it("sends the auth-store bearer token without the demo header in production mode", async () => {
    vi.stubEnv("VITE_CLOUD_DEMO_MODE", "false");
    vi.mocked(getAccessToken).mockReturnValue("access-token");
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ items: [], nextCursor: null }),
    );

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
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: "TOKEN_EXPIRED" } }, { status: 401 }),
      )
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
    vi.mocked(refreshAccessTokenShared).mockResolvedValue(
      "still-revoked-token",
    );
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: "SESSION_REVOKED" } }, { status: 403 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: "SESSION_REVOKED" } }, { status: 403 }),
      );

    const error = await cloudApi
      .listItems(userId)
      .catch((reason: unknown) => reason);

    expect(error).toMatchObject({ status: 403, code: "SESSION_REVOKED" });
    expect(refreshAccessTokenShared).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses the trash lifecycle endpoints without request bodies", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ items: [], nextCursor: "trash-cursor" }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "item-1",
          type: "text",
          status: "trashed",
          sizeBytes: 5,
          deletedAt: "2026-07-31T03:00:00Z",
          purgeAfter: "2026-08-01T03:00:00Z",
          createdAt: "2026-07-31T02:00:00Z",
          updatedAt: "2026-07-31T03:00:00Z",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ itemId: "item-1", status: "deleting" }, { status: 202 }),
      );

    await cloudApi.listTrash(userId, { cursor: "trash/cursor" });
    await cloudApi.trashItem(userId, "item-1");
    await cloudApi.permanentlyDeleteItem(userId, "item-1");

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "trash?limit=30&cursor=trash%2Fcursor",
    );
    expect(fetchMock.mock.calls[1]).toEqual([
      "/cloud-api/api/v1/cloud/items/item-1/trash",
      expect.objectContaining({ method: "POST" }),
    ]);
    expect(fetchMock.mock.calls[2]).toEqual([
      "/cloud-api/api/v1/cloud/items/item-1",
      expect.objectContaining({ method: "DELETE" }),
    ]);
    for (const callIndex of [1, 2]) {
      const headers = fetchMock.mock.calls[callIndex]?.[1]?.headers as Headers;
      expect(headers.get("Idempotency-Key")).toMatch(/^cloud-web-/);
    }
  });

  it("submits an integer quota tier with an idempotency key", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          id: "quota-request-1",
          status: "pending",
          currentQuotaBytes: 5_000_000_000,
          requestedQuotaBytes: 10_000_000_000,
          createdAt: "2026-08-05T00:00:00Z",
          updatedAt: "2026-08-05T00:00:00Z",
          applied: true,
        },
        { status: 201 },
      ),
    );

    await cloudApi.requestQuota(userId, 10_000_000_000, "Project archive");

    const options = fetchMock.mock.calls[0]?.[1];
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/cloud-api/api/v1/cloud/quota/requests",
    );
    expect(options).toEqual(
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          requestedQuotaBytes: 10_000_000_000,
          reason: "Project archive",
        }),
      }),
    );
    expect((options?.headers as Headers).get("Idempotency-Key")).toMatch(
      /^cloud-web-/,
    );
  });
});
