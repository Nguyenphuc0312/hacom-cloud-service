# CHAT_UI_SPEC.md

Bản đặc tả giao diện cho dự án `chat-web-client`, bám theo bộ màn hình Hacom Holding/Hacom Chat trong PDF tham chiếu 29 trang.

## 1. Nhận diện sản phẩm

`chat-web-client` không nên được xem là một trang chat đơn lẻ. Giao diện tham chiếu thể hiện một bộ **Internal Communication Suite** gồm: Tin nhắn, Danh bạ, Quản lý nhóm, Công việc, Lịch, Lưu trữ/Cloud, Thông báo, Tìm kiếm toàn cục, Kênh nội bộ, Cài đặt, Đăng nhập/OTP/Đăng ký và trạng thái gọi audio/video.

Tinh thần giao diện: enterprise, sạch, sáng, nhiều khoảng trắng, sidebar xanh Hacom cố định, panel phụ bên trái, vùng nội dung chính rộng, các card trắng viền mảnh, hành động chính màu xanh đậm.

Các màn hình chat quan trọng nhất cần bám sát: trang 3, 4, 22, 23, 24, 25, 26, 27, 28, 29. Các màn hình hệ thống/phụ trợ cần dùng để đồng bộ layout: trang 1, 2, 5-21.

## 2. Ngôn ngữ thiết kế cốt lõi

### 2.1 Layout tổng thể

Desktop chuẩn theo ảnh tham chiếu là layout 3 lớp:

```txt
┌──────────────┬────────────────────┬─────────────────────────────────────────────┐
│ Side Rail    │ Module Sidebar     │ Main Content                                │
│ 48px         │ 260-300px          │ flex: 1                                     │
│ xanh Hacom   │ trắng/xám rất nhạt │ trắng/xám nhạt, header + content + composer │
└──────────────┴────────────────────┴─────────────────────────────────────────────┘
```

- `SideRail`: rộng 48px, full height, nền xanh Hacom, icon trắng hoặc trắng mờ, active item có nền xanh đậm/sáng hơn và/hoặc vạch chỉ báo.
- `ModuleSidebar`: rộng khuyến nghị 280px, nền trắng hoặc `#F8FAFC`, border-right 1px, chứa title module, search, filter pills, danh sách.
- `MainContent`: flex column, full height, nền `#F4F6F8` hoặc `#F7F8FA`. Với chat, header và composer màu trắng, vùng message màu xám nhạt.
- Một số module có `RightPanel` 300-360px: chi tiết file, chi tiết sự kiện, activity/comments, group details.

### 2.2 Design tokens đề xuất

Các mã màu dưới đây là ước lượng từ ảnh tham chiếu, nên map lại với brand token chính thức nếu repo đã có.

```css
:root {
  --hc-primary-900: #003B8F;
  --hc-primary-800: #004AAD;
  --hc-primary-700: #0057C8;
  --hc-primary-600: #0066E6;
  --hc-primary-500: #0B74FF;
  --hc-primary-100: #EAF3FF;
  --hc-primary-50:  #F3F8FF;

  --hc-cyan-500: #22C7E8;
  --hc-success-600: #16A34A;
  --hc-warning-500: #F59E0B;
  --hc-danger-600:  #DC2626;
  --hc-danger-50:   #FEF2F2;

  --hc-bg-app:      #F4F6F8;
  --hc-bg-page:     #F7F8FA;
  --hc-surface:     #FFFFFF;
  --hc-surface-soft:#F8FAFC;
  --hc-border:      #E5E7EB;
  --hc-border-soft: #EEF0F3;

  --hc-text-900: #111827;
  --hc-text-700: #374151;
  --hc-text-500: #6B7280;
  --hc-text-400: #9CA3AF;
  --hc-text-inverse: #FFFFFF;

  --hc-shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.06);
  --hc-shadow-md: 0 8px 24px rgba(15, 23, 42, 0.10);
  --hc-shadow-modal: 0 20px 40px rgba(15, 23, 42, 0.20);

  --hc-radius-xs: 4px;
  --hc-radius-sm: 6px;
  --hc-radius-md: 8px;
  --hc-radius-lg: 12px;
  --hc-radius-xl: 16px;

  --hc-rail-width: 48px;
  --hc-sidebar-width: 280px;
  --hc-header-height: 56px;
  --hc-composer-min-height: 48px;
}
```

### 2.3 Typography

