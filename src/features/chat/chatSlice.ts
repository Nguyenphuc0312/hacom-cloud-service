import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { SidebarConversationFilter } from "./state/chatSidebarStore";

interface ChatSliceState {
  activeConversationId: string | null;
  selectedMessageId: string | null;
  sidebarFilter: SidebarConversationFilter;
  sidebarSearchQuery: string;
  draftByConversationId: Record<string, string>;
}

const initialState: ChatSliceState = {
  activeConversationId: null,
  selectedMessageId: null,
  sidebarFilter: "all",
  sidebarSearchQuery: "",
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
    setSidebarFilter: (
      state,
      action: PayloadAction<SidebarConversationFilter>,
    ) => {
      state.sidebarFilter = action.payload;
    },
    setSidebarSearchQuery: (state, action: PayloadAction<string>) => {
      state.sidebarSearchQuery = action.payload;
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

