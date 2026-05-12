# UI/UX Audit Report — chat-web-client

**Auditor:** Senior UI/UX Auditor + Senior Frontend Engineer
**Date:** May 12, 2026
**Scope:** `chat-web-client` — full UI/UX audit of chat realtime application
**Tech Stack:** React 19, Vite 7, Redux Toolkit, Zustand, Tailwind CSS 3, TipTap, TanStack Virtual, react-window, i18next

---

## 1. Executive Summary

- **Overall state:** Application hoạt động ổn định cho luồng chat cơ bản, nhưng có nhiều legacy logic tích lũy qua các lần sửa chat, dẫn đến component quá lớn, duplicate implementation, và inconsistency về UI. Không có bug crash-level nghiêm trọng trên production, nhưng UX có các điểm gây khó chịu hằng ngày.

- **Scroll system:** Được thiết kế tốt, không có race condition giữa các effect. `useSimpleChatScroll` là single owner duy nhất. Scroll-to-bottom button và pending message badge đều có. Tuy nhiên 2 hook scroll khác (`useVirtualizedMessages`, `useTanStackVirtualizedMessages`) vẫn tồn tại trong codebase dù không được sử dụng ở production.

- **State management:** Kiến trúc phân lớp tốt — Zustand cho local state, RTK Query cho server state, optimistic update với stable identity key ngăn flicker. Race condition giữa WebSocket và API đã được xử lý qua deduplication layer. Tuy nhiên nhiều state được trùng lặp giữa component-level và store-level.

- **UI consistency:** Có design system qua CSS variables và Tailwind config, nhưng auth components (PasswordLoginForm) sử dụng hardcoded Tailwind colors (`slate-*`, `red-500`, hex `#1d5fd6`) không qua design tokens. Nhiều hardcoded Vietnamese strings ngoài i18n system. Border radius và font size sử dụng arbitrary values không nhất quán.

- **Performance:** Message item memoization rất chi tiết (70+ dòng custom comparison), nhưng ChatWindow (1157 lines) và MessageInput (1599 lines) quá lớn, gây khó maintain và có nguy cơ re-render cascade. Unread badge đang bị disable bằng `{null}`.

- **Code quality:** Duplicate implementations tồn tại rõ ràng — 2 message bubble components khác nhau, 3 virtualization approaches, 2 message grouping hooks. Nhiều TODO/FIXME comments chỉ ra bug đã biết nhưng chưa sửa.

- **Quick wins có thể làm ngay:** (1) Bật lại unread badge, (2) đưa hardcoded strings vào i18n, (3) loại bỏ dead code scroll hooks không dùng, (4) thống nhất color tokens cho auth forms.

---

## 2. Overall UX Assessment

### What Works Well

**Layout & Structure:**
- Phân chia rõ ràng 3-column layout: sidebar (danh sách hội thoại) — chat lane (danh sách tin nhắn) — info panel. Khuôn mẫu quen thuộc với người dùng Slack/Discord/Telegram.
- Sidebar responsive, tự collapse khi màn hình nhỏ, có keyboard navigation.
- CSS variable-based theming cho light/dark mode và brand colors, dễ mở rộng.
- Density contract system cho phép điều chỉnh spacing/typography theo layout state (`normal`, `with-panel`, `mobile`).

**Message Display:**
- Bubble design phân biệt rõ tin nhắn mình vs người khác qua alignment + màu sắc.
- Group message (cùng người gửi trong 45 giây) gộp lại, giảm visual noise.
- Reply preview hiển thị đúng người gửi và nội dung gốc.
- Mention/tag được highlight trong bubble.
- Link preview, image preview, file attachment đều có fallback rõ ràng.
- Message status indicators (sending/sent/failed) rõ ràng.

**Input Box:**
- TipTap rich text editor với formatting toolbar (bold, italic, underline, code, link).
- Emoji picker tích hợp.
- Attachment tray với upload progress.
- Mention panel với keyboard navigation.
- Slow mode feedback trực quan.
- Enter to send, Shift+Enter for newline — đúng convention.

**Realtime Feedback:**
- Typing indicator hiển thị người đang nhắn.
- Presence (online/offline) được hiển thị.
- Connection state notice khi mất mạng/reconnecting.
- Toast notifications cho các thao tác quan trọng.

**Accessibility cơ bản:**
- Keyboard navigation trong sidebar (Arrow keys, Enter to select).
- `aria-label` trên icon buttons.
- Focus visible styles.
- Reduced motion support.

**i18n:**
- 11 namespaces đầy đủ, cả tiếng Việt và tiếng Anh.
- Fallback về tiếng Việt khi thiếu key.
- Translation keys file riêng cho `i18n:check`.

### Problems Found

**P0 — Breaking/Blocking:**
1. Unread badge ở sidebar bị disable hoàn toàn bằng `{null}` (RoomItem.tsx:353).
2. Auth forms sử dụng color tokens không nằm trong design system.

**P1 — Daily Friction:**
3. 20+ hardcoded Vietnamese strings không qua i18n — nếu đổi ngôn ngữ, nhiều chỗ vẫn hiển thị tiếng Việt.
4. Component quá lớn: MessageInput (1599 lines), ChatWindow (1157 lines), MessageCluster (560 lines).
5. Duplicate implementations: 2 message bubble, 3 virtualization, 2 grouping hooks.
6. Border radius không nhất quán (0.95rem, 1rem, xl).
7. Font size arbitrary values trộn lẫn với semantic scale.

**P2 — Polish & Refinement:**
8. Inline `style={}` còn tồn tại ở ~10 components.
9. Auth form sử dụng `slate-*`, `red-500`, hex colors không qua design tokens.
10. Một số component không có `React.memo` hoặc memoization không đúng cách.
11. Legacy API fallback comment vẫn tồn tại trong code.
12. Dead code: 2 scroll hooks không được dùng, legacy `MessageBubble` wrapper.
13. Nhiều performance tracking utilities (`logMessageDebug`, `logScrollTrace`) nên được strip ở production.
14. Auth form input có cả hover state nhưng không có active state.

**P3 — Nice to Have:**
15. Empty state illustration có thể polished hơn.
16. Tooltip cho icon buttons không đồng nhất.
17. Password strength component không dùng design tokens.
18. Không có loading skeleton cho message bubbles trong một số trường hợp.

---

## 3. Critical Findings

| ID | Priority | Area | Issue | Impact | Suggested Fix | Related Files |
|----|----------|------|-------|--------|---------------|---------------|
| CF-01 | P0 | Conversation List | Unread badge bị disable hoàn toàn bằng `{null}` | Người dùng không biết có tin nhắn mới chưa đọc ở sidebar | Tìm và sửa bug `unread_count` đã được TODO comment, sau đó bật lại badge | `src/components/layout/sidebar/RoomItem.tsx:353` |
| CF-02 | P0 | Visual Design | Auth forms dùng hardcoded Tailwind colors (`slate-*`, `red-500`, hex `#1d5fd6`) không qua CSS variables | Vi phạm design system, khó thay đổi theme toàn app | Thay bằng design token classes (`text-text-primary`, `border-border`, `focus:border-primary`, etc.) | `src/components/auth/PasswordLoginForm.tsx` |
| CF-03 | P1 | i18n | 20+ hardcoded Vietnamese strings ngoài i18n system | Khi đổi ngôn ngữ sang English, nhiều chỗ vẫn hiển thị tiếng Việt | Đưa tất cả vào `common.json` hoặc namespace phù hợp, thay bằng `t()` calls | `src/components/layout/sidebar/SidebarHeader.tsx:183,210,223`; `src/components/ui/EmptyState.tsx:253-312`; `src/components/input/MessageInput.tsx:1404-1405,1494`; `src/components/auth/PasswordLoginForm.tsx` |
| CF-04 | P1 | Code Maintainability | MessageInput: 1599 lines, 16+ state, 10+ refs, 8+ effects | Quá lớn để maintain, khó hiểu, dễ break khi sửa | Tách thành: ComposerToolbar, MentionPanel, AttachmentTray, DraftPersistenceController, TypingIndicatorEmitter — mỗi cái 1 file | `src/components/input/MessageInput.tsx` |
| CF-05 | P1 | Code Maintainability | ChatWindow: 1157 lines, 22 refs, 10+ state, 10+ effects | Cùng vấn đề với MessageInput | Tách thành: ConnectionStateNotice, CallModeOverlay, SearchOverlay, PinnedOverlay, InspectOverlay, ComposerController | `src/components/layout/ChatWindow.tsx` |
| CF-06 | P1 | Code Maintainability | Duplicate message bubble implementations | 2 components khác nhau cho cùng 1 thứ — bấtconsistency và maintain khó | Xác định cái nào là canonical, loại bỏ cái còn lại. Nếu cần 2 variant thì tách props rõ ràng | `src/components/chat/MessageBubble.tsx` (wrapper quanh MessageCluster) vs `src/components/chat/thread/MessageBubble.tsx` (standalone) |
| CF-07 | P1 | Performance | 3 virtualization approaches cùng tồn tại: react-window, TanStack virtual, SimpleVirtualizedChatTimeline | Dead code tăng bundle size, confuse developer, có thể bị import nhầm | Xác định `SimpleVirtualizedChatTimeline` + `useSimpleChatScroll` là canonical, xóa `useVirtualizedMessages` và `useTanStackVirtualizedMessages` | `src/hooks/useVirtualizedMessages.ts` (556 lines); `src/hooks/useTanStackVirtualizedMessages.ts`; `src/features/chat/simple-virtual-timeline/` |
| CF-08 | P1 | Visual Design | Border radius inconsistent: `rounded-[0.95rem]`, `rounded-[1rem]`, `rounded-xl` (đều = ~16px) | UI không đồng nhất, khó maintain | Thống nhất dùng `rounded-lg` (16px) từ Tailwind config cho tất cả bubble/button radius | `MessageInput.tsx:1156,1189`; `ChatHeader.tsx:359`; `src/components/auth/` |
| CF-09 | P2 | i18n | Một số auth input placeholder chưa có label/accessible name đầy đủ | Screen reader user không biết field nào là gì | Thêm `aria-label` hoặc visual `<label>` cho tất cả inputs | `src/components/auth/PasswordLoginForm.tsx` |
| CF-10 | P2 | Visual Design | Inline `style={}` còn tồn tại ở ~10 components cho positioning/layout | Khó override, không responsive-friendly | Chuyển thành Tailwind classes hoặc CSS | `SidebarHeader.tsx:238`; `ChatPage.tsx:1018`; `ChatWindow.tsx:1061,1097`; `VoiceMessage.tsx:172`; `ImageMessage.tsx:95`; `Skeleton.tsx:43,177,323` |
| CF-11 | P2 | State Management | Draft persistence sống ở ChatWindow (1157 lines) thay vì custom hook riêng | Logic trộn lẫn với UI code, khó test | Tách thành `useConversationDraft` hook | `src/components/layout/ChatWindow.tsx:786-803` |
| CF-12 | P2 | Accessibility | Không có `role="log"` hoặc `aria-live` cho message list | Screen reader không thông báo tin nhắn mới | Thêm `role="log"` + `aria-live="polite"` vào message viewport container | `SimpleVirtualizedChatTimeline.tsx` |
| CF-13 | P2 | Performance | Không có `React.memo` trên một số components nhỏ như `Avatar`, `SidebarHeader` | Re-render không cần thiết khi parent re-renders | Thêm `React.memo` hoặc kiểm tra `useMemo`/`useCallback` | Cần audit toàn bộ components |
| CF-14 | P3 | Code Maintainability | Performance tracking utilities (`logMessageDebug`, `logScrollTrace`, `logChatPerformance`) có thể gây overhead | Không cần thiết ở production, có thể log quá nhiều | Wrapping với `if (import.meta.env.DEV)` hoặc strip hoàn toàn | Nhiều files trong `src/features/chat/` |
| CF-15 | P3 | Visual Design | Auth form input không có active state (chỉ có hover) | Trải nghiệm khi đang gõ không feedback rõ | Thêm `focus:ring-2 focus:ring-primary/30` | `src/components/auth/PasswordLoginForm.tsx` |