- Font: ưu tiên `Inter`, fallback `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- `PageTitle`: 20px/28px, weight 600.
- `SectionTitle`: 14px/20px, weight 600, uppercase khi là nhóm sidebar như `TIN TỨC`, `CÂU LẠC BỘ`.
- `Body`: 14px/20px, weight 400.
- `BodySmall`: 13px/18px.
- `Meta`: 12px/16px, màu `--hc-text-500`.
- Tên người/nhóm trong list: 14px/20px, weight 600.
- Snippet trong list: 13px/18px, 2 dòng tối đa.

### 2.4 Spacing

Dùng thang 4px:

```txt
4, 8, 12, 16, 20, 24, 32, 40, 48
```

Quy chuẩn:

- Padding card: 16-20px.
- Gap giữa card: 12-16px.
- Padding chat bubble: 10px 14px.
- Gap message: 8px trong cùng sender, 16px giữa sender khác nhau.
- Padding page main: 20-24px, riêng màn chat message area cần rộng và thoáng.

## 3. App Shell

### 3.1 SideRail

Bám theo hầu hết các trang: thanh xanh nằm sát trái, logo chữ `H`/`HC` trên cùng, nhóm icon điều hướng giữa, avatar/cài đặt dưới cùng.

Yêu cầu:

- Width: 48px desktop.
- Background: `--hc-primary-700` hoặc `--hc-primary-800`.
- Logo: square 32x32, margin top 8px, chữ `H`, `HC`, hoặc brand mark.
- Nav item: 40x40, icon 18-20px, center.
- Active: nền trắng alpha 16-20% hoặc vạch trắng 3px ở cạnh trái/phải; icon trắng rõ.
- Tooltip khi hover nếu chỉ hiển thị icon.
- Bottom group: help/settings/bell/avatar tùy module.

Menu route gợi ý theo tiếng Việt:

1. Tin nhắn
2. Danh bạ
3. Khám phá/Kênh nội bộ
4. Công việc
5. Lịch
6. Lưu trữ
7. Thông báo
8. Cài đặt

### 3.2 ModuleSidebar

Dạng dùng lại cho chat, contacts, group, search, calendar, settings.

- Header: 56px, title trái, action icon phải nếu có.
- Search: input cao 36px, radius 8, icon search trái, placeholder theo module.
- Filter pills: cao 28-32px, radius 999px, active nền xanh nhạt, text xanh đậm.
- List area scroll độc lập.
- Active item: nền `--hc-primary-50`, border-left/right xanh hoặc outline nhạt.

### 3.3 Main Header

Dùng cho chat và các module nội dung.

- Height: 56px.
- Border-bottom: 1px solid `--hc-border`.
- Background: white.
- Left: avatar/icon + title + meta.
- Right: search, phone, video, more, info tùy màn.
- Icon button: 32-36px, radius 8, hover background `#F3F4F6`.

## 4. Chat module specification

### 4.1 Chat empty/welcome state

Tham chiếu trang 3.

Khi chưa chọn hội thoại:

- Vùng chính center cả ngang dọc.
- Illustration square khoảng 160x160.
- Title: `Welcome to Hacom Holding` hoặc bản Việt hóa `Chào mừng đến Hacom Chat`.
- Subtitle: mô tả nền tảng liên lạc bảo mật, tốc độ cao.
- 2 card ngang: `Start a Conversation`, `Share Files Securely`.
- 1 card full width: `Complete your profile`, có CTA `Go to Profile`.
- Footer nhỏ: `End-to-end encrypted • Internal Use Only`.

Bản tiếng Việt khuyến nghị:

- `Bắt đầu cuộc trò chuyện`
- `Chia sẻ tệp an toàn`
- `Hoàn thiện hồ sơ của bạn`
- `Đi tới hồ sơ`
- `Mã hóa đầu cuối • Chỉ sử dụng nội bộ`

### 4.2 Conversation list

Tham chiếu trang 3, 4, 23, 24, 26, 27.

Cấu trúc item:

```txt
[Avatar 40]  [Title                     Time]
             [Sender prefix + snippet   Badge]
```

Yêu cầu:

- Height: 68-76px.
- Padding: 10-12px 12px.
- Avatar: 36-40px; group dùng initials hoặc icon nhóm.
- Title: one-line ellipsis, weight 600.
- Time: 11-12px, màu muted.
- Snippet: tối đa 2 dòng, màu text-500.
- Unread badge: 18-20px circle, nền đỏ hoặc xanh, text trắng 11px.
- Online status: dot 8-10px ở avatar.
- Active conversation: nền xanh nhạt, border trái xanh 3px hoặc outline.
- Có thể có tabs `Tất cả`, `Chưa đọc`, `Ưu tiên`.

