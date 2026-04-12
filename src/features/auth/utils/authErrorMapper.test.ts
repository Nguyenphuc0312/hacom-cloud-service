import { describe, expect, it } from "vitest";
import { ErrorCode } from "@hacom/chat-shared-types";
import { resolveAuthFailure } from "./authErrorMapper";

const createAxiosApiFailure = (
  code: string,
  message: string,
  details?: Record<string, unknown>,
): unknown => ({
  isAxiosError: true,
  response: {
    data: {
      success: false,
      statusCode: 400,
      message,
      error: {
        code,
        details,
      },
    },
  },
});

describe("resolveAuthFailure", () => {
  it("maps activation required payload into activation context", () => {
    const result = resolveAuthFailure(
      createAxiosApiFailure(
        ErrorCode.ACCOUNT_ACTIVATION_REQUIRED,
        "Activation required",
        {
          activationTicket: "ticket-123",
          maskedEmail: "u***@company.test",
          resendAvailableAt: "2026-04-12T10:00:00.000Z",
          nextAction: "VERIFY_OTP",
        },
      ),
    );

    expect(result.kind).toBe("activation_required");
    expect(result.activationContext).toEqual({
      activationTicket: "ticket-123",
      maskedEmail: "u***@company.test",
      nextAction: "VERIFY_OTP",
      requiresPasswordSetup: false,
      resendAvailableAt: "2026-04-12T10:00:00.000Z",
    });
  });

  it("distinguishes disabled accounts from locked accounts", () => {
    const disabled = resolveAuthFailure(
      createAxiosApiFailure(ErrorCode.ACCOUNT_DISABLED, "Disabled"),
    );
    const locked = resolveAuthFailure(
      createAxiosApiFailure(ErrorCode.AUTH_ACCOUNT_LOCKED, "Locked"),
    );

    expect(disabled.kind).toBe("disabled");
    expect(locked.kind).toBe("locked");
  });
});
