import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listPersonalDocuments, selectPersonalSources } from "./personalAiApi";

vi.mock("../../../services/tokenService", () => ({
  getAccessToken: () => "test-token",
}));

const fetchMock = vi.fn();

describe("personalAiApi document identity contract", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes list documents to backend document_id even when id is a frontend UUID", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          documents: [
            {
              id: "a1b0e94a-528b-4213-bfdb-7ad9710e4c08",
              document_id: "personal-HC888890-c30d71d620f8",
              name: "BAO_CAO_HIEU_NANG_SERVER_AI.docx",
              status: "indexed",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const docs = await listPersonalDocuments({
      employeeCode: "HC888890",
      sessionId: "personal-HC888890-session",
    });

    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      id: "personal-HC888890-c30d71d620f8",
      document_id: "personal-HC888890-c30d71d620f8",
      name: "BAO_CAO_HIEU_NANG_SERVER_AI.docx",
    });
  });

  it("posts backend document_ids to the source endpoint", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await selectPersonalSources(["personal-HC888890-c30d71d620f8"], {
      employeeCode: "HC888890",
      sessionId: "personal-HC888890-session",
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init.body))).toEqual({
      document_ids: ["personal-HC888890-c30d71d620f8"],
      employee_code: "HC888890",
      session_id: "personal-HC888890-session",
    });
  });
});