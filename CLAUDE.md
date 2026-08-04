# CLAUDE.md — chat-web-client

Web client cho hệ thống chat nội bộ HACOM (giống Telegram/Zalo). File này mô tả chi tiết kiến trúc để AI hiểu context mà **không cần đọc lại toàn bộ source**. Đọc file này trước; chỉ mở file cụ thể khi cần sửa.

> Khi sửa code mà phát hiện file này sai/lỗi thời, hãy cập nhật lại nó.

### Hệ tài liệu (đọc đúng file theo việc)
- **`CLAUDE.md`** (file này) — kiến trúc FE web client + bảng màu UI (mục 14).
- **`AGENTS.md`** — hướng dẫn cho AI agents (tools, workflow).
- **`IMPECCABLE.md`** — hướng dẫn dùng skill `/impeccable` để thiết kế/cải thiện UI (app UI, components).
- **`DESIGN_TASTE.md`** — hướng dẫn dùng skill `/design-taste-frontend` (landing page, portfolio, redesign marketing).
- **`PONYTAIL.md`** — hướng dẫn bộ skill ponytail (`/ponytail`, `/ponytail-review`, `/ponytail-audit`, `/ponytail-debt`…).
- **`docs/CALENDAR_SPEC.md`** — đặc tả sản phẩm Day/Week View kiểu Teams (hiện trạng vs mục tiêu, gap, lộ trình). Đọc khi làm/đổi Day-Week View.
- **`docs/CHAT_UI_SPEC.md`** — đặc tả UI chat (message layout, timeline, components). Đọc khi sửa UI chat.
- **`d:\HacomCTY\chat-api-service\docs\requests\`** — 🔴 **KÊNH GIAO TIẾP CHUẨN (source of truth) FE↔BE↔API↔shared-types.** Mọi đề xuất đổi contract / yêu cầu thêm field / nghiệm thu **xuyên repo** phải có 1 file ở đây — không trao đổi miệng/chat trôi nổi. Xem mục 15.

---

## 1. Stack & tooling

- **React 19** + **TypeScript 5.9** + **Vite 7** (ESM, `import.meta.env`)
- **State**: Redux Toolkit + RTK Query **VÀ** Zustand cùng tồn tại — xem mục 4 (rất quan trọng)
- **Routing**: React Router v7 (route-object + `createBrowserRouter`, lazy pages)
- **Styling**: Tailwind CSS v3 + theme tokens động (CSS variables)
- **Editor**: Tiptap v3 (rich text trong MessageInput)
- **Realtime**: WebSocket thuần (native `WebSocket`, không socket.io) qua `src/lib/socket.ts`
- **Animation**: Framer Motion
- **i18n**: i18next (vi mặc định, en) — lazy load JSON theo namespace
- **Forms**: react-hook-form + zod (`@hookform/resolvers`)
- **HTTP**: axios (nhiều instance, có refresh-token interceptor)
- **Shared types**: `@hacom/chat-shared-types` (local package tại `../chat-shared-types`) — types dùng chung với backend (auth, chat, core, runtime)
- **Tests**: Vitest (unit) + Playwright (e2e + performance)

### Dev commands
```bash
npm run dev          # vite dev server
npm run build        # tsc -b && vite build
npm run typecheck    # tsc -b (chỉ type-check)
npm run lint         # eslint
npm test             # vitest run (loại trừ *.bench)
npm run test:chat-runtime   # bộ test chat runtime trọng yếu
npm run test:e2e     # playwright
npm run i18n:check   # kiểm tra thiếu key dịch
npm run ci:readiness # typecheck + lint + build:gate + test + perf + static gate
```

---

## 2. Kiến trúc tổng quan & data flow

```
main.tsx
 └─ <Provider store> (Redux)
     └─ <ThemeProvider>
         └─ <ResponsiveProvider>
             └─ <App> → <RouterProvider router={appRouter}>
                 └─ RootLayout (ToastProvider, SettingsApplier, AppErrorBoundary, Suspense)
                     ├─ AuthLayout      → public routes (login, activation, verify…)
                     └─ ProtectedRoute → AppLayout = AuthenticatedLayout
                                          (GlobalWebSocketProvider + PersistentNavigationRail + <Outlet/>)