### 4.3 Chat header

Tham chiếu trang 4, 23, 24, 26, 27.

- Height 56px.
- Left:
  - Avatar/initials 36-40px.
  - Title: tên nhóm/người, 15-16px, weight 600.
  - Meta: `12 members, 4 online`, `24 thành viên`, `Nội bộ`, trạng thái online.
- Right actions:
  - Search trong hội thoại
  - Audio call
  - Video call
  - Members/info
  - More menu
- Header phải có border-bottom và luôn sticky trong layout chat.

### 4.4 Message area

Tham chiếu trang 4, 23, 24, 26, 27.

- Container: `flex: 1`, scroll vertical, background `--hc-bg-app`.
- Padding desktop: `24px 32px`; trên các ảnh chat vùng message rất rộng, bubble chiếm phần nhỏ, không nên full width.
- Date chip: center, text 11-12px, nền trắng hoặc xám nhạt, radius 999.
- Group messages:
  - Avatar của sender ở trái cho inbound.
  - Tên sender nhỏ phía trên bubble: 12px, weight 500/600.
- Outgoing message:
  - Align right.
  - Bubble nền xanh `--hc-primary-700`, text trắng.
  - Border radius 12px, góc gần cạnh người gửi có thể 4-6px.
  - Max-width: 560-680px tùy viewport; với tin dài ở trang 27 composer gửi dài, bubble không vượt quá 70% content.
- Incoming message:
  - Align left.
  - Bubble nền `#F1F3F5` hoặc white, text `--hc-text-900`.
  - Shadow rất nhẹ hoặc không shadow.
- Timestamp:
  - 11px, muted, đặt dưới/ngoài bubble hoặc cạnh phải trong bubble tùy variant.
- Reaction:
  - Dạng chip nhỏ như `👍 2`, nền trắng, border mảnh, đặt dưới bubble.

### 4.5 Message types

#### Text message

- Plain text hỗ trợ xuống dòng.
- Link auto-detect, màu xanh.
- Mention `@user` có background xanh nhạt và text xanh đậm.

#### Attachment card

Tham chiếu trang 4, 20, 21, 26.

- Card cao 56-72px, width 260-360px.
- Icon file 32-40px, màu theo loại: PDF đỏ, Excel xanh, Doc xanh dương.
- Tên file 13-14px weight 500, ellipsis.
- Meta: size + type, 12px muted.
- Action icon download ở phải.

#### Image attachment

Tham chiếu trang 4 và archive trang 22.

- Preview trong bubble/message, radius 8-12.
- Max-width 360-420px trong chat.
- Khi ảnh gửi đi: bubble text xanh có thể nằm dưới preview hoặc riêng message kế tiếp.

#### Scheduled/system message

Tham chiếu trang 23: `Đã lên lịch họp: Review Q3...`

- Center chip hoặc card nhỏ nền trắng/xám, icon calendar.
- Text 12-13px, muted.

#### Poll message

Tham chiếu trang 25 modal tạo bình chọn và trang 26 poll card.

Poll card:

- Width: 360-420px.
- Header label: `BÌNH CHỌN NHÓM`, uppercase, 11-12px, weight 700, màu xanh.
- Title: 15-16px, weight 600.
- Description/meta: `Chọn 1 đáp án. Đóng bình chọn vào...` 12-13px muted.
- Option row:
  - Label trái, percent phải.
  - Progress bar cao 6-8px, nền `#E5E7EB`, fill xanh.
  - Vote count + preview avatars hoặc `+10`.
- Footer: `Tổng: 20 người đã bình chọn`, link `Xem chi tiết`, action `Bình chọn lại`.

Create poll dialog:

- Backdrop: rgba(0,0,0,0.45), toàn màn, blur nhẹ nếu có.
- Modal: 360-420px, white, radius 8-12, shadow modal.
- Header: title `Tạo bình chọn`, close X.
- Field `Câu hỏi bình chọn` input.
- Section `Các lựa chọn`, tối thiểu 2 option input, mỗi row có handle/remove nếu nhiều hơn 2.
- Link/button `Thêm lựa chọn`.
- Switch/checkbox:
  - `Cho phép chọn nhiều đáp án`
  - `Ẩn người bình chọn`
- Footer: `Hủy`, primary `Tạo bình chọn`.

### 4.6 Composer

