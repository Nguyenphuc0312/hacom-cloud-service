import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { TypingStatus } from "../../types";

export type RealtimeConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

interface RealtimeState {
  connectionStatus: RealtimeConnectionStatus;
  typingByConversationId: Record<string, Record<string, TypingStatus>>;
}

const initialState: RealtimeState = {
  connectionStatus: "idle",
  typingByConversationId: {},
};

export const realtimeSlice = createSlice({
  name: "realtime",
  initialState,
  reducers: {
    setConnectionStatus: (
      state,
      action: PayloadAction<RealtimeConnectionStatus>,
    ) => {
      state.connectionStatus = action.payload;
    },
    typingStarted: (state, action: PayloadAction<TypingStatus>) => {
      const current =
        state.typingByConversationId[action.payload.conversationId] ?? {};
      current[action.payload.userId] = {
        ...action.payload,
        isTyping: true,
        lastEventAt: action.payload.lastEventAt ?? Date.now(),
      };
      state.typingByConversationId[action.payload.conversationId] = current;
    },
    typingStopped: (
      state,
      action: PayloadAction<{ conversationId: string; userId: string }>,
    ) => {
      const current = state.typingByConversationId[action.payload.conversationId];
      if (!current) return;
      delete current[action.payload.userId];
      if (Object.keys(current).length === 0) {
        delete state.typingByConversationId[action.payload.conversationId];
      }
    },
    clearConversationTyping: (state, action: PayloadAction<string>) => {
      delete state.typingByConversationId[action.payload];
    },
  },
});

export const realtimeActions = realtimeSlice.actions;
export const realtimeReducer = realtimeSlice.reducer;

