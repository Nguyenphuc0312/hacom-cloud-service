import type {
  ApiResponse,
  CreateQrLoginSessionResponseDto,
  LoginResponse,
  QrLoginSessionStatusResponseDto,
} from "@hacom/chat-shared-types";
import { authClient } from "../lib/axios";
import { unwrapApiSuccess } from "../lib/apiContract";

const WEB_SECRET_HEADER = "X-QR-Web-Secret";

export const qrLoginService = {
  async createSession(): Promise<CreateQrLoginSessionResponseDto> {
    const response = await authClient.post<
      ApiResponse<CreateQrLoginSessionResponseDto>
    >("/auth/qr-login/sessions");
    return unwrapApiSuccess(response.data);
  },

  async getStatus(
    sessionId: string,
    webSecret: string,
  ): Promise<QrLoginSessionStatusResponseDto> {
    const response = await authClient.get<
      ApiResponse<QrLoginSessionStatusResponseDto>
    >(`/auth/qr-login/sessions/${sessionId}/status`, {
      headers: {
        [WEB_SECRET_HEADER]: webSecret,
      },
    });
    return unwrapApiSuccess(response.data);
  },

  async exchange(sessionId: string, webSecret: string): Promise<LoginResponse> {
    const response = await authClient.post<ApiResponse<LoginResponse>>(
      `/auth/qr-login/sessions/${sessionId}/exchange`,
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
