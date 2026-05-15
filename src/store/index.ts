import { configureStore } from "@reduxjs/toolkit";
import { chatApi } from "../features/api/chatApi";
import { chatReducer } from "../features/chat/chatSlice";
import { realtimeMiddleware } from "../features/realtime/realtimeMiddleware";
import { realtimeReducer } from "../features/realtime/realtimeSlice";
import { rtkQueryMetricsMiddleware } from "../features/api/rtkQueryMetricsMiddleware";

export const store = configureStore({
  reducer: {
    [chatApi.reducerPath]: chatApi.reducer,
    chat: chatReducer,
    realtime: realtimeReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(
      chatApi.middleware,
      realtimeMiddleware,
      rtkQueryMetricsMiddleware,
    ),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

