# REFACTOR_UI_PLAN.md

Kế hoạch refactor UI cho `chat-web-client` theo giao diện Hacom Holding/Hacom Chat tham chiếu.

## 1. Mục tiêu refactor

1. Dựng lại UI theo một design system thống nhất: side rail xanh, module sidebar, content area, card, list, form, modal, toast.
2. Bám sát các màn chat trong ảnh: chat list, empty welcome, chat thread, attachment, poll, rich composer, archive, audio/video call.
3. Giữ nguyên logic/API hiện có nhiều nhất có thể; refactor lớp trình bày và component structure trước.
4. Chuẩn hóa tiếng Việt, spacing, màu, trạng thái active/hover/loading/error.
5. Tạo nền để các module phụ như contacts/settings/tasks/calendar không lệch visual với chat.

## 2. Nguyên tắc kỹ thuật

- Không rewrite toàn bộ app khi chưa cần; tách refactor thành phase nhỏ có thể build/test từng bước.
- Không đổi contract API, route quan trọng, auth flow nếu chưa có yêu cầu.
- Ưu tiên CSS variables hoặc Tailwind theme token thay vì inline style.
- Tách shared layout trước rồi mới refactor từng page.
- Component nhận data qua props; tránh fetch trực tiếp trong component UI thuần.
- Mọi màn cần có loading/empty/error state.
- Sau mỗi phase phải chạy build/lint/test hiện có.

## 3. Phase 0 - Audit repository

### Việc cần làm

- Xác định stack: React/Vite/Next, Tailwind/CSS module/SCSS, state management, routing.
- Liệt kê routes hiện có: auth, chat, contacts, groups, tasks, settings, files, notifications.
- Tìm các component đang trùng lặp: sidebar, chat list, button, input, modal, toast.
- Chụp/snapshot giao diện hiện tại nếu có.
- Xác định dữ liệu mock/API cho conversation, message, user, poll, file.

### Output

- `UI_AUDIT.md` ngắn: stack, routes, component duplication, rủi ro, thứ tự refactor.
- Không sửa code lớn ở phase này ngoài việc thêm docs nếu cần.

## 4. Phase 1 - Design tokens và shared UI foundation

### Việc cần làm

- Tạo/cập nhật `tokens.css`, Tailwind config hoặc theme provider.
- Đưa các token màu, spacing, radius, shadow, typography từ `CHAT_UI_SPEC.md` vào code.
- Chuẩn hóa global CSS: body background, font, scrollbar, focus ring.
- Tạo/cập nhật shared components:
  - `Button`
  - `IconButton`
  - `Input`
  - `SearchInput`
  - `Avatar`
  - `Badge`
  - `Card`
  - `Tabs/FilterPills`
  - `Toggle`
  - `Dialog`
  - `Toast`
  - `Skeleton`

### Acceptance criteria

- Không còn hard-code primary blue rải rác ở component mới.
- Button/input/tabs/card giống tinh thần ảnh: nhẹ, trắng, border mảnh, xanh Hacom cho CTA.
- Focus state nhìn rõ bằng keyboard.

## 5. Phase 2 - AppShell, SideRail, ModuleSidebar

### Việc cần làm

- Tạo `AppShell` dùng grid/flex:
  - `SideRail` 48px.
  - `ModuleSidebar` 260-300px khi route cần.
  - `MainContent` flex: 1.
  - `RightPanel` optional.
- Refactor navigation hiện có sang `SideRail`.
- Chuẩn hóa active route, hover, tooltip, bottom avatar/settings.
- `ModuleSidebar` nhận title, action, search, filters, children list.

### Acceptance criteria

- Các route chính giữ cùng khung nhìn, không nhảy layout.
- Rail xanh full height, icon active rõ.
- Sidebar scroll độc lập, content scroll độc lập.
- Chat route hiển thị giống bố cục trang 3/4/23/24.

## 6. Phase 3 - Chat core UI

Đây là phase quan trọng nhất.

### 6.1 Conversation list

- Tạo `ConversationList` và `ConversationListItem`.
- Hỗ trợ avatar/initials, online status, unread count, active state, last sender prefix, timestamp.
- Search input và filter pills: `Tất cả`, `Chưa đọc`, `Ưu tiên`.

Acceptance:

- Item active có nền xanh nhạt.
- Snippet truncate 2 dòng.
- Unread badge đúng vị trí.

### 6.2 Chat header

- Tạo `ChatHeader`.
- Hiển thị avatar, title, meta, action icons: search, phone, video, info/more.
- Sticky top trong content.

Acceptance:

- Header cao 56px, border-bottom, không scroll cùng message.

### 6.3 Message list và bubble

- Tạo `MessageList`, `MessageGroup`, `MessageBubble`.
- Hỗ trợ incoming/outgoing, group sender name/avatar, timestamps, date divider, reactions.
- Bubble max-width 560-680px desktop, 82% mobile.

Acceptance:

- Tin của mình align right, nền xanh, chữ trắng.
- Tin người khác align left, nền xám/trắng.
- Vùng chat nhiều khoảng trắng giống ảnh, không đặc kín.

### 6.4 Attachments/images/system messages

- Tạo `AttachmentCard`, `ImageMessage`, `SystemMessageChip`.
- PDF/Excel/Doc icons hoặc màu theo loại file.
- Download/open actions nếu logic có sẵn.

