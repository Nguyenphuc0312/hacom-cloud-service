import type {
  CreateQrLoginSessionResponseDto,
  LoginResponse,
  QrLoginSessionStatusResponseDto,
} from "@hacom/chat-shared-types/auth";
import type { ApiResponse } from "@hacom/chat-shared-types/core";
import { authClient } from "../lib/axios";
import { unwrapApiSuccess } from "../lib/apiContract";
import { AUTH_ENDPOINTS } from "../lib/authEndpoints";

const WEB_SECRET_HEADER = "X-QR-Web-Secret";

// All routes are relative and resolved by authClient against AUTH_BASE_URL
// (canonical /api/v1/auth).
export const qrLoginService = {
  async createSession(): Promise<CreateQrLoginSessionResponseDto> {
    const response = await authClient.post<
      ApiResponse<CreateQrLoginSessionResponseDto>
    >(AUTH_ENDPOINTS.qrLoginCreateSession);
    return unwrapApiSuccess(response.data);
  },

  async getStatus(
    sessionId: string,
    webSecret: string,
  ): Promise<QrLoginSessionStatusResponseDto> {
    const response = await authClient.get<
      ApiResponse<QrLoginSessionStatusResponseDto>
    >(AUTH_ENDPOINTS.qrLoginSessionStatus(sessionId), {
      headers: {
        [WEB_SECRET_HEADER]: webSecret,
      },
    });
    return unwrapApiSuccess(response.data);
  },

  async exchange(sessionId: string, webSecret: string): Promise<LoginResponse> {
    const response = await authClient.post<ApiResponse<LoginResponse>>(
      AUTH_ENDPOINTS.qrLoginSessionExchange(sessionId),
      undefined,
      {
        headers: {
          [WEB_SECRET_HEADER]: webSecret,
        },
      },
    );
    return unwrapApiSuccess(response.data);
  },
};

export default qrLoginService;