```

**Luồng tin nhắn (đọc):** HTTP `messageApi.getMessages` → RTK Query `getMessages` cache (`ConversationMessagesCache`) → component dùng hook `useConversationMessagesRTK`.

**Luồng realtime:** WebSocket event → `useWebSocket` + register handlers (`features/chat/realtime/register*Events.ts`) → dispatch Redux action (`realtimeMessageReceived`,…) → `realtimeMiddleware` patch trực tiếp vào RTK Query cache qua `messageMerge.ts` helpers. Một số state (sidebar preview, typing) sync vào Zustand `chatStore`.

**Luồng gửi tin:** `useSendMessage` / `sendMessage` usecase → optimistic message vào cache → `messageApi.sendMessage` → ack thay thế optimistic bằng message thật (đối chiếu qua `clientMessageId`).
to
---

## 3. Cấu trúc thư mục

```
src/
├── main.tsx                 # entry; bootstrap theme, diagnostics, mount providers
├── App.tsx                  # chỉ render <RouterProvider>
│
├── router/
│   ├── router.tsx           # routeTree + createBrowserRouter (appRouter)
│   ├── paths.ts             # ROUTE_PATHS (single source of truth cho path)
│   ├── builders.tsx         # build RouteObject từ config (lazy + guards)
│   ├── config/
│   │   ├── publicRoutes.ts  # login, activation, verify-email, forgot/reset/force-change pw
│   │   └── privateRoutes.ts # chat, friends, tasks, calendar, ai-assistant, settings…
│   ├── guards/RouteGuards.tsx # ProtectedRoute, GuestRoute, ActivationRoute, ForceChangePasswordRoute
│   └── types.ts             # AppRouteConfig (guestOnly, activationOnly, roles…)
│
├── layouts/
│   ├── RootLayout.tsx          # providers toàn cục + Suspense + error boundary
│   ├── AuthLayout.tsx          # khung cho route public
│   ├── AppLayout.tsx           # = AuthenticatedLayout
│   └── AuthenticatedLayout.tsx # WS provider + nav rail + CommandPalette (Ctrl/Cmd+K)
│
├── store/                   # ===== REDUX =====
│   ├── index.ts             # configureStore: reducers {chatApi, chat, realtime} + middleware
│   └── hooks.ts             # useAppDispatch, useAppSelector (typed)
│
├── stores/                  # ===== ZUSTAND ===== (lưu ý: store"s" số nhiều)
│   ├── authStore.ts         # auth/session (persist localStorage "auth-storage")
│   ├── chatStore.ts         # conversations, messages mirror, drafts, unread, typing, outbox
│   ├── chatStoreOutbox.ts / chatStoreUnread.ts / chatStoreTyping.ts  # controllers tách nhỏ
│   ├── uiStore.ts           # theme/density/modal/toast state
│   ├── presenceStore.ts     # online/offline/away của user
│   ├── groupStore.ts        # invite links, join requests
│   ├── friendshipStore.ts   # bạn bè, lời mời kết bạn
│   └── storeResetRegistry.ts# đăng ký reset tất cả store khi logout
│
├── features/                # domain features (feature-sliced)
│   ├── api/
│   │   ├── chatApi.ts       # RTK Query API CHÍNH (xem mục 5)
│   │   ├── hrApi.ts         # axios client HR (chấm công + health) → HR_API_BASE_URL — KHÔNG phải RTK Query
│   │   ├── hrCalendarApi.ts # axios client lịch HR (events CRUD + participants) — xem APIcalendar.md
│   │   ├── hrProfileApi.ts  # axios client hồ sơ HR (GET /auth/me) — identity cho lịch
│   │   ├── hrNotificationApi.ts # axios client thông báo HR (mời/ phản hồi họp, polling)
│   │   └── rtkQueryMetricsMiddleware.ts
│   ├── auth/                # authApi, authState (AuthStatus state machine), authErrorMapper
│   ├── chat/                # feature lớn nhất — xem mục 7
│   ├── realtime/
│   │   ├── GlobalWebSocketProvider.tsx  # context bọc useWebSocket
│   │   ├── realtimeMiddleware.ts        # Redux middleware patch cache từ realtime actions
│   │   └── realtimeSlice.ts             # connectionStatus + typingByConversationId
│   ├── activation/          # luồng kích hoạt tài khoản (OTP + set password)
│   ├── ai-assistant/        # AI chat (zustand store riêng)
│   ├── tasks/               # quản lý task (axios riêng + realtime hook)
│   ├── calendar/            # lịch: CalendarPage gộp events HR + chấm công + task + ngày lễ tĩnh (calendarEvents). Lịch/HR đi qua hr-api-service — xem APIcalendar.md. `components/WeeklyCalendarWidget` = widget lịch tuần thu gọn cho màn NoChatSelected (tách khỏi EmptyState).
│   ├── friends/ friend-qr/  # bạn bè + QR add friend (shareCode)
│   ├── notification/        # notification store
│   └── profile/             # chỉnh sửa hồ sơ
│
├── components/              # UI dùng chung (xem mục 8)
│   ├── ui/                  # primitives: Button, Modal, Input, Toast, Spinner, Skeleton…
│   ├── chat/                # ChatHeader, MessageItem, message-layout, ReactionBar, thread…
│   ├── message/             # render từng loại message (Text/Image/Video/Voice/File/Sticker…)
│   ├── input/               # MessageInput (Tiptap), attachments, emoji, format toolbar
│   ├── layout/              # Sidebar, ChatWindow, CommandPalette, sidebar/*
│   ├── auth/ common/ error/ friends/ info/ modals/ preview/ settings/
│
├── hooks/                   # custom hooks toàn cục (xem mục 9)
├── services/               # HTTP clients & auth (api.ts, authService, tokenService, uploadClient…)
├── lib/                    # axios, socket, apiContract, conversationAdapter, validations, commandPalette
├── settings/               # hệ thống settings (store + sync + persistence + defaults)
├── theme/                  # ThemeProvider, runtimeTheme (CSS vars), useTheme
├── types/                  # types FE (index.ts: Message, Conversation, Attachment, enums)
├── utils/                  # helpers thuần (messageIdentity, uploadPolicy, formatTime, logger…)
├── constants/              # emojis, passwordPolicy
├── config/index.ts         # đọc env → API_BASE_URL, AUTH_BASE_URL, WEBSOCKET_URL, *_CONFIG
├── i18n/                   # i18next setup + dateFns locale
├── locales/{vi,en}/*.json  # bản dịch theo namespace
├── pages/                  # page components (ChatPage, LoginPage, errors/*…)
├── shared/layout/          # AppShell, PersistentNavigationRail, ModuleSidebar, MainHeader, icons
├── responsive/             # ResponsiveProvider + breakpoints
└── test/                   # test setup
```

---

## 4. State management — ĐỌC KỸ (dual-state)

App dùng **song song** Redux và Zustand. Không nhầm lẫn hai cái này:

### Redux (`src/store/`) — chủ yếu cho dữ liệu server & realtime
- `chatApi.reducer` (RTK Query): **cache message & conversation** từ server. Đây là **source of truth cho messages**.
- `chat` slice (`features/chat/chatSlice.ts`): `activeConversationId`, `selectedMessageId`, `sidebarFilter`, `sidebarSearchQuery`, `draftByConversationId`.
- `realtime` slice: `connectionStatus`, `typingByConversationId`.
- Middleware: `chatApi.middleware`, `realtimeMiddleware` (patch cache khi có realtime action), `rtkQueryMetricsMiddleware`.
- Hooks typed: `useAppSelector` / `useAppDispatch` từ `src/store/hooks.ts`.

### Zustand (`src/stores/`) — chủ yếu cho UI/session & state cục bộ
- `authStore`: toàn bộ session, login/logout/register/refresh, persist localStorage. Có **AuthStatus state machine** (`idle | loading | authenticated | anonymous | activation_required | locked | disabled | bootstrap_error`). Guards trong router đọc store này.
- `chatStore`: bản mirror của conversations + messages (dùng cho sidebar preview, outbox optimistic, typing, unread). **Lưu ý: messages tồn tại ở CẢ RTK cache lẫn chatStore** — RTK cache là chính cho timeline, chatStore phục vụ sidebar/outbox/legacy.
- `uiStore`, `presenceStore`, `groupStore`, `friendshipStore`, `notification/notificationStore`, `ai-assistant/aiAssistantStore`.
- Logout: `storeResetRegistry` chạy reset tất cả store đã đăng ký.

> Khi cần dữ liệu message để render timeline → dùng RTK Query hooks. Khi cần preview/sidebar/unread/typing → thường dùng Zustand `chatStore`.

---

## 5. RTK Query — `features/api/chatApi.ts` (`reducerPath: chatApi`)

Endpoints (build tại dòng ~354):
| Endpoint | Loại | Mô tả |
|----------|------|-------|
| `getConversations` | query | danh sách hội thoại |
| `getConversationById` | query | 1 hội thoại |
| `getMessages` | query | trả `ConversationMessagesCache` (cache chính của timeline) |
| `getMessageById` | query | 1 message |
| `sendMessage` | mutation | gửi (optimistic update) |
| `editMessage` | mutation | sửa |
| `deleteMessage` | mutation | xóa (mode FOR_ME / FOR_EVERYONE) |
| `addReaction` / `removeReaction` | mutation | thả/bỏ reaction |
| `markConversationRead` | mutation | đánh dấu đã đọc |
| `getUnreadSummary` | query | tổng unread |
| `searchMessages` | query | tìm message |
| `forwardMessages` | mutation | chuyển tiếp |
| `getConversationSidebarSummary` | query | tóm tắt cho panel info (counts media/file/link…) |
| `getConversationMedia` | query | media dùng chung (ảnh/video) — phân trang, lọc `type` |
| `getConversationFiles` | query | file dùng chung — phân trang, search `q` |
| `getConversationLinks` | query | link dùng chung — phân trang |

> 4 endpoint cuối phục vụ panel **Shared Resources** trong `components/info/GroupInfo` (xem `shared-resources/SharedResourcesPreview`). Types: `ConversationResourcesMediaItem/FileItem/LinkItem` export từ `chatApi.ts`.

- Dùng `fakeBaseQuery` — query thực gọi qua `services/api.ts` (`conversationApi`, `messageApi`, `conversationResourcesApi`), không dùng `fetchBaseQuery`.
- Logic merge/patch cache nằm ở `features/chat/domain/messageMerge.ts` (`upsertMessageInCache`, `patchMessageInCache`, `mergeIncomingMessagesPage`, `patchMessageReactionInCache`, `patchReadCursorInCache`, `removeMessageFromCache`…). Đây là module **trọng yếu** cho tính đúng của timeline.
- Error chuẩn hóa qua `ChatQueryError` + `extractApiError` (`lib/apiContract.ts`).

---

## 6. API layer & Auth

### Axios clients (`src/lib/axios.ts`)
- `apiClient` (default): baseURL `API_BASE_URL` (`/api/v1`), tự gắn Bearer cho endpoint tin cậy, interceptor 401 → refresh token → retry.
- `authClient`: cho endpoint auth public (login/register/refresh), không tự gắn Bearer.
- `authenticatedAuthClient`: endpoint auth cần Bearer (me, change-password).
- Refresh phối hợp tập trung qua `services/authRefreshCoordinator.ts` (`refreshAccessTokenShared`) — tránh refresh trùng.
- `setAuthFailureHandler` nối axios → `authStore.handleAuthFailure` (logout khi 401/403 thật sự; network/5xx KHÔNG xóa session).

### Services (`src/services/`)
- `api.ts`: gom tất cả REST call thật: `authApi, userApi, conversationApi, groupApi, messageApi, fileApi, contactApi, friendQrApi, friendshipApi, conversationResourcesApi` (media/file/link dùng chung). **Đây là nơi định nghĩa endpoint backend.**
- `tokenService.ts`: lưu/đọc access/refresh token (hỗ trợ cookie mode cho refresh token + CSRF), parse `mustChangePassword` từ JWT.
- `authService.ts`: cross-tab logout sync, client cleanup, redirect login.
- `uploadClient.ts`: upload file qua signed URL (reserve → PUT signed URL → complete).
- `notificationApi.ts`, `qrLoginService.ts`.

### Config (`src/config/index.ts`)
Đọc env Vite → `API_BASE_URL`, `AUTH_BASE_URL`, `HR_API_BASE_URL`, `WEBSOCKET_URL`, `FILE_BASE_URL`, `USE_AUTH_SERVICE` (flag tách auth-service), `APP_BASE_PATH`, và các nhóm `AUTH_CONFIG / PAGINATION_CONFIG / UPLOAD_CONFIG / WEBSOCKET_CONFIG / UI_CONFIG / VALIDATION_CONFIG`. `resolvePublicResourceUrl()` để chuẩn hóa URL ảnh/file an toàn.

---

## 7. Feature `chat` (lớn nhất) — `src/features/chat/`

- `domain/` — logic thuần: `messageMerge.ts` (patch RTK cache), `messageIdentity.ts`, `messageOrdering.ts`, `serializableMessage.ts` (chuẩn hóa Message trước khi vào Redux).
- `hooks/` — `useConversationMessagesRTK` (timeline từ RTK cache), `useSendMessage`, `useConversationTimelineRows`, `useConversationThreadRows`, `useMessageJumpTargetRTK`, `useSidebarConversationList/Summaries`, `useConversationSession/Validation`, `useChatUserSearch`.
- `usecases/` — 13 use case (1 file/việc, import trực tiếp không qua barrel): tạo nhóm/DM, role, invite link, join request, transfer ownership, ban/unban, share contact, send friend request, search users… (message/reaction đi thẳng qua RTK Query mutations, không qua usecase).
- `realtime/` — đăng ký handler WS theo nhóm sự kiện: `registerChatEvents`, `registerConversationEvents`, `registerGroupEvents`, `registerPresenceEvents`, `registerFriendshipEvents`, `registerConnectionEvents`, `registerSyncEvents`. `chatRealtimeAdapter` chuẩn hóa event, `realtimeEventKeys` dedupe, `resyncPolicy` phát hiện gap seq để resync.
- `state/` — zustand phụ trợ: `chatSidebarStore` (filter), `chatUiStore`, `chatEntityStore`, `chatSelectors`.
- `simple-virtual-timeline/` — virtual list tự viết (`SimpleVirtualizedChatTimeline`) + `useSimpleChatScroll`.
- `components/` — group-members/* (modal quản lý thành viên), PollCreateDialog (tạo poll — phần render poll chưa triển khai).
- `permissions/groupPermissions.ts` — quyền theo role (owner/admin/member).

---

## 8. Components UI quan trọng

- `components/ui/` — primitives + barrel `index.ts` (Button, Input, Modal, Toast/ToastProvider, Spinner/PageSpinner, Skeleton, EmptyState, SegmentedControl, Checkbox…).
- `components/chat/` — `ChatHeader`, `MessageItem/*`, `message-layout/*` (MessageRow, MessageCluster, MessageBodyRenderer, ReplyPreview), `ReactionBar/*`, `ReactionPicker/*`, `QuickReactBar`, `SearchPanel`, `PinnedMessagesPanel`, `ForwardModal`, `thread/*`.
- `components/message/` — render theo loại: `TextMessage`, `ImageMessage`, `VoiceMessage`, `FileMessageCard`, `StickerMessage`, `SystemMessage`, `MarkdownContent`, `LinkPreviewCard` (video/file render qua `MessageBodyRenderer` + `FileMessageCard`).
- `components/input/` — `MessageInput.tsx` + `MessageInput/*` (composer banners: reply, edit, mention, status, length), `TipTapEditor`, attachments (`AttachmentTray/Item/Menu`), `EmojiPicker`, `EmojiButton`.
- `components/layout/` — `Sidebar`, `ChatWindow`, `CommandPalette`, `sidebar/*` (RoomList, RoomItem, SidebarHeader/Search…).
- `components/info/` — panel thông tin bên phải: `GroupInfo` (chi tiết hội thoại/nhóm, members, invite link), `UserProfile` (info DM), `shared-resources/SharedResourcesPreview` (preview media/file/link dùng chung, gọi 4 endpoint resources ở mục 5). Dùng trong `ChatPage`.
- `components/settings/` — các section settings (Appearance, Notification, Privacy, Chat, Security, Language, DangerZone…) + `SettingsApplier` (áp dụng settings lúc mount).

---

## 9. Hooks toàn cục (`src/hooks/`)

WebSocket: `useWebSocket` (core), `useWebSocketConnectionLifecycle`, `useWebSocketAuthCoordinator`, `useWebSocketConversationCoordinator`, `useWebSocketResyncCoordinator`.
Chat: `useSendMessage`, `useMessageGrouping`, `useMessageSearch`, `usePinnedMessages`, `useTypingIndicator`, `usePresence`, `useComposerAvailability`.
Upload/file: `useUploadQueue`, `useFilePreview`, `useAttachmentDownloadUrl`, `useDropZone`.
Auth: `useAuth`, `useLogout`, `useFriendship`, `useNotifications`, `useEmailVerificationChallenge`, `useOtpInput`, `useResendCooldown`.
Tiện ích: `useDebounce/useDebouncedCallback/useThrottledCallback`, `useAutoResizeTextarea`, `useInViewport`, `useDelayedLoading`, `useMobileViewportMetrics`.

---

## 10. Settings & Theme

- `settings/` — `settingsStore` (zustand) + `defaults.ts` + `persistence.ts` (localStorage) + `sync.ts`/`settingsSyncBridge.ts` (đồng bộ server qua WS `UserSettingsUpdatedPayload`). Types re-export từ shared types. `SettingsApplier` (trong `components/settings/`) áp theme/lang/density khi app mount.
- `theme/` — `ThemeProvider` + `runtimeTheme.ts` ghi CSS variables (token màu động, accent color), `bootstrapThemeAttributes()` set sớm trong `main.tsx` để tránh flash. Tailwind đọc các CSS var này.
- i18n: ngôn ngữ resolve qua `chat.language` localStorage (SettingsApplier owns việc "system" → browser lang). Namespaces: common, auth, chat, sidebar, profile, error, validation, theme, settings, friends, group, calendar, aiAssistant, tasks.

---

## 11. Routes

| Path | Component | Guard |
|------|-----------|-------|
| `/login` | LoginPage | guestOnly |
| `/activation` | ActivationFlowPage | activationOnly |
| `/verify-email` | VerifyEmailPage | public |
| `/forgot-password`,`/reset-password` | Forgot/ResetPasswordPage | guestOnly |
| `/force-change-password` | ForceChangePasswordPage | forceChangePasswordOnly |
| `/chat/:conversationId?` | ChatPage | protected |
| `/friends`, `/friend-discovery/:shareCode` | FriendsPage | protected |
| `/join/:token` | JoinByLinkPage | protected |
| `/tasks` | TasksPage | protected |
| `/calendar` | CalendarPage | protected |
| `/ai-assistant` | AiAssistantPage | protected |
| `/archive` | ArchiveToAiRedirect | protected |
| `/notifications` | NotificationsPage | protected |
| `/settings` | SettingsPage | protected |
| `/help`, `/faq`, `/report-issue` | Help/FAQ/ReportIssuePage | protected |
| `/` | → redirect `/chat` | |
| `*` | NotFoundPage | |

Errors pages: `pages/errors/` (Forbidden, Unauthorized, NotFound, ServerError, Offline, RateLimit, Maintenance).

---

## 12. Conventions

- Feature code trong `src/features/<feature>/`; UI dùng chung trong `src/components/`.
- REST endpoint thật khai báo ở `src/services/api.ts`; timeline/cache đi qua RTK Query `features/api/chatApi.ts`.
- Realtime: WS event → `register*Events` → dispatch action → `realtimeMiddleware` patch cache (đừng patch cache trực tiếp ở component).
- Path luôn lấy từ `ROUTE_PATHS` (`router/paths.ts`), không hardcode string.
- i18n: dùng `t('namespace:key')`; thêm key ở **cả** `locales/vi` và `locales/en`, chạy `npm run i18n:check`.
- Message luôn chuẩn hóa qua `serializableMessage`/`messageIdentity` trước khi vào Redux (tránh non-serializable & trùng id).
- Logging qua `utils/logger.ts` (không `console.log` rải rác).
- Có nhiều test runtime trọng yếu (xem `test:chat-runtime`) — khi sửa logic timeline/merge/scroll nên chạy bộ này.

---

## 13. Build & CI

**tự động chạy build không cần yêu cầu lại .**
Lưu ý lỗi build đã từng dính: **casing import sai** giữa Windows local và Linux CI (TS1261) — import phải khớp đúng hoa/thường tên file. Lệnh tối thiểu trước khi push (chỉ chạy khi được yêu cầu):
```bash
npm run build && node scripts/verify-dist-assets.mjs
```

---

## 14. Chỉnh UI/UX — bảng màu & token

Chỉ sửa styling/tokens, **không** đụng logic hay cấu trúc. Nguồn gốc màu: `src/index.css`, `src/components/ui/Button.tsx`, `src/shared/layout/SideRail.tsx`.

### Hai vùng màu tách biệt (BẮT BUỘC nhớ)

| Vùng | Màu chủ | Ghi chú |
|------|---------|---------|
| **SideRail + LoginPage** | Đỏ + Vàng | `#D32F2F → #C41E3A`, badge `#FFC857` — **KHÔNG đổi** |
| **Toàn bộ app còn lại** | Xanh dương | `#1565C0` (solid fill) / `#1976D2` (hover/border) |

### Token xanh hay dùng (app UI)
```
Solid fill nút/toggle/checkbox:  bg-[#1565C0]  hover:bg-[#1976D2]
Text brand:                       text-[#1565C0]
Background badge/highlight nhạt:  bg-[#DBEAFE]/10  hoặc  bg-[#1976D2]/8
Border active:                    border-[#1976D2]/60
Focus ring:                       focus:ring-[#1565C0]/25
```
 
### Token đỏ/vàng (SideRail & LoginPage — giữ nguyên)
```
Gradient rail:     linear-gradient(180deg, #D32F2F 0%, #C41E3A 100%)
Badge unread rail: bg-[#FFC857] text-[#C41E3A]
Nút Login:         gradient from-[#C41E3A] via-[#D32F2F] to-[#FFC857]
```

### Button variants
- CTA chính → `variant="brand"` (xanh solid)
- Hủy/phụ → `variant="brand-outline"` (xanh outline)
- Xóa/phá hoại → `variant="danger"`
- Badge unread sidebar → `bg-[#FFC857] text-[#C41E3A]` (vàng+đỏ, đồng bộ rail)

> Không dùng `#ffffff` trắng tinh / `#000000` đen tuyền. Trắng → `#E7E9EB`, nền app → `#eef2f7`.  
> Gradient xanh→xanh đã bỏ toàn app (AI-tell) — chỉ dùng solid `#1565C0`.

---

## 15. Kênh giao tiếp chuẩn xuyên repo — `chat-api-service/docs/requests/`

> **Vị trí:** `d:\HacomCTY\chat-api-service\docs\requests\` (cùng máy, repo `chat-api-service`).
> Đây là **source of truth** cho mọi trao đổi hợp đồng (contract) / yêu cầu thêm-đổi field / nghiệm thu **giữa FE ↔ BE-api ↔ shared-types ↔ auth ↔ hr**. Không trao đổi miệng/chat trôi nổi — **mọi đề xuất đổi contract phải có 1 file ở đây** (có version, review được, truy vết được, là căn cứ nghiệm thu).

**Quy trình khi đụng ranh giới 2 repo (FE cần BE trả thêm field / đổi shape, hoặc nghiệm thu BE đã ship):**
1. **Đọc trước** `docs/requests/README.md` (quy ước đầy đủ) + 2 template `_TEMPLATE_CONTRACT.md` / `_TEMPLATE_ACCEPTANCE.md` trong folder đó.
2. **Đọc spec FE liên quan** (`docs/CHAT_UI_SPEC.md` / `docs/CALENDAR_SPEC.md` / code thật) để gộp đúng nội dung hiện trạng vào file contract/acceptance — không viết lại từ trí nhớ.
3. **Tạo/cập nhật file** trong folder đó theo template + header trạng thái bắt buộc.

**Hai loại file:** `contract` (yêu cầu bên kia đổi contract) và `ACCEPTANCE` (nghiệm thu bên kia đã ship đúng tới đâu). Một feature thường có cả hai (contract trước → acceptance sau).

**⚠️ Ràng buộc của FE (repo này):**
- **Chỉ được tạo/sửa file do FE khởi xướng**, đặt tên prefix **`FE__`** (theo quy ước README mục 4): `FE__<feature-kebab>__contract__<dd-mm-yy>.md` hoặc `FE__<feature-kebab>__ACCEPTANCE__<dd-mm-yy>.md`. **`<dd-mm-yy>` BẮT BUỘC** (ngày tạo, dùng `-`, khớp **Ngày** trong header — vd `23-06-26`).
- **KHÔNG sửa** file do bên khác khởi xướng (`API__…`, `AUTH__…`, `HR__…`, `TYPES__…`) — chỉ đọc để đối chiếu/nghiệm thu.
- File **không xoá** sau khi chốt (giữ lịch sử) — việc mới → file mới.

**Header trạng thái bắt buộc** (frontmatter dạng quote ở đầu mỗi file): `Loại` / `Người yêu cầu` (mã bên GỬI, trùng prefix tên file) / `Đối tượng` / `Liên quan` / `shared-types ≥ x.y.z` / `Trạng thái` (`ĐỀ XUẤT → CHỜ XÁC NHẬN → ĐANG LÀM → ĐÃ SHIP → ĐÃ CHỐT`, hoặc `BLOCKED`) / `Ngày` (tuyệt đối).

**Mã bên (party code):** `FE` = chat-web-client • `API` = chat-api-service • `AUTH` = chat-auth-service • `HR` = hr-api-service • `TYPES` = @hacom/chat-shared-types.

> Nội dung phải dẫn chiếu **code thật** (`file_path:line`), có **cách kiểm chứng chạy thật** (curl/jq + response kỳ vọng), và field thiếu nguồn/quyền → trả `null` (không 4xx). Khi cần chi tiết hơn, **hỏi user và đọc kỹ** README + template trong folder trước khi viết.