---

## 4. Deep Dive by Area

### 4.1. Layout

**What works well:**
- 3-column layout (sidebar — chat — panel) phù hợp với mental model của ứng dụng chat.
- CSS variable-based layout spacing, dễ adjust cho different screen sizes.
- Density contract system cho phép 3 layout states (`normal`, `with-panel`, `mobile`).
- Sidebar collapse tự động ở breakpoint 1023px.
- `ChatLane` component wrap content với max-width constraint, đảm bảo message không bị quá rộng.

**Problems found:**
- `ChatWindow` (1157 lines) chứa quá nhiều responsibility: draft persistence, overlay modes, call mode, connection notice, composer state, resize observer. Nên tách thành các sub-components rõ ràng hơn.
- `AppLayout` chỉ là thin wrapper quanh `AuthenticatedLayout` — có thể gộp lại.

**Why it matters:**
- Component lớn >1000 lines rất khó debug và refactor an toàn. Mỗi lần cần sửa phải hiểu toàn bộ dependencies trước.

**Recommended improvements:**
- Tách `ChatWindow` thành: `ChatHeaderSection`, `MessageViewportSection`, `ComposerSection`, `OverlayManager`. Giữ ChatWindow như container orchestration.
- Tách `Sidebar` thành: `SidebarHeader`, `SidebarSearch`, `RoomListContainer` — hiện đang gộp trong 1 file nhưng render từ nhiều component files khác nhau.

**Related files:**
`src/components/layout/ChatWindow.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/layout/AuthenticatedLayout.tsx`, `src/layouts/AppLayout.tsx`

---

### 4.2. Conversation List

**What works well:**
- `RoomList` dùng `react-window` VariableSizeList — virtualized, hiệu suất tốt cho danh sách >10 items.
- Keyboard navigation với Arrow keys.
- Height measurement qua `ResizeObserver`, tự động recalculate khi container resize.
- `RoomItemView` tách riêng display logic khỏi container (store subscription), dễ test.
- Computed view model (displayName, previewText, timeLabel) tách riêng khỏi rendering.
- Density-based height: `normal: 72px`, `with-panel: 68px`, `mobile: 64px`.

**Problems found:**
- **P0: Unread badge disabled.** Tại `RoomItem.tsx:353`:
  ```tsx
  {/* unread badge hidden temporarily — unread count bug pending fix */}
  {null}
  ```
  Comment rõ ràng là bug đã biết nhưng chưa sửa. Người dùng không biết có tin chưa đọc.
- Preview text có thể hiển thị mã nhân sự (employee code) thay vì tên đầy đủ — phụ thuộc vào API trả về trường nào.
- Error state hiển thị "Tải lại" nhưng không có retry logic cụ thể cho conversation list (chỉ có `onRetry` prop được pass từ ChatPage).

**Why it matters:**
- Conversation list là entry point chính. Nếu không có unread badge, người dùng phải đọc từng hội thoại để biết có tin mới không — rất gây khó chịu trong môi trường làm việc bận.

**Recommended improvements:**
1. **Ưu tiên cao nhất:** Tìm nguyên nhân unread count bug và bật lại badge. Có thể liên quan đến `chatStoreUnread.ts` optimistic update + server snapshot rollback logic.
2. Kiểm tra `displayName` computation — đảm bảo dùng `fullName` thay vì `employeeCode` từ API.
3. Thêm retry button trong error state của `RoomList` không chỉ là text mà là button với icon.

**Related files:**
`src/components/layout/sidebar/RoomItem.tsx` (481 lines), `src/components/layout/sidebar/RoomList.tsx` (480 lines), `src/stores/chatStoreUnread.ts`

---

### 4.3. Chat Header

**What works well:**
- Hiển thị đầy đủ: conversation name, avatar, typing status, presence indicator.
- Actions placed correctly: back button (mobile), search, pinned, info, call/video call.
- Overflow menu cho các actions ít dùng (không làm header quá bận).
- Responsive: back button chỉ hiện ở `mobile` layout state.

**Problems found:**
- `isMenuOpen` state + outside-click detection (line 108-130) dùng closure-based event listener, có thể cause stale closure nếu component unmount mà listener chưa được cleanup. Tuy nhiên component này không unmount thường xuyên nên risk thấp.
- `displayName` computation phụ thuộc vào `getConversationDisplayName` utility — nếu API trả về employeeCode thay vì fullName, header sẽ hiển thị mã thay vì tên.

**Why it matters:**
- Header cho người dùng biết họ đang ở cuộc trò chuyện nào. Hiển thị mã nhân sự thay vì tên sẽ gây confusion trong môi trường doanh nghiệp.

**Recommended improvements:**
- Verify `getConversationDisplayName` dùng `fullName`/`displayName` field từ API, không phải `employeeCode`.
- Tách menu outside-click logic thành custom hook `useOutsideClick` để reuse và tránh duplicate code.

**Related files:**
`src/components/chat/ChatHeader.tsx` (~300 lines), `src/features/chat/identity/conversationIdentity.ts`

---

### 4.4. Message List

**What works well:**
- TanStack Virtual used for virtualization — hiệu quả cho danh sách dài.
- Incremental rebuild với common prefix length optimization (`useConversationTimelineRows`).
- Item identity preservation khi content unchanged — ngăn unnecessary re-renders.
- `conversationId` reset trigger trong scroll hook đảm bảo clean slate khi đổi hội thoại.
- Date dividers và unread dividers tách riêng khỏi message items.

**Problems found:**
- `SimpleVirtualizedChatTimeline` (260 lines) là production implementation, nhưng `useVirtualizedMessages` (556 lines) và `useTanStackVirtualizedMessages` vẫn tồn tại trong codebase — dead code không được clean.
- `getItemKey` tại line 140-141 có fallback:
  ```tsx
  getItemKey: (index) =>
    threadRows[index]?.key ?? `${threadRows[index]?.kind ?? "x"}-${index}`,
  ```
  Fallback này dùng `index` — nếu một row bị remove khỏi giữa danh sách, tất cả items sau nó sẽ có key thay đổi, gây React re-create DOM nodes không cần thiết. Tuy nhiên date dividers và unread markers là stable items, và message rows dùng stable keys, nên practical impact thấp.
- Không có `aria-live` region cho message list — screen reader không thông báo tin nhắn mới.

**Why it matters:**
- Message list là core experience. Nếu scroll không smooth hoặc bị jump khi có tin mới, người dùng sẽ mất confidence vào ứng dụng.

**Recommended improvements:**
1. Remove `useVirtualizedMessages.ts` và `useTanStackVirtualizedMessages.ts` sau khi verify không còn reference đâu.
2. Thêm `role="log"` + `aria-label="Tin nhắn trong cuộc trò chuyện"` vào container div.
3. Thay fallback key thành `kind-${stableId}` hoặc chỉ dùng `kind` cho non-message rows.

