import { beforeEach, describe, expect, it, vi } from "vitest";

const { postMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
}));

vi.mock("../../../lib/axios", () => ({
  authClient: {
    post: postMock,
  },
}));

import {
  activationAuthApi,
  normalizeActivationVerifyPayload,
  normalizeActivationVerifyResult,
} from "./authApi";

describe("authApi contract normalization", () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  it("normalizes activation verify payload to backend one-step contract", () => {
    expect(
      normalizeActivationVerifyPayload({
        activationTicket: "ticket-1",
        otp: "123456",
        password: "Secret123!",
      }),
    ).toEqual({
      activationTicket: "ticket-1",
      otp: "123456",
      newPassword: "Secret123!",
    });
  });

  it("normalizes activation request response fields", async () => {
    postMock.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          accepted: true,
          masked_email: "u***@company.test",
          resend_available_at: "2026-04-12T10:05:00.000Z",
        },
      },
    });

    await expect(
      activationAuthApi.requestOtp({ activationTicket: "ticket-1" }),
    ).resolves.toEqual({
      accepted: true,
      sent: true,
      maskedEmail: "u***@company.test",
      resendAvailableAt: "2026-04-12T10:05:00.000Z",
      nextAction: "VERIFY_OTP",
    });
  });

  it("normalizes activation verify response into authenticated payload", () => {
    expect(
      normalizeActivationVerifyResult({
        accessToken: "access-1",
        refreshToken: "refresh-1",
        user: {
          id: "user-1",
          username: "",
          email: "user@company.test",
        },
      }),
    ).toEqual({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      tokens: {
        accessToken: "access-1",
        refreshToken: "refresh-1",
      },
      nextAction: "VERIFY_OTP",
      requiresPasswordSetup: false,
      user: {
        id: "user-1",
        username: "user@company.test",
        email: "user@company.test",
      },
      verificationProof: null,
    });
  });
});
