# 💬 Chat Web Client

Ứng dụng web chat real-time với giao diện hiện đại, lấy cảm hứng từ Telegram và Zalo. Đây là Sprint 1 MVP sử dụng mock data.

![React](https://img.shields.io/badge/React-18.3-61DAFB?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.1-38B2AC?style=flat-square&logo=tailwind-css)
![Vite](https://img.shields.io/badge/Vite-6.3-646CFF?style=flat-square&logo=vite)

## 📸 Screenshots

<!-- Thêm screenshots sau khi chạy ứng dụng -->

|       Desktop View        |          Mobile View          |
| :-----------------------: | :---------------------------: |
| _Giao diện desktop 3 cột_ | _Giao diện mobile responsive_ |

## ✨ Features

### 🗨️ Chat Features

- **Danh sách hội thoại** với search, filter và sort
- **Nhiều loại tin nhắn**: Text, Image, File, Voice, System
- **Trạng thái tin nhắn**: Sent, Delivered, Read với checkmarks
- **Reactions** với emoji picker
- **Reply/Forward/Edit/Delete** tin nhắn
- **Typing indicator** animation
- **Online status** real-time

### 🎨 UI/UX

- **3-column layout**: Sidebar - Chat Window - Info Panel
- **Telegram/Zalo inspired** design
- **Smooth animations**: slide-in, bounce, pulse
- **Custom scrollbars** và bubble tails
- **Responsive design**: Desktop, Tablet, Mobile
- **Dark mode ready** (colors configured)

### 📱 Conversation Types

- **Private chat** (1-1)
- **Group chat** (nhiều người)
- **Channel** (broadcast)

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18.x
- npm >= 9.x

### Installation

```bash
# Clone repository
git clone <repository-url>
cd chat-web-client

# Install dependencies
npm install

# Start development server
npm run dev
```

Mở trình duyệt tại `http://localhost:5173`

### Build Production

```bash
# Build
npm run build

# Preview production build
npm run preview
```

## 📁 Project Structure

```
src/
├── assets/              # Static assets (images, icons)
├── components/
│   ├── common/          # Reusable components
│   │   ├── Avatar.tsx
│   │   ├── Badge.tsx
│   │   ├── ContextMenu.tsx
│   │   ├── OnlineIndicator.tsx
│   │   ├── Tooltip.tsx
│   │   └── TypingIndicator.tsx
│   ├── conversation/    # Sidebar components
│   │   ├── ConversationItem.tsx
│   │   ├── ConversationList.tsx
│   │   ├── ConversationSearch.tsx
│   │   └── NewChatButton.tsx
│   ├── message/         # Message type components
│   │   ├── FileMessage.tsx
│   │   ├── ImageMessage.tsx
│   │   ├── MessageActions.tsx
│   │   ├── ReactionBar.tsx
│   │   ├── SystemMessage.tsx
│   │   ├── TextMessage.tsx
│   │   └── VoiceMessage.tsx
│   ├── chat/            # Chat window components
│   │   ├── ChatHeader.tsx
│   │   ├── DateDivider.tsx
│   │   ├── MessageBubble.tsx
│   │   └── MessageList.tsx
│   ├── input/           # Input components
│   │   ├── AttachmentMenu.tsx
│   │   ├── EmojiPicker.tsx
│   │   └── MessageInput.tsx
│   ├── info/            # Info panel components
│   │   ├── GroupInfo.tsx
│   │   └── UserProfile.tsx
│   └── layout/          # Layout components
│       ├── ChatWindow.tsx
│       └── Sidebar.tsx
├── data/
│   └── mockData.ts      # Mock data cho development
├── pages/
│   └── ChatPage.tsx     # Main chat page
├── types/
│   └── index.ts         # TypeScript interfaces
├── utils/
│   ├── formatFileSize.ts
│   ├── formatTime.ts
│   └── messageHelpers.ts
├── App.tsx              # App entry với Router
├── main.tsx             # React entry point
└── index.css            # Global styles
```

## 🛠️ Tech Stack

| Technology   | Version | Purpose         |
| ------------ | ------- | --------------- |
| React        | 18.3    | UI Framework    |
| TypeScript   | 5.8     | Type Safety     |
| Vite         | 6.3     | Build Tool      |
| Tailwind CSS | 4.1     | Styling         |
| React Router | 7.12    | Routing         |
| Heroicons    | 2.2     | Icons           |
| date-fns     | 4.1     | Date Formatting |
| clsx         | 2.1     | Class Names     |

## 🎨 Design System

### Colors

```css
/* Telegram Theme */
--telegram-blue: #0088cc --telegram-light: #54a9eb /* Zalo Theme */
  --zalo-blue: #0068ff --zalo-light: #e7f3ff /* Chat Bubbles */
  --chat-own: #dcf8c6 /* Green - own messages */ --chat-other: #ffffff
  /* White - other messages */;
```

### Animations

- `typing` - Typing indicator dots
- `slide-in` - Message slide in
- `bounce-in` - New element bounce
- `pulse-online` - Online status pulse
- `reaction-pop` - Reaction animation

### Responsive Breakpoints

- **Desktop**: ≥1024px (3 columns)
- **Tablet**: 768px-1023px (2 columns, toggle info)
- **Mobile**: <768px (1 column, swipe navigation)

## 📝 Mock Data

Mock data includes:

- **6 users** với avatar và status khác nhau
- **7 conversations**: Private, Group, Channel
- **30+ messages**: Text, Image, File, Voice, System
- **Reactions** và read receipts
- **Typing indicators**

## 🔜 Roadmap

### Sprint 1 (Current) ✅

- [x] UI Components
- [x] Mock Data
- [x] Responsive Layout
- [x] Basic Animations

### Sprint 2 (Planned)

- [ ] WebSocket Integration
- [ ] Real-time Messages
- [ ] User Authentication
- [ ] Message Persistence

### Sprint 3 (Planned)

- [ ] File Upload
- [ ] Voice Messages Recording
- [ ] Push Notifications
- [ ] Dark Mode Toggle

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

<p align="center">
  Made with ❤️ by Hacom Holding DX Team
</p>
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
globalIgnores(['dist']),
{
files: ['**/*.{ts,tsx}'],
extends: [
// Other configs...
// Enable lint rules for React
reactX.configs['recommended-typescript'],
// Enable lint rules for React DOM
reactDom.configs.recommended,
],
languageOptions: {
parserOptions: {
project: ['./tsconfig.node.json', './tsconfig.app.json'],
tsconfigRootDir: import.meta.dirname,
},
// other options...
},
},
])

```

```
