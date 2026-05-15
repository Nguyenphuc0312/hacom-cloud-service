import { ErrorCode, type ApiResponse } from "@hacom/chat-shared-types/core";
import { chatApi } from "../api/chatApi";
import { apiPerfLogger } from "../../../utils/apiPerfLogger";
import type { Conversation } from "../../../types";

/**
 * Phase 2: Request deduplication for conversation detail fetching.
 * Prevents concurrent API calls for the same conversation.
 */
const inFlightRequests = new Map<string, Promise<ApiResponse<Conversation>>>();

export const getConversationByIdUseCase = async (
  conversationId: string,
): Promise<ApiResponse<Conversation>> => {
  // Phase 2: Check for in-flight request
  const existingRequest = inFlightRequests.get(conversationId);
  if (existingRequest) {
    apiPerfLogger.logDedupeBlocked("getConversationById", conversationId, "in-flight");
    return existingRequest;
  }

  // Start new request
  const requestPromise = (async () => {
    const result = await chatApi.conversation.getConversationById(conversationId);
    // Convert RTK Query result to ApiResponse format for backward compatibility
    if ("data" in result) {
      return {
        success: true,
        data: result.data,
        statusCode: 200,
        message: "success",
      } satisfies ApiResponse<Conversation>;
    }
    // Handle error case
    const error = result.error;
    const errorObj = error as { name?: string; status?: number; message?: string };
    return {
      success: false,
      error: {
        code: (errorObj.name as ErrorCode) || ErrorCode.INTERNAL_ERROR,
        details: error as unknown as Record<string, unknown>,
      },
      statusCode: errorObj.status || 500,
      message: errorObj.message || "Failed to fetch conversation",
    } satisfies ApiResponse<Conversation>;
  })();

  requestPromise.finally(() => {
    // Clean up after request completes
    inFlightRequests.delete(conversationId);
  });

  inFlightRequests.set(conversationId, requestPromise);
  return requestPromise;
};