Tham chiếu trang 4, 23, 24, 26, 27.

Có 2 biến thể:

#### Compact composer

- Height min: 48px.
- Nằm cuối chat, sticky.
- Background white, border-top.
- Input wrapper: border 1px, radius 999 hoặc 8 tùy variant; ảnh thiên về radius 8-999.
- Placeholder: `Nhập tin nhắn...` hoặc `Type a message...`.
- Left icons: attachment, emoji, poll, mention.
- Right send button: circle 32px, nền xanh, icon send trắng.
- Hint dưới hoặc trong footer: `Nhấn Enter để gửi, Shift + Enter để xuống dòng`.

#### Rich text composer

Tham chiếu trang 27.

- Khi nhập nội dung dài, composer expand lên 180-260px.
- Toolbar trên hoặc dưới: bold, italic, underline, bullet, link, attachment, emoji, poll.
- Textarea hỗ trợ newline.
- Send button vẫn góc phải dưới.
- Scroll nội bộ nếu quá `max-height`.

Behavior:

- Enter gửi, Shift+Enter xuống dòng.
- Disable send khi empty và không attachment.
- Upload file hiển thị preview trước khi gửi.
- Composer không che message cuối; message list cần padding-bottom tương ứng.

### 4.7 Archive/media trong chat

Tham chiếu trang 22.

- Header: `Kho lưu trữ - [Tên nhóm]`, meta `42 Thành viên • 1.2 GB Media`.
- Tabs: `Ảnh & Video`, `Tệp tin`, `Đường dẫn`, `Người gửi`, `Âm thanh`.
- Media grid: 4 cột desktop, gap 12-16px, thumbnail 160-220px, object-fit cover, radius 4-8.
- Group theo tháng: `Tháng này`, `Tháng 9, 2023`.

### 4.8 Audio/video calls

Tham chiếu trang 28, 29.

Video call:

- Full screen dark/video background.
- Top-left: tên người gọi, thời lượng.
- Top/right icons: more, fullscreen/settings.
- Bottom center controls: mic, camera, share/screen, red hangup.
- Self preview: bottom-right, 120-180px.

Audio call modal:

- Backdrop trên chat hiện tại, màu xám/đen alpha 50%.
- Modal center 260-320px, white, radius 12-16, shadow.
- Avatar 72px, name, status `Đang gọi...`.
- Controls: speaker/mute/hangup/mic. Hangup là nút tròn đỏ.

## 5. Contacts, Directory, Profile

Dù dự án là chat, các màn liên quan tới chat cần đồng bộ.

### 5.1 Contact profile

Tham chiếu trang 1, 2, 12.

- Profile header có 2 variant; chọn variant thống nhất: card/hero có gradient xanh-cyan ở đầu hoặc avatar centered.
- Avatar: 72-96px.
- Tên: 18-20px weight 600.
- Chức danh/phòng ban: 13-14px muted.
- CTA: `Nhắn tin`, `Gọi điện`, `Chia sẻ`, `Chỉnh sửa`.
- Cards:
  - `Thông tin liên hệ`: email, phone, location.
  - `Thông tin công việc`: phòng ban, quản lý trực tiếp, ngày gia nhập.
  - `Thông tin cơ bản`: giới tính, ngày sinh, múi giờ.
  - `Nhóm chung`, `Tài liệu chia sẻ`, `Hoạt động gần đây`.

### 5.2 Directory grid

Tham chiếu trang 8.

- Sidebar filter theo organization/location.
- Grid card nhân sự: 180-220px width, avatar 72px, status dot, name, title, tags, button `Message`/`Nhắn tin`.
- Top controls: search, filter, sort.

## 6. Groups

Tham chiếu trang 18.

- Sidebar group list tương tự chat list, có tab `Tất cả`, `Do tôi quản lý`.
- Main detail card:
  - Avatar/cover, title, description.
  - Badge: `Bạn là Trưởng nhóm`, `Nhóm kín`, `Bật thông báo`.
  - Actions: chat, invite, settings.
- Members list card:
  - Role badges `TRƯỞNG NHÓM`, `PHÓ NHÓM`.
- Media card, shared links/files.
- Danger action `Rời nhóm` nền đỏ nhạt.

## 7. Tasks, Notifications, Calendar, Cloud, Internal News, Search

Các module này không phải trọng tâm chat nhưng phải dùng cùng design system.

### 7.1 Tasks

Tham chiếu trang 6.