**Related files:**
`src/features/chat/simple-virtual-timeline/SimpleVirtualizedChatTimeline.tsx` (260 lines), `src/features/chat/simple-virtual-timeline/useSimpleChatScroll.ts`, `src/hooks/useVirtualizedMessages.ts` (dead), `src/hooks/useTanStackVirtualizedMessages.ts` (dead), `src/features/chat/hooks/useConversationTimelineRows.ts`, `src/hooks/useMessageGrouping.ts`

---

### 4.5. Scroll Behavior

**(Detailed analysis at Section 5 below)**

---

### 4.6. Message Bubble

**What works well:**
- Phân biệt rõ tin mình vs người khác qua alignment (right/left), color (bg-primary vs bg-surface), tail (left/right).
- `TimelineMergeLevel` enum cho phép tinh chỉnh border radius theo vị trí trong group: `same_sender_continuation`, `semantic_merge`, `default`.
- `MessageSurface` component handle bubble styling dựa trên merge level — dynamic border radius.
- Message actions (reply, react, edit, delete) hiển thị trên hover.
- Status indicators cho sending/sent/failed.
- Long message collapse với "Xem thêm".

**Problems found:**
- **Duplicate implementations:** `src/components/chat/MessageBubble.tsx` là wrapper 42 dòng quanh `MessageCluster`. Trong khi `src/components/chat/thread/MessageBubble.tsx` là standalone component với props interface khác nhau. Hai components này render message bubbles nhưng có API và internal logic khác nhau.
- Long message collapse toggle state (`expandedLongMessageIds`) sống ở `MessageGroup` (733 lines), được pass xuống `MessageBubble` qua nhiều levels — prop drilling không quá sâu nhưng không ideal.
- `MessageCluster` (560 lines) quá lớn, nên tách action rail, reply preview, reactions display thành sub-components.

**Why it matters:**
- Bubble là UI element người dùng nhìn nhiều nhất. Duplicate implementations có thể dẫn đến inconsistency khi update 1 bên mà quên bên kia.

**Recommended improvements:**
- Chọn 1 implementation làm canonical: khuyến nghị `MessageCluster` (đã có logic đầy đủ, group awareness tốt), loại bỏ wrapper `MessageBubble.tsx`.
- Tách `MessageCluster` thành: `MessageBubbleContainer` (layout), `MessageBubbleActions` (hover rail), `MessageReplyPreview`, `MessageReactions`.
- Verify `thread/MessageBubble` có còn được import ở đâu không — có thể là legacy.

**Related files:**
`src/components/chat/MessageBubble.tsx` (42 lines — wrapper), `src/components/chat/MessageCluster.tsx` (560 lines), `src/components/chat/message-layout/MessageSurface.tsx`, `src/components/chat/thread/MessageBubble.tsx` (standalone, duplicate)

---

### 4.7. Composer/Input Box

**What works well:**
- TipTap editor với rich text formatting, placeholder, Enter/Shift+Enter behavior chuẩn.
- Emoji picker tích hợp, không cần mở OS emoji keyboard.
- Mention panel với keyboard navigation, `@username` detection, candidate normalization.
- Attachment tray với upload progress, retry, remove — feedback đầy đủ.
- Draft persistence với 450ms debounce — không mất nội dung khi accidentally refresh.
- Slow mode feedback: countdown timer hiển thị, input disabled khi cooldown.
- Disabled state với `disabledReason` + tone (`info`/`warn`/`error`).
- Live region announcement cho screen readers khi upload error.
- ResizeObserver tracking composer height để adjust scroll padding.

**Problems found:**
- **1599 lines** — quá lớn. Nhiều responsibility trộn lẫn: mention logic, emoji picker, attachment tray, typing indicator, disabled states, resize tracking, draft sync. Tất cả trong 1 file.
- Hardcoded string: `Nhấn Enter để gửi, Shift + Enter để xuống dòng` (line 1494) — không nằm trong i18n.
- `liveRegionMessage` state (line 107) dùng cho screen reader announcements nhưng không có aria-live container trong JSX — cần kiểm tra xem TipTap editor hoặc wrapper có cung cấp live region không.
- `handleLayoutHeightChange` callback được gọi trong `useLayoutEffect` (line 1068-1084) — nếu parent re-renders liên tục, đây có thể trigger nhiều layout calculations.
- Input disabled reason display không có visual distinction rõ giữa `info`, `warn`, `error` tones trong CSS.
- Attachment preview không có file type icon cho các loại file không preview được.
- Không có character count khi có limit.

**Why it matters:**
- Input box là primary interaction surface. Mỗi lần người dùng gửi tin nhắn, họ tương tác với component này. Bất kỳ friction nào ở đây đều ảnh hưởng trực tiếp đến trải nghiệm.

**Recommended improvements:**
1. Tách thành: `ComposerToolbar`, `MentionPanel`, `AttachmentTray`, `ComposerDisabledOverlay`, `ComposerLiveRegion` — mỗi file ~100-200 lines.
2. Đưa placeholder string vào i18n: `chat.composer.hint`.
3. Verify `aria-live` region tồn tại và hoạt động với `liveRegionMessage`.
4. Thêm file type icons cho attachments.
5. Consider thêm character/emoji count.

**Related files:**
`src/components/input/MessageInput.tsx` (1599 lines), `src/components/input/TipTapEditor.tsx` (~300 lines), `src/components/input/AttachmentTray.tsx`

---

### 4.8. Reply/Mention

**What works well:**
- Reply preview hiển thị người gửi gốc + nội dung preview (truncated).
- Click vào reply preview scroll đến tin nhắn gốc (`onNavigateToMessage` prop).
- Mention detection qua regex `@username`, highlight trong input và trong bubble.
- Mention panel với user list, keyboard navigation.
- State được clear đúng khi gửi message hoặc cancel (ChatWindow line 786-803).

**Problems found:**
- Reply jump: nếu tin nhắn gốc chưa load (nằm ngoài current window và chưa fetched), `onNavigateToMessage` được gọi nhưng không có fallback feedback. User có thể thấy scroll nhảy không đến đâu.
- Mention in input: khi user nhập `@` và xóa ngay, mention panel có thể hiện rồi ẩn nhanh — nên debounce hoặc check `mentionMatch` length > 0.
- Reply state sống ở ChatWindow (1157 lines) thay vì trong MessageInput — prop drilling qua 2-3 levels. Khi input cần show reply preview, nó phải receive `replyToMessage` prop.
- `buildMentionMatch` (MessageInput line 1399-1416) parse mention pattern mỗi keystroke — có thể optimize bằng `useMemo`.

**Why it matters:**
- Reply và mention là features phổ biến trong chat nội bộ. Nếu không hoạt động mượt, người dùng sẽ không dùng và phải type thủ công.

**Recommended improvements:**
1. Thêm fallback UI khi reply jump target not found: hiển thị toast "Tin nhắn gốc đang được tải..." hoặc trigger load.
2. Tách reply/mention state management thành `useComposerState` hook, tránh prop drilling.
3. `useMemo` cho `buildMentionMatch` với `[draftValue]` dependency.
4. Thêm animation cho mention panel appearance/disappearance.

**Related files:**
`src/components/input/MessageInput.tsx:1399-1416` (mention parsing), `src/components/layout/ChatWindow.tsx:786-803` (reply/mention state cleanup), `src/components/chat/MessageCluster.tsx:560` (reply preview rendering)

---

### 4.9. File/Image Attachment

**What works well:**
- Attachment tray hiển thị tất cả files đã chọn trước khi gửi.
- Upload progress với percentage.
- Thumbnail preview cho images.
- File name + size display.
- Remove/retry/cancel actions.
- Blocks send button khi có uploading drafts.

**Problems found:**
- Attachment preview không có file type icons cho non-image files (PDF, DOCX, XLSX).
- Không có file size limit feedback trước khi upload — user chỉ biết lỗi khi upload thất bại.
- `hasFailedDrafts` và `hasUploadingDrafts` flags nhưng không có aggregate error message (e.g., "2 files failed to upload").
- Không có virus scan feedback (nếu backend scan).

**Why it matters:**
- Chat nội bộ thường chia sẻ tài liệu. Nếu file preview không rõ hoặc upload error không clear, user phải mò.

**Recommended improvements:**
1. Thêm file type icons (Lucide icons cho PDF, DOC, XLS, ZIP, etc.).
2. Thêm client-side size validation với feedback trước khi upload: "File exceeds 25MB limit".
3. Tổng hợp error message cho multiple failed uploads.
4. Consider image compression option cho files > 5MB.

**Related files:**
`src/components/input/AttachmentTray.tsx`, `src/hooks/useUploadQueue.ts`, `src/components/input/MessageInput.tsx:1108-1170` (upload flow)

---

### 4.10. Realtime Feedback

**What works well:**
- Typing indicator hiển thị "A đang nhắn..." với animation.
- Presence (online/offline) hiển thị ở avatar status dot.
- Connection state notice tự động hiển thị khi mất kết nối (`ChatWindow.tsx:806-849`).
- Reconnection với exponential backoff, retry attempts hiển thị.
- Optimistic message insert — không phải chờ server response để thấy tin nhắn của mình.
- Message delivery receipt updates khi server ACK.

**Problems found:**
- Connection state notice hiện tại chỉ là `ephemeralNotice` string hiển thị trên top — có thể không đủ rõ ràng. Không có dedicated banner component.
- Typing indicator không phân biệt được giữa "đang gõ" và "đang gửi file" — cùng 1 indicator.
- Khi reconnecting, outgoing messages vẫn được queue nhưng không có visual feedback rằng "tin nhắn đang chờ gửi" (khác với sent/failed).
- Optimistic messages với `sendState: "sending"` không có distinct visual khác với `sent` — có thể user không biết tin chưa được server nhận.

