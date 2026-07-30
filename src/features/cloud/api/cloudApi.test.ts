import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cloudApi, CloudApiError } from "./cloudApi";

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
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("sends the local user contract and exact text payload", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "item-1",
        type: "text",
        status: "ready",
        content: "Báo cáo",
        sizeBytes: 7,
        createdAt: "2026-07-30T08:00:00Z",
        updatedAt: "2026-07-30T08:00:00Z",
      }),
    );

    await cloudApi.createText(userId, "Báo cáo");

    expect(fetchMock).toHaveBeenCalledWith(
      "/cloud-api/api/v1/cloud/texts",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ content: "Báo cáo" }),
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Demo-User-ID": userId,
        }),
      }),
    );
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
});