Acceptance:

- Attachment card giống trang 4/20/21: icon file, tên, size, action.
- Ảnh preview radius nhẹ, không méo.

### 6.5 Composer

- Tạo `MessageComposer`.
- Compact mode mặc định; rich mode khi nhập dài hoặc theo prop.
- Toolbar: attachment, emoji, mention, poll, formatting nếu hiện có.
- Enter gửi, Shift+Enter xuống dòng.
- Disable send khi empty.

Acceptance:

- Composer sticky bottom.
- Không che message cuối.
- Gửi tin dài không phá layout, giống trang 27.

### 6.6 Empty welcome

- Tạo `EmptyChatWelcome`.
- Center illustration + 3 card CTA + footer encrypted.

Acceptance:

- Khi chưa chọn conversation hiển thị trạng thái chào mừng giống trang 3.

## 7. Phase 4 - Chat advanced features

### 7.1 Poll

- Tạo `PollCreateDialog` và `PollCard`.
- Dialog overlay giống trang 25.
- Poll result card giống trang 26.

Acceptance:

- Có tối thiểu 2 option.
- Có toggle multiple/anonymous.
- Progress bar hiển thị percent/votes.
- Footer có tổng votes, xem chi tiết, bình chọn lại.

### 7.2 Chat archive/media

- Tạo route hoặc tab `ChatArchivePage`.
- Header: `Kho lưu trữ - [Tên nhóm]`.
- Tabs: ảnh/video, tệp tin, đường dẫn, người gửi, âm thanh.
- Media grid theo tháng.

Acceptance:

- Grid ảnh giống trang 22, giữ ratio, group theo tháng.

### 7.3 Audio/video call

- Tạo `AudioCallDialog` và `VideoCallView`.
- Audio: modal center trên backdrop.
- Video: full screen view với controls bottom center, self preview bottom right.

Acceptance:

- Trạng thái `Đang gọi...`, duration, hangup red.
- Backdrop không làm mất context chat với audio call.

## 8. Phase 5 - Refactor module phụ theo shared shell

Ưu tiên sau chat để tránh scope quá lớn.

1. Contacts/Profile/Directory: trang 1, 2, 8, 12.
2. Settings/Auth/Toast: trang 9-17.
3. Groups: trang 18.
4. Tasks/Notifications/Cloud/Calendar/Search/Internal News: trang 5-7, 19-21.

Mục tiêu không nhất thiết hoàn thiện toàn bộ nghiệp vụ, nhưng visual shell và shared components phải thống nhất.

## 9. Phase 6 - Responsive, accessibility, QA

### Responsive

- Desktop >=1200: full shell.
- Tablet 900-1199: sidebar hẹp, right panel drawer.
- Mobile <640: list/detail tách view, rail chuyển bottom nav hoặc drawer.

### Accessibility

- `aria-label` cho icon button.
- Dialog trap focus, close Esc.
- Focus ring.
- Message list `aria-live="polite"`.
- Contrast AA.

### QA checklist

- Build/lint/test pass.
- Không console error.
- Scroll chat list và message list độc lập.
- Header/composer không bị scroll mất.
- Empty/loading/error states đầy đủ.
- Long Vietnamese text không vỡ layout.
- File name dài ellipsis.
- Modal poll ở giữa và responsive.
- Audio/video overlay đúng z-index.
- Theme tiếng Việt thống nhất.

## 10. Suggested implementation order by files

Thứ tự sửa gợi ý:

1. `src/styles/tokens.css`, `src/styles/globals.css` hoặc Tailwind theme.
2. `src/shared/ui/*`.
3. `src/shared/layout/SideRail.tsx`.
4. `src/shared/layout/ModuleSidebar.tsx`.
5. `src/shared/layout/AppShell.tsx`.
6. `src/features/chat/types.ts`.
7. `src/features/chat/components/ConversationListItem.tsx`.
8. `src/features/chat/components/ConversationList.tsx`.
9. `src/features/chat/components/ChatHeader.tsx`.
10. `src/features/chat/components/MessageBubble.tsx`.
11. `src/features/chat/components/AttachmentCard.tsx`.
12. `src/features/chat/components/PollCard.tsx`.
13. `src/features/chat/components/PollCreateDialog.tsx`.
14. `src/features/chat/components/MessageComposer.tsx`.
15. `src/features/chat/components/EmptyChatWelcome.tsx`.
16. `src/features/chat/pages/ChatPage.tsx`.
17. `src/features/chat/pages/ChatArchivePage.tsx`.
18. `src/features/chat/components/AudioCallDialog.tsx`.
19. `src/features/chat/components/VideoCallView.tsx`.
20. Refactor các page phụ sang shared layout.

## 11. Definition of done

Refactor được xem là đạt khi:

- Chat desktop nhìn cùng cấu trúc với trang 3/4/23/24/26/27.
- Side rail xanh + module sidebar + main header dùng lại cho các module.
- Poll modal/card hoạt động và bám trang 25/26.
- Composer compact/rich hoạt động, hỗ trợ Enter/Shift+Enter.
- Empty welcome state xuất hiện khi chưa chọn chat.
- Audio/video call state có UI bám trang 28/29.
- Auth/settings/toast không lệch khỏi design system.
- Build pass và không phá data flow hiện có.