**Why it matters:**
- Realtime apps cần trust signals rõ ràng. Người dùng phải biết tin nhắn của họ đã được gửi thành công hay đang chờ.

**Recommended improvements:**
1. Distinct visual cho optimistic messages: thêm subtle opacity/gray tint hoặc spinner icon khác với sent.
2. Connection banner nên là dedicated component với màu warning, không phải ephemeral notice.
3. Typing indicator nên phân biệt "typing" vs "uploading" nếu có.

**Related files:**
`src/hooks/useTypingIndicator.ts`, `src/stores/chatStoreOutbox.ts`, `src/components/layout/ChatWindow.tsx:806-849` (connection notice), `src/stores/presenceStore.ts`

---

### 4.11. Loading/Empty/Error States

**What works well:**
- Skeleton loading cho conversation list (`Skeleton` component, shimmer animation).
- Empty state với welcome message và action buttons (EmptyState.tsx).
- Error state cho message fetch với retry button.
- Loading spinner cho send action.
- Date dividers cho message list.

**Problems found:**
- EmptyState.tsx có 20+ hardcoded Vietnamese strings (lines 253-312) — không nằm trong i18n.
- Skeleton không có cho message bubbles — khi fetch tin nhắn, message area trống hoặc hiển thị spinner đơn giản. Nên có 3-5 skeleton message bubbles.
- Loading state cho conversation switch không có dedicated feedback — có thể thấy blank screen ngắn giữa 2 hội thoại.
- Error messages không phân biệt giữa "network error", "server error", "permission denied" ở UI level — tất cả hiển thị generic message.

**Why it matters:**
- Loading/empty/error states là "moments of truth" — đây là lúc user có thể bỏ app. Cần feedback rõ ràng và hành động cụ thể.

**Recommended improvements:**
1. Thêm skeleton message bubbles khi loading conversation.
2. Thêm conversation switch loading overlay hoặc skeleton header.
3. Đưa EmptyState strings vào i18n.
4. Phân biệt error types ở UI: network (retry button), server (contact admin), permission (navigate away).

**Related files:**
`src/components/ui/EmptyState.tsx` (hardcoded strings), `src/components/ui/Skeleton.tsx`, `src/components/chat/ConversationViewport.tsx` (loading state), `src/locales/vi/chat.json`

---

### 4.12. Responsive

**What works well:**
- 3 layout states: `normal`, `with-panel`, `mobile`.
- Sidebar tự collapse ở breakpoint 1023px.
- Message input và message list tự adjust theo available space.
- Avatar sizes responsive.
- Back button trong header chỉ hiện ở mobile layout.
- Room item height thay đổi theo layout state (72/68/64px).

**Problems found:**
- Breakpoint 1023px có thể gây issue trên tablet landscape (thường 1024px) — sidebar có thể flash ở boundary.
- Message bubble max-width 70% (`max-w-[70%]`) có thể quá hẹp trên màn hình rộng (>1440px) — nên tăng lên 60% hoặc dùng `max-w-2xl`.
- Image preview không scale tốt trên màn hình nhỏ — `max-width: 100%` có thể làm ảnh quá lớn trên tablet.
- Không có landscape/portrait orientation handling riêng.
- Dropdown menus có thể bị truncate nếu near screen edge (viewport overflow).

**Why it matters:**
- Người dùng laptop 1366px và tablet là nhóm phổ biến trong doanh nghiệp. Nếu layout không smooth, họ sẽ frustrated.

**Recommended improvements:**
1. Kiểm tra sidebar collapse logic ở boundary 1023-1024px.
2. Tăng message bubble max-width cho desktop wide: `max-w-[60%]` hoặc `max-w-2xl`.
3. Image preview max-width: `min(100%, 480px)`.
4. Consider `position: fixed` + viewport-based positioning cho dropdowns near edges.

**Related files:**
`src/index.css` (breakpoint definitions), `src/components/layout/ChatWindow.tsx`, `src/components/message/ImageMessage.tsx`

---

### 4.13. Accessibility

**What works well:**
- Keyboard navigation trong sidebar (Arrow keys, Enter).
- `aria-label` trên icon buttons.
- Focus visible styles (`focus-visible:outline-none focus-visible:ring-2`).
- Reduced motion support.
- `aria-describedby` for form inputs with error messages.
- Skip link potential (chưa verify).
- `data-theme` attribute cho dark mode.

**Problems found:**
- Không có `role="log"` hoặc `aria-live="polite"` cho message list — screen reader không thông báo tin nhắn mới.
- `TipTapEditor` không có explicit `role` hoặc `aria-label` — editor div có thể không được announce đúng.
- Mention panel không có `role="listbox"` hoặc `aria-activedescendant` — keyboard users không biết selection state.
- Tooltip cho icon buttons không có keyboard alternative (chỉ `title` attribute, không phải `aria-describedby`).
- Emoji picker có thể không accessible — không có keyboard navigation documented.
- Modal dialogs cần verify có focus trap chưa.
- Color không phải sole indicator cho trạng thái — có icons/text accompany colors cho sent/failed/typing.

**Why it matters:**
- Accessibility không chỉ cho users với disabilities — mà còn cho keyboard-only users, screen reader users, và users trong environments không hỗ trợ audio/video.

**Recommended improvements:**
1. Thêm `role="log"` + `aria-live="polite"` vào message viewport.
2. Thêm `role="combobox"` + `aria-expanded` + `aria-controls` cho mention panel.
3. Thêm `aria-label` cho TipTap editor: "Soạn tin nhắn".
4. Thay `title` attributes bằng `aria-describedby` cho tooltips.
5. Verify focus trap trong modals.
6. Test với VoiceOver/NVDA.

**Related files:**
`src/features/chat/simple-virtual-timeline/SimpleVirtualizedChatTimeline.tsx`, `src/components/input/MessageInput.tsx` (mention panel), `src/components/modals/` (modals)

---

### 4.14. Performance

**What works well:**
- TanStack Virtual cho message list — chỉ render visible items.
- React-window VariableSizeList cho conversation list — virtualized.
- `React.memo` on `MessageBubble`, `RoomItemView`.
- Custom memo comparison `areEqualMessageItem` (70+ lines) cho MessageItem — rất chi tiết, tránh unnecessary re-renders.
- Incremental rebuild với common prefix length trong `useConversationTimelineRows`.
- Message identity preservation khi content unchanged.
- `useLayoutEffect` cho scroll writes — đồng bộ với paint.
- RAF-wrapped scroll writes — không block main thread.

**Problems found:**
- `ChatWindow` (1157 lines) re-renders khi bất kỳ prop nào thay đổi — không có `React.memo`. Prop `typingStatuses` update thường xuyên (mỗi keystroke từ người khác) sẽ trigger re-render.
- `MessageCluster` (560 lines) re-renders khi parent re-renders — không có `React.memo` (chỉ wrapper `MessageBubble` có memo).
- `Sidebar` (Sidebar.tsx) re-renders khi `typingStatus` thay đổi — typing status update thường xuyên. `usePresence` hook subscribe tất cả DM user presence, có thể update nhiều.
- `RoomList` re-renders khi `conversationIds` array reference thay đổi — nếu parent tạo new array mỗi render, đây là problem.
- Performance tracking utilities (`logMessageDebug`, `logScrollTrace`, `logChatPerformance`, `recordChatPerformanceMeasure`) được call trong hot paths — có overhead dù chỉ log.

**Why it matters:**
- Chat app có message volume cao và update liên tục. Nếu re-render không kiểm soát, app sẽ lag, đặc biệt trên thiết bị yếu.

**Recommended improvements:**
1. Thêm `React.memo` cho `ChatWindow` với custom comparison cho `typingStatuses` (shallow compare là đủ).
2. Thêm `React.memo` cho `MessageCluster`.
3. Wrap performance logging với `if (process.env.NODE_ENV === 'development')`.
4. Verify `conversationIds` được stable reference từ selector — dùng `useMemo` hoặc stable selector.
5. Consider selective subscription cho typing statuses — chỉ subscribe cho current conversation.

**Related files:**
`src/components/layout/ChatWindow.tsx`, `src/components/chat/MessageCluster.tsx`, `src/components/layout/Sidebar.tsx`, `src/features/chat/simple-virtual-timeline/useSimpleChatScroll.ts` (performance logging)

---

### 4.15. State Management

**What works well:**
- Phân lớp rõ ràng: Zustand cho local/ephemeral state, RTK Query cho server state.
- Optimistic updates với stable identity keys (`clientMessageId`/`stableId`) — không flicker.
- Deduplication layer 2 levels (eventId + message identity) cho WebSocket messages.
- Unread count optimistic update với snapshot rollback on failure.
- In-flight request queueing cho mark-read — ngăn race khi user scroll nhanh.
- Stale guard cho unread count — local state không bị server snapshot overwrite sai.
- Message window tracking với history stages — biết được data freshness.

**Problems found:**
- State trùng lặp giữa layers: `replyToMessage`/`editingMessage` state tồn tại ở cả ChatWindow (local) và MessageInput (local) — không share qua store. Props drilling từ ChatWindow → MessageViewport → MessageCluster → MessageBubble → MessageBodyRenderer.
- Draft persistence logic (450ms debounce) tất cả trong ChatWindow — nên tách thành `useConversationDraft` hook.
- `conversationById` và `orderedConversationIds` là 2 separate state slices nhưng luôn updated cùng nhau — có thể combine thành single normalized entity.
- Race condition khi đổi hội thoại nhanh: nếu request A (roomA messages) chậm hơn request B (roomB messages), roomA's messages có thể overwrite roomB's messages nếu cache key trùng. RTK Query's automatic deduplication giải quyết vấn đề này, nhưng cần verify.