- Kanban/list sidebar: `TO DO`, `IN PROGRESS`, `DONE`.
- Detail view: title, badges, CTA `Mark Complete`, `Attach`, description card, subtasks, right details, comments.
- Comment composer giống chat compact.

### 7.2 Notifications

Tham chiếu trang 7.

- Tabs `All`, `Mentions`, `System`, `Replies`.
- Notification list active state.
- Detail thread phía phải, reply composer ở bottom.

### 7.3 Cloud/file storage

Tham chiếu trang 5.

- Left categories/storage usage.
- File table/list ở main.
- Right details panel: file icon lớn, name, size, actions Download/Share/Star, owner, dates, access list.

### 7.4 Calendar

Tham chiếu trang 19.

- Left calendar filters/upcoming.
- Main month grid.
- Right event details panel với màu header, event info, attendees, CTA `Tham gia họp`.

### 7.5 Internal news/channel

Tham chiếu trang 20.

- Left categories `TIN TỨC`, `CÂU LẠC BỘ`.
- Feed cards center, max-width 560-680px.
- Card có author, title, excerpt, image/file attachment, reactions/comments.

### 7.6 Global search

Tham chiếu trang 21.

- Sidebar recent searches/filter.
- Main tabs: `Tất cả`, `Tin nhắn`, `Người dùng`, `File`, `Công việc`.
- Sectioned results: message results, attachments, users.

## 8. Auth screens

Tham chiếu trang 14-17.

Layout:

- Full page centered card, background `--hc-bg-app`; OTP có gradient radial rất nhẹ xanh ở góc.
- Card width:
  - Login/Forgot/OTP: 340-380px.
  - Register: 380-420px.
- Card white, radius 12, shadow sm/md, padding 28-32px.
- Logo icon centered top, 44-52px.
- Title centered 20-22px weight 700.
- Subtitle centered 13-14px muted.
- Input height 40-44px, radius 8, icon left, password eye right.
- Primary button height 44px, full width, blue.
- Secondary link xanh.
- Footer terms ở OTP.

Screens:

- Login: `Chào mừng trở lại`, email/phone, password, forgot password, login button.
- Forgot: `Quên mật khẩu`, email/phone, submit, back to login.
- OTP: 6 boxes, masked phone, countdown, resend code.
- Register: full name, employee code, company email, password, confirm password.

## 9. Settings and toasts

Tham chiếu trang 9-13.

Settings:

- Sidebar settings list: Account/Profile, Notifications, Privacy & Security, Appearance, Devices, Language, Help.
- Cards 2-column desktop.
- Toggle row: label + description + switch right.
- Theme selection cards.
- Change password form in card.

Toast:

- Top-right, 320-380px.
- Success: nền xanh nhạt, icon check, title `Cập nhật thành công!`, message.
- Error: nền đỏ nhạt, icon alert, title `Cập nhật thất bại`, message.
- Close X right.
- Duration: 3-5s, error có thể giữ lâu hơn.

Skeleton/loading:

- Trang 10 cho thấy skeleton form centered: avatar circle skeleton, text bars, input bars, button skeleton/primary.
- Dùng skeleton khi profile/settings đang load.

## 10. Component inventory

Nên tổ chức component theo shared + feature.

```txt
src/
  app/
    AppShell.tsx
    routes.tsx
  shared/
    ui/
      Avatar.tsx
      Badge.tsx
      Button.tsx
      Card.tsx
      IconButton.tsx
      Input.tsx
      SearchInput.tsx
      Tabs.tsx
      Toggle.tsx
      Toast.tsx
      Dialog.tsx
      Skeleton.tsx
    layout/
      SideRail.tsx
      ModuleSidebar.tsx
      MainHeader.tsx
      RightPanel.tsx
    styles/
      tokens.css
      globals.css
  features/
    chat/
      pages/ChatPage.tsx
      pages/ChatArchivePage.tsx
      components/ConversationList.tsx
      components/ConversationListItem.tsx
      components/ChatHeader.tsx
      components/MessageList.tsx
      components/MessageBubble.tsx
      components/AttachmentCard.tsx
      components/ImageMessage.tsx
      components/PollCard.tsx
      components/PollCreateDialog.tsx
      components/MessageComposer.tsx
      components/EmptyChatWelcome.tsx
      components/AudioCallDialog.tsx
      components/VideoCallView.tsx
      types.ts
    contacts/
    groups/
    settings/
    auth/
```

## 11. TypeScript data contracts gợi ý

