import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

interface ChatSliceState {
  activeConversationId: string | null;
  selectedMessageId: string | null;
  draftByConversationId: Record<string, string>;
}

const initialState: ChatSliceState = {
  activeConversationId: null,
  selectedMessageId: null,
  draftByConversationId: {},
};

export const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    setActiveConversationId: (state, action: PayloadAction<string | null>) => {
      state.activeConversationId = action.payload;
    },
    setSelectedMessageId: (state, action: PayloadAction<string | null>) => {
      state.selectedMessageId = action.payload;
    },
    setDraft: (
      state,
      action: PayloadAction<{ conversationId: string; value: string }>,
    ) => {
      state.draftByConversationId[action.payload.conversationId] =
        action.payload.value;
    },
    clearDraft: (state, action: PayloadAction<string>) => {
      delete state.draftByConversationId[action.payload];
    },
  },
});

export const chatActions = chatSlice.actions;
export const chatReducer = chatSlice.reducer;