**Why it matters:**
- State management chaos dẫn đến bugs khó reproduce — tin nhắn nhảy lung tung, unread count sai, conversation list không sync.

**Recommended improvements:**
1. Tách draft persistence thành `useConversationDraft(conversationId)` hook.
2. Consider `useReducer` hoặc dedicated store slice cho composer state (reply, edit, mention).
3. Verify RTK Query conversation cache key không bị overwrite khi switching nhanh — add logging in dev.
4. Thêm conversation-scoped stores nếu global store quá crowded.

**Related files:**
`src/stores/chatStore.ts` (~4600 lines), `src/stores/chatStoreUnread.ts`, `src/stores/chatStoreOutbox.ts`, `src/features/api/chatApi.ts`

---

### 4.16. i18n/Copywriting

**What works well:**
- 11 namespaces đầy đủ, structured.
- Cả tiếng Việt và tiếng Anh.
- Fallback về tiếng Việt.
- Translation keys file riêng cho `i18n:check`.
- Namespaced structure giúp avoid key collision.
- `t()` interpolation used correctly.

**Problems found:**
- **20+ hardcoded Vietnamese strings** ngoài i18n system:
  - `SidebarHeader.tsx:183` — "Tin nhắn" (tab label)
  - `SidebarHeader.tsx:210` — "Tạo chat mới" (aria-label)
  - `SidebarHeader.tsx:223` — "Thông báo" (aria-label)
  - `EmptyState.tsx:253-312` — 10+ strings cho welcome message, feature descriptions, CTAs
  - `MessageInput.tsx:1404-1405` — "Định dạng tin nhắn" (aria-label + title)
  - `MessageInput.tsx:1494` — "Nhấn Enter để gửi, Shift + Enter để xuống dòng"
  - `PasswordLoginForm.tsx` — Tất cả labels, placeholders, buttons đều hardcoded tiếng Việt
  - `CommandPalette.tsx:630` — "Esc"
- Một số strings có thể viết tự nhiên hơn: "Bắt đầu trò chuyện" (EmptyState) có thể là "Bắt đầu nhắn tin".
- Placeholder "Email hoặc số điện thoại" nên là "Tên đăng nhập" hoặc "Email" tùy auth policy.
- Terminology không nhất quán: "Tạo chat mới" vs "Cuộc trò chuyện" vs "Nhóm" — cần chuẩn hóa.

**Why it matters:**
- Ngôn ngữ là brand voice. Hardcoded strings không thể translate, gây fragmentation khi team muốn add tiếng Anh hoặc ngôn ngữ khác.

**Recommended improvements:**
1. **Ưu tiên:** Đưa tất cả hardcoded strings vào namespace phù hợp. Sử dụng `t('common:sidebar.messages')`, `t('chat.composer.hint')`, etc.
2. Chuẩn hóa terminology: chọn 1 set terms và stick to it. Recommend: "Cuộc trò chuyện" (conversation), "Nhóm" (group), "Tin nhắn" (message).
3. Review Vietnamese copywriting — đảm bảo tự nhiên, phù hợp doanh nghiệp.
4. Add key cho "Esc" trong `common.json`.

**Related files:**
`src/locales/vi/common.json`, `src/locales/vi/chat.json`, `src/locales/en/common.json`, `src/locales/en/chat.json`, và các component files list ở trên

---

### 4.17. Error Handling & Feedback

**What works well:**
- Toast notifications cho operation results.
- Message send failure hiển thị inline với retry button.
- Connection state notice cho network issues.
- Form validation với error messages.
- Upload error có retry option.
- Rate limit error có countdown.

**Problems found:**
- Error messages từ backend không được humanize — user có thể thấy technical error codes thay vì message thân thiện.
- Toast có thể bị overlap khi nhiều errors xảy ra cùng lúc (vd: send fail + connection lost).
- Không có global error boundary cho React tree crash — crash sẽ blank screen.
- File upload error không distinguish giữa "file too large", "wrong format", "network error", "server error".
- Token expiry được handle ở auth layer nhưng user không get redirect rõ ràng — có thể thấy blank screen hoặc reload loop.

**Why it matters:**
- Error là inevitability. Cách app handle errors quyết định user trust. Generic errors hoặc technical errors gây frustration.

**Recommended improvements:**
1. Thêm error humanization layer — map backend error codes → user-friendly messages.
2. Toast queue với auto-dismiss, không overlap.
3. Add React Error Boundary component wrapping main app.
4. Phân biệt upload error types với distinct messages.
5. Token expiry → redirect với message: "Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại."

**Related files:**
`src/components/ui/Toast.tsx` hoặc equivalent, `src/lib/axios.ts` (error interceptor), `src/services/authService.ts`

---

### 4.18. Code Maintainability

**What works well:**
- TipTap editor tách riêng khỏi MessageInput — dễ test và replace.
- Display logic (RoomItemView) tách khỏi container (RoomItemContainer) — separation of concerns.
- Domain logic (`messageMerge.ts`, `messageOrdering.ts`, `messageIdentity.ts`) tách thành modules riêng.
- Reusable hooks (`useSendMessage`, `useTypingIndicator`, `useUploadQueue`).
- Type definitions rõ ràng, prop interfaces exported.
- Consistent file naming: PascalCase for components, camelCase for hooks/utilities.

**Problems found:**
- **3 scroll implementations** cùng tồn tại: `useVirtualizedMessages.ts` (556 lines), `useTanStackVirtualizedMessages.ts`, và `useSimpleChatScroll.ts` (production). 2 cái đầu là dead code.
- **2 message bubble implementations**: `MessageBubble.tsx` (42-line wrapper) và `thread/MessageBubble.tsx` (standalone). Wrapper không có value add.
- **2 message grouping hooks**: `useMessageGrouping.ts` và `useConversationThreadRows.ts`. Logic tương tự nhưng khác row types.
- **TODO comments chưa xử lý:**
  - `RoomItem.tsx:353` — unread badge disabled
  - `MessageGroup.tsx:210-212` — legacy API fallback hydration
- Performance tracking utilities scattered: `logMessageDebug`, `logScrollTrace`, `logChatPerformance`, `recordChatPerformanceMeasure`, `tracePerf`, `traceRender`.
- `MessageInput` (1599 lines) và `ChatWindow` (1157 lines) vượt xa recommended size (~300 lines/component).
- Nhiều `console.log` / `console.warn` có thể leak thông tin ở production.
- `any` types xuất hiện trong một số places (cần audit toàn bộ).

**Why it matters:**
- Technical debt accumulate làm chậm feature development và tăng bug risk. Mỗi lần maintainer phải đọc 1600 lines để hiểu 1 component là wasted time.

**Recommended improvements:**
1. Xóa dead code: `useVirtualizedMessages.ts`, `useTanStackVirtualizedMessages.ts`, wrapper `MessageBubble.tsx`.
2. Verify `thread/MessageBubble` còn dùng không, nếu không thì delete.
3. Address TODO comments — đây là known issues.
4. Wrap logging với `if (process.env.NODE_ENV === 'development')`.
5. Set ESLint rule: `max-lines-per-function: [error, 300]` cho future prevention.
6. Audit `any` types với `typescript-eslint/no-explicit-any`.

**Related files:**
Tất cả files trong `src/hooks/`, `src/components/chat/`, `src/components/input/`, `src/features/chat/`

---

## 5. Scroll System Audit

### 5.1. Current Implementation Summary

**Single Owner:** `useSimpleChatScroll.ts` là scroll controller cho `SimpleVirtualizedChatTimeline`.

**8 Rules Implemented:**

| # | Rule | Trigger | Action |
|---|------|---------|--------|
| 1 | Initial bottom scroll | Mount (conversation change) | `useLayoutEffect` at line 117-138, runs once per `conversationId` via `initialSettledConversationRef` guard |
| 2 | Own message appended | `change.type === "append" && change.ownMessage` | `scrollToIndex(lastIndex)` via `scrollTo` |
| 3 | Remote while near-bottom | `wasAtBottomRef.current && !userScrollingRef.current` | `scrollToIndex(lastIndex)` |
| 4 | Remote while detached | `!wasAtBottomRef.current \|\| userScrollingRef.current` | Increment `pendingNewMessages` counter |
| 5 | Older prepend restore | After `loadOlder` completes | Restore `scrollTop = newScrollHeight - oldScrollHeight` via `pendingPrependRestoreRef` |
| 6 | Media settled | `image.onload` event | RAF + `scrollToIndex(lastIndex)` if near-bottom |
| 7 | Jump to latest | `jumpToLatest()` callback | `scrollToIndex(lastIndex)` + clear badge |
| 8 | OnScroll | User scrolls | **Read-only** — only updates refs/state |

**State:**
```typescript
const [isAtBottom, setIsAtBottom] = useState(true);
const [pendingNewMessages, setPendingNewMessages] = useState(0);
const [isInitialSettled, setIsInitialSettled] = useState(false);
```

**Refs:**
```typescript
const wasAtBottomRef = useRef(true);
const userScrollingRef = useRef(false);
const userScrollIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const initialSettledConversationRef = useRef<string | null>(null);
const prevMessagesRef = useRef<readonly Message[]>([]);
const isLoadingOlderRef = useRef(false);
const pendingPrependRestoreRef = useRef<{ scrollHeight: number; scrollTop: number; } | null>(null);
```