```ts
export type ConversationType = 'direct' | 'group' | 'channel';

export interface UserBrief {
  id: string;
  name: string;
  title?: string;
  department?: string;
  avatarUrl?: string;
  initials?: string;
  onlineStatus?: 'online' | 'away' | 'busy' | 'offline';
}

export interface Conversation {
  id: string;
  type: ConversationType;
  title: string;
  avatarUrl?: string;
  initials?: string;
  memberCount?: number;
  onlineCount?: number;
  isInternal?: boolean;
  isMuted?: boolean;
  isPinned?: boolean;
  isPriority?: boolean;
  unreadCount?: number;
  lastMessage?: {
    senderName?: string;
    text: string;
    createdAt: string;
    mine?: boolean;
  };
}

export type MessageKind = 'text' | 'attachment' | 'image' | 'poll' | 'system' | 'call';

export interface ChatAttachment {
  id: string;
  name: string;
  sizeLabel: string;
  mimeType: string;
  url?: string;
  thumbnailUrl?: string;
}

export interface PollOption {
  id: string;
  label: string;
  votes: number;
  percent: number;
  voterAvatars?: string[];
}

export interface PollData {
  id: string;
  title: string;
  description?: string;
  allowMultiple?: boolean;
  anonymous?: boolean;
  closesAt?: string;
  totalVotes: number;
  options: PollOption[];
  myOptionIds?: string[];
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  kind: MessageKind;
  sender: UserBrief;
  mine: boolean;
  text?: string;
  attachments?: ChatAttachment[];
  poll?: PollData;
  createdAt: string;
  editedAt?: string;
  reactions?: Array<{ emoji: string; count: number; reactedByMe?: boolean }>;
  replyToMessageId?: string;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
}
```

## 12. Responsive rules

Ảnh tham chiếu là desktop, nhưng refactor cần không vỡ ở tablet/mobile.

- >= 1200px: rail + sidebar + main + optional right panel.
- 900-1199px: rail + sidebar 260px + main; right panel overlay/drawer.
- 640-899px: sidebar có thể collapsible; chat list và chat detail là hai route/state khác nhau.
- < 640px:
  - SideRail chuyển thành bottom nav hoặc hidden behind menu.
  - Conversation list full screen.
  - Chat detail full screen; header 56px; composer sticky bottom.
  - Bubble max-width 82%.
  - Dialog width calc(100vw - 32px).

## 13. Accessibility and UX rules

- Tất cả icon button phải có `aria-label`.
- Focus visible rõ, màu xanh.
- Contrast text/bubble đảm bảo AA.
- Composer gửi được bằng keyboard.
- Modal trap focus, đóng bằng Escape.
- Chat message list dùng `aria-live="polite"` cho tin nhắn mới.
- Không chỉ dùng màu để biểu thị trạng thái; kết hợp text/icon.
- Truncate phải có tooltip hoặc title cho tên file/tên group dài.

## 14. Nội dung tiếng Việt chuẩn hóa

Dự án nên thống nhất tiếng Việt cho UI chính, tránh lẫn `Chat`, `Contacts`, `Tasks` trừ khi có i18n.

Map khuyến nghị:

```txt
Messages/Chats -> Tin nhắn
Contacts/Directory -> Danh bạ
Tasks -> Công việc
Calendar -> Lịch
Cloud/My Cloud/Storage -> Lưu trữ
Notifications -> Thông báo
Settings -> Cài đặt
Search -> Tìm kiếm
Type a message... -> Nhập tin nhắn...
Start a Conversation -> Bắt đầu cuộc trò chuyện
Share Files Securely -> Chia sẻ tệp an toàn
Complete your profile -> Hoàn thiện hồ sơ của bạn
Mark Complete -> Đánh dấu hoàn thành
Attach -> Đính kèm
Download -> Tải xuống
Share -> Chia sẻ
Star -> Đánh dấu sao
```

## 15. Các điểm cần tránh khi refactor

- Không tạo mỗi màn một layout riêng; phải dùng `AppShell`, `SideRail`, `ModuleSidebar`, `MainHeader` dùng chung.
- Không hard-code màu xanh ở từng component; dùng token.
- Không để message bubble chiếm full width; phải giới hạn max-width.
- Không pha tiếng Anh/Việt tùy tiện.
- Không dùng shadow nặng hoặc border đậm; giao diện tham chiếu rất nhẹ.
- Không thay đổi API/business logic khi chỉ refactor UI.
- Không gom toàn bộ chat vào một file lớn; tách component nhỏ.