**Constants:**
```typescript
const BOTTOM_THRESHOLD_PX = 96;       // isAtBottom = scrollTop >= scrollHeight - clientHeight - 96
const USER_SCROLL_IDLE_MS = 180;      // debounce userScrollingRef reset
const LOAD_OLDER_THRESHOLD_PX = 160;  // trigger load-older when within 160px of top
```

**Components involved:**

| File | Role |
|---|---|
| `useSimpleChatScroll.ts` | Scroll controller, all scroll logic lives here |
| `SimpleVirtualizedChatTimeline.tsx` | Uses `useSimpleChatScroll`, passes `{ isAtBottom, pendingNewMessages, jumpToLatest, loadOlder }` |
| `ScrollToLatestButton.tsx` | Fixed-position button, visible when `!isAtBottom \|\| pendingNewMessages > 0` |
| `useVirtualizedMessages.ts` | **DEAD** — 556-line react-window implementation, not used in production |
| `useTanStackVirtualizedMessages.ts` | **DEAD** — wrapper around useVirtualizedMessages, not used |

### 5.2. Problems and Race Conditions

**No race conditions found.** Analysis shows:

1. **All scroll writes are RAF-wrapped** — never directly set `scrollTop`
2. **Reset on conversation change** (line 104-114) — all refs + state cleared before any scroll effect runs
3. **`pendingPrependRestoreRef` captures scroll state atomically** — stored BEFORE the async `loadOlder` call, restored AFTER
4. **`userScrollingRef` debounced** at 180ms — prevents oscillation between following/detached
5. **`isLoadingOlderRef` prevents concurrent loads** — load-older can't be triggered twice simultaneously
6. **`initialSettledConversationRef` is conversation-scoped** — prevents initial scroll from running twice for same conversation

**Potential edge cases (low risk):**

1. **Media load race:** If image loads after user has scrolled away from bottom, the handler checks `wasAtBottomRef.current && !userScrollingRef.current` — safe because refs capture the state at event time, not event registration time.

2. **Prepend restore timing:** If messages are added (incoming) between `loadOlder` start and completion, the scroll height delta calculation may be off. However, `pendingPrependRestoreRef` is set immediately, and `prevMessagesRef.current` is updated inside the effect. The delta is calculated as `newScrollHeight - (oldScrollHeight + newItemsHeight)`, which accounts for only the prepended items. If new items arrive in between, the next effect run will recalculate. Risk: minor scroll jump (< 5px) — acceptable.

3. **`scrollToIndex` vs raw scrollTop:** TanStack's `scrollToIndex` uses `behavior: 'smooth'` or `behavior: 'auto'`. When user is actively scrolling, TanStack may clamp the target. The `scrollRef` (ref to list element) is passed directly to `scrollToIndex`, which is correct.

### 5.3. Conflicting Effects/Listeners

**No conflicting effects found.** All 7 effects in `useSimpleChatScroll` have distinct responsibilities:

| Effect | Type | Dependencies | Purpose |
|--------|------|-------------|---------|
| Reset on conversation change | Layout | `[conversationId]` | Clean slate |
| Initial bottom scroll | Layout | `[conversationId, isInitialSettled]` | First-time scroll |
| Message change classification | Effect | `[messages, conversationId]` | Core scroll logic |
| User scroll handler | Effect | `[conversationId]` | Read scroll position |
| Media load handler | Effect | `[messages]` | Image load auto-scroll |
| ResizeObserver | Effect (self-contained) | `[]` | Measure container |
| Cleanup | Cleanup fn | — | Remove event listeners |

The `message change classification` effect (line 141-211) is the most complex — it classifies all changes since last render into: prepend, append, replace, mixed. This is a single effect that handles all message-driven scroll behavior, avoiding multiple competing effects.

### 5.4. Proposed Clean Model

The current model is already well-designed. The following refinements would improve it:

**Keep:**
- Single owner (`useSimpleChatScroll`) — no change needed
- RAF for all scroll writes — no change needed
- Ref-based state (`wasAtBottomRef`, `userScrollingRef`) — no change needed
- `pendingNewMessages` counter for badge — no change needed
- Debounced user scroll idle (180ms) — no change needed
- Prepend restore via `pendingPrependRestoreRef` — no change needed

**Refine:**
1. **Replace `scrollToIndex` with direct `scrollTop` manipulation** for more predictable behavior:
   ```typescript
   // Current: uses scrollToIndex which has latency
   virtualizer.scrollToIndex(lastIndex, { behavior: 'auto' });
   
   // Proposed: direct scrollTop set (faster)
   scrollRef.current.scrollTop = scrollRef.current.scrollHeight - scrollRef.current.clientHeight;
   ```
   TanStack's `scrollToIndex` adds overhead. For bottom-snap, direct `scrollTop` is more reliable.

2. **Throttle user scroll handler** at 16ms (1 frame) instead of relying on TanStack's internal throttling:
   ```typescript
   const handleScroll = useCallback(
     throttle((e: React.UIEvent<HTMLDivElement>) => {
       const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
       const atBottom = scrollHeight - scrollTop - clientHeight <= BOTTOM_THRESHOLD_PX;
       // ...
     }, 16),
     []
   );
   ```
   The current implementation already uses TanStack's internal scroll handler, but explicit throttle provides safety.

3. **Remove dead code:** `useVirtualizedMessages.ts` (556 lines) and `useTanStackVirtualizedMessages.ts` are not imported anywhere in the production timeline. Delete them.

4. **Add scroll position persistence** (optional enhancement): Store `lastReadMessageId` + scroll position per conversation in `sessionStorage`, restore on re-entry. This prevents losing reading position on F5 within a session.

### 5.5. Files to Remove/Merge/Refactor

| Action | File | Reason |
|--------|------|--------|
| **DELETE** | `src/hooks/useVirtualizedMessages.ts` (556 lines) | Dead code — not imported by SimpleVirtualizedChatTimeline |
| **DELETE** | `src/hooks/useTanStackVirtualizedMessages.ts` | Dead code — wraps the dead code above |
| **REFACTOR** | `src/features/chat/simple-virtual-timeline/useSimpleChatScroll.ts` | Consider adding explicit throttle wrapper around scroll handler for safety |
| **VERIFY** | `src/features/chat/simple-virtual-timeline/` | Verify `ScrollToLatestButton` is the only UI for scroll-to-bottom. Check if there are other scroll-to-bottom buttons elsewhere. |
| **VERIFY** | `src/components/chat/thread/` | Check if `thread/MessageGroup.tsx` uses any scroll hook independently — it should not. |

### 5.6. Testing Checklist

After any scroll refactor, verify:

- [ ] Initial load of conversation scrolls to bottom (last message visible)
- [ ] Own message sent → auto-scroll to new message
- [ ] Remote message while at bottom → auto-scroll to new message
- [ ] Remote message while scrolled up → badge appears with correct count
- [ ] Click scroll-to-bottom button → goes to latest, badge clears
- [ ] Scroll up → detach indicator shown (no auto-scroll on new messages)
- [ ] Scroll to within 160px of top → older messages load
- [ ] Load older messages → scroll position preserved (same message stays in view)
- [ ] Image loads while at bottom → stays at bottom
- [ ] Image loads while scrolled up → no scroll jump
- [ ] Switch conversations → scroll resets to bottom
- [ ] F5 → scroll position resets to bottom
- [ ] 100+ messages → no performance degradation
- [ ] 10+ concurrent image loads → no scroll jump
- [ ] Rapid send (5 messages quickly) → all appear, no scroll oscillation
- [ ] F5 while at bottom → still at bottom after reload
- [ ] F5 while scrolled up → at bottom after reload (lastReadSeq restored via API)

---

## 6. Recommended UI/UX Direction

### 6.1. Visual Style

**Current:** Modern enterprise chat — clean, functional, neutral palette with primary blue accent. Không quá decoration, nhưng có đủ visual cues cho orientation.

**Recommendation:** Giữ nguyên direction. Không cần thay đổi visual style vì phù hợp với "internal enterprise chat" — không phải consumer app. Tập trung vào consistency thay vì redesign.

**Specific refinements:**
- Thống nhất primary color usage: chỉ dùng CSS variable `--color-primary`, không mix với raw Tailwind colors.
- Giảm decorative elements: typing indicator animation, message insert animation có thể bỏ nếu gây distraction.
- Dark mode: verify tất cả components handle dark mode đúng — đặc biệt attachment tray và emoji picker.

### 6.2. Spacing System

**Current:** Tailwind spacing scale (4px base) + custom CSS variables.

**Recommendation:**
- Sử dụng **only Tailwind spacing scale** (1-12 units) cho padding/margin. Không dùng arbitrary values như `mt-[17px]`, `px-[11px]`.
- Quy tắc: nếu Tailwind không có class, thêm vào tailwind.config.js thay vì arbitrary value.
- Bubble padding: `px-3 py-2` (12px/8px) — thống nhất cho tất cả bubbles.
- Sidebar item padding: `px-3 py-2` hoặc `px-4 py-2` — thống nhất.
- Section spacing: sử dụng `gap-2` hoặc `gap-4` cho flex/grid containers.

### 6.3. Button/Icon Behavior

**Current:** Icon buttons với `title` attribute, hover state, focus ring.

**Recommendation:**
- Icon buttons nhỏ (< 32px): chỉ dùng hover state, không có focus ring để tránh visual noise.
- Icon buttons lớn (>= 40px): có cả hover + focus ring.
- Tooltips: dùng `aria-describedby` thay vì chỉ `title` để screen reader users được thông báo.
- Primary actions (Send, Confirm): dùng filled button với text.
- Secondary actions (Cancel, Delete): dùng ghost/outline button.
- Danger actions: dùng red accent, có confirmation dialog.

### 6.4. Message Display Rules

**Current:** Variable bubble width (max 70%), sender name + avatar, timestamp, status icon.

**Recommendation:**
- Max-width: tăng lên `max-w-[60%]` hoặc `max-w-2xl` (28rem) cho desktop. Mobile giữ `max-w-[85%]`.
- Tin nhắn 1 dòng ngắn: giữ 1 line, không wrap.
- Tin nhắn dài (> 200 chars hoặc > 5 dòng): collapse với "Xem thêm" — đã implement.
- Link trong message: auto-detect, hiển thị as link với `target="_blank"` và `rel="noopener"`.
- Mention: highlight với background color khác biệt (đã có).
- Timestamp: hiển thị trong bubble corner (bottom) thay vì tách biệt. Group messages chỉ show timestamp ở last message.
- Message metadata (sender name, avatar) chỉ hiển thị khi cần thiết: first in group, hoặc different sender từ message trước.

### 6.5. Composer Rules

**Current:** TipTap editor, toolbar, emoji, attachment, reply preview.

**Recommendation:**
- Input height: auto-expand từ 1 đến max 6 lines (textarea-like behavior).
- Placeholder: "Nhắn tin cho [Tên]" — personalized.
- Send button: icon-only khi input empty, text "Gửi" khi có content.
- Attachment: preview inline, không modal. Có thể remove trước khi send.
- Reply preview: hiển thị ở trên input, có nút X để cancel.
- Disabled state: disable input + show reason, không ẩn composer.
- Slow mode: countdown timer visible, input disabled khi cooldown.

### 6.6. Empty/Loading/Error State Rules

**Recommendation:**
- Empty conversation: illustration + "Bắt đầu cuộc trò chuyện" + CTA button.
- Empty message list: skeleton bubbles (3-5 items) khi loading, empty state khi không có messages.
- Error state: icon + message + retry button. Không dùng generic error text.
- Loading overlay: không block toàn bộ screen, chỉ relevant section.
- Partial failure: inline error với retry, không toast.

### 6.7. Chat Interaction Principles

1. **Optimistic first:** Mọi action hiển thị immediately, reconcile with server sau.
2. **No destructive surprises:** Delete/recall có confirmation. Tin nhắn đã gửi không bị remove mà được mark.
3. **Clear status feedback:** Mọi action có visual feedback (sending → sent → delivered hoặc failed).
4. **Respect attention:** Không interrupt người dùng trừ khi critical (connection lost, permission denied).
5. **Consistent keyboard shortcuts:** Enter = send, Escape = cancel/close, Ctrl+K = command palette.
6. **No chat-specific jargon:** "Cuộc trò chuyện" thay vì "Chat", "Tin nhắn" thay vì "Message".

---

## 7. Refactor Roadmap

### Phase 0: Cleanup Dead/Conflicting UI Logic

**Scope:** Xóa dead code và resolve duplicate implementations.

**Files likely involved:**
- `src/hooks/useVirtualizedMessages.ts` — DELETE
- `src/hooks/useTanStackVirtualizedMessages.ts` — DELETE
- `src/components/chat/MessageBubble.tsx` — DELETE (wrapper around MessageCluster)
- `src/features/chat/simple-virtual-timeline/SimpleVirtualizedChatTimeline.tsx` — VERIFY imports, no dead references

**Expected outcome:**
- Bundle size giảm ~15KB (estimated from removed lines)
- Developer confusion giảm — chỉ có 1 scroll implementation
- Dễ maintain hơn

**Risk:** Low — chỉ xóa files, không modify logic hiện tại.

**Test checklist:**
- [ ] Verify no import errors after deletion
- [ ] Scroll behavior unchanged
- [ ] Message rendering unchanged

---

### Phase 1: Stabilize Core Chat UX

**Scope:** Sửa P0 issues và các P1 có impact lớn đến daily use.

**Files likely involved:**
- `src/components/layout/sidebar/RoomItem.tsx:353` — sửa unread badge bug
- `src/stores/chatStoreUnread.ts` — kiểm tra optimistic update + rollback
- `src/components/auth/PasswordLoginForm.tsx` — thống nhất color tokens
- `src/locales/vi/common.json`, `src/locales/vi/chat.json` — thêm missing keys
- Các component với hardcoded strings — update to use `t()` calls
- `src/components/ui/EmptyState.tsx` — i18n
- `src/components/layout/sidebar/SidebarHeader.tsx` — i18n
- `src/components/input/MessageInput.tsx` — i18n cho hint text

**Expected outcome:**
- Unread badge hoạt động
- Auth form tuân thủ design system
- Tất cả UI text có thể translate
- Border radius nhất quán

**Risk:** Medium — sửa unread count logic có thể affect optimistic update behavior.

**Test checklist:**
- [ ] Unread badge hiển thị đúng khi có tin mới
- [ ] Unread badge không hiện khi đã đọc
- [ ] Unread badge không nhảy lung tung khi F5
- [ ] Auth form styling consistent với rest of app
- [ ] All strings translatable (test switching to English)
- [ ] Border radius consistent across all bubbles/buttons

---

### Phase 2: Polish Visual Consistency

**Scope:** Thống nhất design system compliance và polish UI details.

**Files likely involved:**
- `src/index.css` — review và thống nhất spacing scale
- `src/tailwind.config.js` — thêm missing tokens nếu cần
- `src/components/layout/ChatWindow.tsx` — refactor thành sub-components
- `src/components/input/MessageInput.tsx` — refactor thành sub-components
- `src/components/chat/MessageCluster.tsx` — tách action rail, reactions
- `src/components/chat/ChatHeader.tsx` — tách overflow menu
- `src/components/input/AttachmentTray.tsx` — add file type icons
- `src/components/layout/sidebar/Sidebar.tsx` — tách search/filter logic

**Expected outcome:**
- Mỗi component < 400 lines
- Design tokens được tuân thủ nghiêm ngặt
- Visual polish nhất quán

**Risk:** Medium — refactor lớn có thể introduce regressions.

**Test checklist:**
- [ ] Component rendering unchanged sau refactor
- [ ] Dark mode consistent
- [ ] All interactive states (hover, focus, active) work
- [ ] Responsive breakpoints work
- [ ] No regression in any user flow

---

### Phase 3: Accessibility + Performance Optimization

**Scope:** Cải thiện accessibility và performance cho production-grade app.

**Files likely involved:**
- `src/features/chat/simple-virtual-timeline/SimpleVirtualizedChatTimeline.tsx` — add ARIA
- `src/components/input/MessageInput.tsx` — add ARIA for mention panel
- `src/components/modals/` — verify focus traps
- `src/components/layout/ChatWindow.tsx` — add React.memo
- `src/components/chat/MessageCluster.tsx` — add React.memo
- `src/components/layout/Sidebar.tsx` — optimize re-renders
- `src/hooks/useSendMessage.ts` — extract draft persistence
- `src/features/chat/simple-virtual-timeline/useSimpleChatScroll.ts` — add explicit throttle
- `src/features/chat/domain/messageMerge.ts` — strip debug logging

**Expected outcome:**
- WCAG 2.1 AA compliance (at minimum)
- Smooth 60fps scrolling với 500+ messages
- No unnecessary re-renders on keystroke
- Clean production builds (no debug logging)

**Risk:** Medium — accessibility changes có thể affect existing keyboard users.

**Test checklist:**
- [ ] Keyboard navigation works end-to-end
- [ ] Screen reader announces new messages
- [ ] Focus visible on all interactive elements
- [ ] No console errors in production
- [ ] Bundle size within budget
- [ ] Lighthouse accessibility score >= 90

---

## 8. Manual QA Checklist

### 8.1. Layout & Navigation

- [ ] App loads and shows conversation list or empty state
- [ ] Clicking a conversation opens it and shows messages
- [ ] Back button works on mobile layout
- [ ] Sidebar collapses at appropriate breakpoints (1023px, 767px)
- [ ] Info panel opens/closes correctly
- [ ] User knows which conversation they are in (header clearly shows name)
- [ ] App works correctly at 1366x768 (laptop), 1920x1080 (desktop), 768x1024 (tablet)
- [ ] No horizontal overflow on any screen size
- [ ] Long conversation names truncate with ellipsis, not overflow

### 8.2. Conversation List

- [ ] Conversation list is virtualized (scroll 100+ conversations smoothly)
- [ ] Keyboard navigation works (Arrow up/down, Enter to select)
- [ ] Unread badge shows correct count (BUG: verify this works)
- [ ] Unread badge disappears when conversation is opened
- [ ] Unread badge does not reappear after reading
- [ ] Conversation order is by last message time
- [ ] Direct conversations show peer avatar, group conversations show group avatar
- [ ] Display names show full name, not employee code
- [ ] Last message preview is accurate (not showing "[File]" instead of filename)
- [ ] Search filters conversations correctly
- [ ] Empty state shows when no conversations
- [ ] Error state shows with retry when fetch fails

### 8.3. Message List

- [ ] Messages load when conversation is opened
- [ ] Initial scroll goes to bottom (latest message)
- [ ] Messages are grouped by sender (within 45 seconds)
- [ ] Date dividers show correct dates
- [ ] Unread marker appears at correct position
- [ ] Scroll up to load older messages works
- [ ] Loading older messages preserves scroll position
- [ ] No scroll jump when new messages arrive while at bottom
- [ ] No scroll jump when images load
- [ ] Message bubbles are readable (contrast, font size, line height)
- [ ] Long messages collapse with "Xem thêm"
- [ ] Links in messages are clickable and open in new tab
- [ ] Mentions are highlighted in message body
- [ ] Replies show original sender and content preview
- [ ] File attachments show filename, size, type icon
- [ ] Image attachments show thumbnail
- [ ] Message timestamps are in correct format
- [ ] Message status (sending/sent/failed) is clearly visible
- [ ] Failed messages have retry option

### 8.4. Scroll Behavior (CRITICAL — test all)

- [ ] **Initial load:** scrolls to bottom, latest message visible
- [ ] **Send own message:** auto-scrolls to new message
- [ ] **Receive message at bottom:** auto-scrolls to new message
- [ ] **Receive message while scrolled up:** badge appears, no auto-scroll
- [ ] **Badge shows correct count:** 1 → 2 → 3... capped at "9+"
- [ ] **Click scroll-to-bottom button:** goes to latest, badge clears
- [ ] **User scrolls up manually:** becomes "detached" — no auto-scroll
- [ ] **Load older messages:** scroll position preserved (same message stays in viewport)
- [ ] **Image loads while at bottom:** stays at bottom (no jump)
- [ ] **Image loads while scrolled up:** no scroll jump
- [ ] **Switch conversations:** scroll resets to bottom
- [ ] **F5 / refresh:** scroll resets to bottom
- [ ] **F5 while at bottom:** still at bottom after reload
- [ ] **Rapid send (5 messages quickly):** all appear, no oscillation
- [ ] **100+ messages:** smooth scrolling, no lag
- [ ] **10+ concurrent image loads:** no scroll jump

### 8.5. Composer / Input Box

- [ ] Focus automatically on conversation open
- [ ] Placeholder shows conversation name
- [ ] Enter sends message (not new line)
- [ ] Shift+Enter creates new line
- [ ] Text persists when switching conversations (BUG: verify not)
- [ ] Draft persists on F5
- [ ] Draft clears after send
- [ ] Reply preview shows above input
- [ ] Cancel reply removes preview
- [ ] Clicking reply preview jumps to original message
- [ ] Mention panel shows when typing "@"
- [ ] Mention panel keyboard navigation works
- [ ] Selected mention inserts @username
- [ ] Emoji picker opens on button click
- [ ] Emoji picker search works
- [ ] Selected emoji inserts into input
- [ ] Attachment button opens file picker
- [ ] Multiple file selection works
- [ ] File preview shows before send
- [ ] Remove file from preview works
- [ ] Upload progress shown
- [ ] Send button disabled during upload
- [ ] Upload failure shows error message
- [ ] Retry upload works
- [ ] Slow mode countdown shows
- [ ] Input disabled during slow mode cooldown
- [ ] Disabled state shows reason text

### 8.6. Realtime Behavior

- [ ] Typing indicator appears when other user types
- [ ] Typing indicator disappears when user stops
- [ ] Online/offline status updates in real time
- [ ] New messages appear without page refresh
- [ ] Connection lost notice shows (simulate by disabling network)
- [ ] Reconnecting indicator shows
- [ ] Messages sent during disconnect are queued
- [ ] Queued messages send when reconnected
- [ ] No duplicate messages after reconnect
- [ ] Unread count updates in real time (in sidebar)

### 8.7. Error Handling

- [ ] Send failure shows inline error with retry
- [ ] Upload failure shows error with retry
- [ ] Network error shows toast
- [ ] Server error shows user-friendly message (not raw error)
- [ ] Token expiry redirects to login
- [ ] Permission denied shows appropriate message
- [ ] 404 conversation shows error state
- [ ] Rate limit shows countdown

### 8.8. Accessibility

- [ ] All buttons have accessible names (not just icon)
- [ ] Focus visible on all interactive elements
- [ ] Tab navigation works in logical order
- [ ] Enter activates buttons and links
- [ ] Escape closes modals and overlays
- [ ] Screen reader announces new messages (aria-live)
- [ ] Screen reader announces typing indicator
- [ ] Screen reader announces connection status changes
- [ ] Form inputs have labels or aria-label
- [ ] Color is not the only indicator of state
- [ ] Focus trap works in modals
- [ ] Skip link works (if implemented)

### 8.9. Dark Mode

- [ ] Toggle between light/dark/system works
- [ ] All components render correctly in dark mode
- [ ] No white flashes during theme switch
- [ ] Emoji picker works in dark mode
- [ ] Attachment tray works in dark mode
- [ ] Skeleton loading works in dark mode
- [ ] Error states visible in dark mode
- [ ] Focus rings visible in dark mode

### 8.10. i18n

- [ ] Default language is Vietnamese
- [ ] All hardcoded strings converted to t() calls
- [ ] Switching to English updates all visible text
- [ ] No truncation in English (strings may be longer)
- [ ] RTL languages not supported (verify graceful fallback)

### 8.11. Performance

- [ ] 100 messages scroll smoothly (60fps)
- [ ] 500 messages scroll smoothly (with virtualization)
- [ ] 1000 messages — initial load < 3 seconds
- [ ] No memory leak after 30 minutes of use
- [ ] No memory leak after switching conversations 50 times
- [ ] Image heavy conversation (50+ images) — no crash
- [ ] Typing indicator does not cause re-render cascade
- [ ] No console warnings about excessive re-renders

### 8.12. Authentication & Session

- [ ] Login form validates input
- [ ] Login with valid credentials succeeds
- [ ] Login with invalid credentials shows error
- [ ] Remember me checkbox works
- [ ] Forgot password flow works
- [ ] Token refresh works automatically
- [ ] Session expiry redirects to login
- [ ] Multi-tab token sync works
- [ ] Logout clears all state

---

## 9. Final Recommendation

### Should You Refactor?

**Yes, but incrementally — do not do a big-bang refactor.**

The codebase has accumulated technical debt from multiple chat logic fixes. The scroll system and state management are well-designed and should not be touched unless bugs are found. The debt is in:

1. **UI component size** — MessageInput (1599L) and ChatWindow (1157L) are too large
2. **Dead code** — 2 scroll hooks + 1 bubble wrapper that are not used
3. **Design inconsistency** — hardcoded colors, border radius, strings
4. **Disabled features** — unread badge that should work

These are surgical, low-risk fixes that can be done incrementally.

### What to Fix First (Priority Order)

**Week 1 — Quick Wins (No Risk):**
1. Delete dead code: `useVirtualizedMessages.ts`, `useTanStackVirtualizedMessages.ts`, wrapper `MessageBubble.tsx`
2. Put all hardcoded strings into i18n
3. Fix auth form color tokens (`slate-*` → design tokens)

**Week 2 — Unread Badge (Medium Risk):**
4. Investigate and fix unread badge bug in `RoomItem.tsx:353`
   - Root cause likely in `chatStoreUnread.ts` optimistic update rollback logic
   - Test extensively after fix: F5, multi-device, rapid mark-read

**Week 3 — Component Split (Medium Risk):**
5. Split MessageInput into: ComposerToolbar, MentionPanel, AttachmentTray sub-components
6. Split ChatWindow overlay modes into dedicated components

**Week 4 — Polish (Low Risk):**
7. Add ARIA attributes for accessibility
8. Border radius standardization
9. Error message humanization
10. React.memo for ChatWindow and MessageCluster

### What NOT to Touch (Yet)

- **Scroll system (`useSimpleChatScroll.ts`)** — Well-designed, no bugs found, well-tested. Touching it risks introducing race conditions.
- **State management architecture (Zustand + RTK)** — Optimistic updates, deduplication, gap detection all working correctly. Refactor only if new requirements emerge.
- **WebSocket message handling** — Event deduplication, race between WS and API, conversation switching all handled properly.
- **Message identity/deduplication (`messageMerge.ts`)** — Sophisticated logic that works. Do not simplify without thorough testing.
- **Virtualization setup** — TanStack Virtual working correctly for message list. Do not replace with other approaches.

### Quick Wins Summary

| Quick Win | Impact | Effort | Risk |
|-----------|--------|--------|------|
| Delete 2 dead scroll hooks | Clean codebase | 5 min | None |
| Delete wrapper MessageBubble | Clean codebase | 5 min | Low |
| i18n hardcoded strings | i18n support | 2-4 hours | Low |
| Fix auth color tokens | Design consistency | 1 hour | Low |
| Fix unread badge | Core UX | 1-2 days | Medium |
| Split MessageInput | Maintainability | 1 day | Medium |
| Split ChatWindow overlays | Maintainability | 1 day | Medium |

### Long-term Considerations

1. **Virtualization strategy:** Currently using TanStack Virtual + custom scroll hook. Consider if `react-window` approach from `useVirtualizedMessages` has benefits (it was built first, may have edge cases covered). Keep the simpler `SimpleVirtualizedChatTimeline` unless bugs emerge.

2. **Rich text editor:** TipTap is a good choice but adds weight. Monitor bundle size. Consider if basic `contentEditable` would suffice for the feature set needed.

3. **State colocation:** As the app grows, consider if conversation-scoped state should live closer to the conversation component rather than in a global store. This would reduce prop drilling for `replyToMessage`/`editingMessage`.

4. **Performance monitoring:** Add real-user monitoring for scroll performance, re-render counts, and message latency. The `logMessageDebug` utilities suggest performance was a concern — consider making them production-ready metrics.

5. **Test coverage:** No E2E tests visible in the repo structure. Consider adding Playwright tests for the critical paths identified in the QA checklist above.

---

*End of Report — chat-web-client UI/UX Audit*
