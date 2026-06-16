# Yêu cầu FE — Lưu lịch sử hội thoại Chatbot Công ty

**Ngày:** 2026-06-16  
**BE version:** sau fix session history  
**Áp dụng cho:** tab "AI Công ty" — luồng `/api/chat/stream` + `/api/sessions`

---

## 1. Tóm tắt vấn đề hiện tại

Sau khi kiểm tra Redis, **tất cả session đều ở dạng cũ `chat-{user_uuid}-default`** — không có session đa hội thoại nào (`chat-{user_uuid}-{hex12}`). Nguyên nhân phía FE:

| Vấn đề | Biểu hiện |
|--------|-----------|
| FE không gửi `new_conversation: true` | Mọi tin nhắn dồn vào session `default`, không tạo cuộc mới |
| Sidebar refresh sau `event: session` (sai thời điểm) | Session chưa tồn tại trong Redis → sidebar trống |
| Không persist `session_id` vào localStorage | Sau reload trang, FE mất session_id → tạo cuộc mới thay vì tiếp tục |

---

## 2. Hợp đồng API (không thay đổi)

### POST `/api/chat/stream`

**Request body bắt buộc:**

```json
{
  "question": "Quy trình xin nghỉ phép?",
  "session_id": "chat-HC888890-a3f9c2b1d4e7",
  "new_conversation": false,
  "user_name": "Vũ Minh Quốc",
  "department": "Ban Kinh tế Kỹ thuật"
}
```

> **Quan trọng:** `new_conversation` là `boolean`, PHẢI gửi tường minh — không được bỏ qua field này. Pydantic sẽ default về `false` nếu bỏ trống, khiến BE không bao giờ tạo session mới.

**Logic `session_id` + `new_conversation`:**

| FE gửi | BE làm | Kết quả |
|--------|--------|---------|
| `new_conversation: true`, `session_id: null` | Sinh UUID mới | `event: session` trả `chat-{uid}-{hex12}` |
| `new_conversation: false`, `session_id: "chat-..."` | Ghi tiếp session đó | `event: session` trả lại đúng session_id đã gửi |
| `new_conversation: false`, `session_id: null` | Tìm session gần nhất (backward compat) | Không nên dùng trong code mới |

**Thứ tự SSE events:**

```
event: session   → { session_id: "chat-uid-hex12" }   ← đến TRƯỚC token đầu tiên
event: token     → { token: "..." }                    ← nhiều lần
event: done      → { session_id, answer, sources }     ← cuối cùng
```

> Trường hợp lỗi: `event: error → { error: "..." }` thay thế `event: done`. Không có `event: done`.

---

## 3. Những thay đổi FE BẮT BUỘC phải làm

### 3.1 Gửi `new_conversation` tường minh

```typescript
// ❌ Sai — bỏ field new_conversation
const body = { question, session_id: serverSessionId };

// ✅ Đúng — luôn gửi tường minh
const body = {
  question,
  session_id: serverSessionId ?? null,
  new_conversation: serverSessionId === null,  // true khi chưa có session
};
```

### 3.2 Lưu `session_id` từ `event: session` (KHÔNG phải `event: done`)

`event: session` đến **trước token đầu tiên**. Nếu stream lỗi giữa chừng, `event: done` không phát ra → mất `session_id`. Phải lắng nghe từ `event: session`.

```typescript
// ✅ Xử lý đúng
if (eventName === 'session') {
  const { session_id } = JSON.parse(data);
  setServerSessionId(session_id);                          // cập nhật React state
  localStorage.setItem(`company_chat_sid_${userId}`, session_id);  // persist qua reload
}

if (eventName === 'done') {
  const { answer, sources } = JSON.parse(data);
  // Refresh sidebar CHỈ Ở ĐÂY — session đã tồn tại trong Redis lúc này
  await refreshSessionList();
  onDone(answer, sources);
}

if (eventName === 'error') {
  const { error } = JSON.parse(data);
  // session_id đã được lưu từ event: session bên trên → lần sau retry đúng session
  onError(error);
}
```

### 3.3 Persist `session_id` vào localStorage

```typescript
// Khi mở trang / component mount
const STORAGE_KEY = `company_chat_sid_${userId}`;

function initSessionId(): string | null {
  return localStorage.getItem(STORAGE_KEY);  // null nếu lần đầu
}

// Khi nhận event: session
function onSession(session_id: string) {
  setServerSessionId(session_id);
  localStorage.setItem(STORAGE_KEY, session_id);
}

// Khi user bấm "Cuộc hội thoại mới"
function startNewConversation() {
  setServerSessionId(null);
  localStorage.removeItem(STORAGE_KEY);
}
```

### 3.4 Refresh sidebar CHỈ sau `event: done`

```typescript
// ❌ Sai — refresh sau event: session (session chưa có trong Redis)
if (eventName === 'session') {
  await refreshSessionList();  // luôn trả về rỗng
}

// ✅ Đúng — refresh sau event: done
if (eventName === 'done') {
  await refreshSessionList();  // session đã có đủ tin nhắn
}
```

---

## 4. Luồng hoàn chỉnh

### Lần đầu mở trang

```
Mount component
  → đọc localStorage → session_id = null (lần đầu) hoặc "chat-uid-hex" (đã có)
  → gọi GET /api/sessions → render sidebar
  → nếu có session_id từ localStorage: tiếp tục cuộc hội thoại đó
  → nếu không: chờ user gõ tin nhắn đầu tiên
```

### Gửi tin nhắn đầu tiên (cuộc mới)

```
serverSessionId = null
  → POST /api/chat/stream { new_conversation: true, session_id: null }
  → event: session → setServerSessionId("chat-uid-abc123") + localStorage.setItem(...)
  → event: token × N → render streaming
  → event: done → refreshSessionList() + hiển thị đáp án
```

### Tiếp tục hội thoại

```
serverSessionId = "chat-uid-abc123"
  → POST /api/chat/stream { new_conversation: false, session_id: "chat-uid-abc123" }
  → event: session → "chat-uid-abc123" (giống hệt)
  → event: token × N → render streaming
  → event: done → refreshSessionList()
```

### Sau khi reload trang

```
Mount component
  → localStorage.getItem("company_chat_sid_HC888890") = "chat-uid-abc123"
  → setServerSessionId("chat-uid-abc123")
  → gọi GET /api/sessions/chat-uid-abc123 → load lại lịch sử
  → user tiếp tục: POST { new_conversation: false, session_id: "chat-uid-abc123" }
```

### User bấm "Cuộc hội thoại mới"

```
startNewConversation()
  → setServerSessionId(null)
  → localStorage.removeItem("company_chat_sid_HC888890")
  → tin nhắn tiếp theo: { new_conversation: true, session_id: null }
```

---

## 5. Sidebar — các API và thời điểm gọi

| API | Khi nào gọi | Ghi chú |
|-----|-------------|---------|
| `GET /api/sessions?limit=100` | Mount + sau mỗi `event: done` | Không gọi sau `event: session` |
| `GET /api/sessions/{session_id}` | User click vào session trong sidebar | Load lại toàn bộ tin nhắn cũ |
| `DELETE /api/sessions/{session_id}` | User xóa hội thoại | Sau đó gọi lại `GET /api/sessions` |

**Response `GET /api/sessions`:**

```json
{
  "sessions": [
    {
      "session_id": "chat-uid-abc123",
      "title": "Quy trình xin nghỉ phép?",
      "updated_at": "2026-06-16T10:32:11Z",
      "message_count": 6
    }
  ]
}
```

Kết quả đã được sort theo `updated_at` mới nhất → render trực tiếp, không cần sort lại.

**Response `GET /api/sessions/{session_id}`:**

```json
{
  "session_id": "chat-uid-abc123",
  "messages": [
    { "role": "user",      "content": "Quy trình xin nghỉ phép?", "timestamp": "..." },
    { "role": "assistant", "content": "Để xin nghỉ phép...",       "timestamp": "...", "metadata": {...} }
  ]
}
```

Chỉ render `role = "user"` và `role = "assistant"`. Bỏ qua `tool`, `assistant_tool_call`.

---

## 6. Xử lý lỗi auth (mới — sau khi BE bật `REQUIRE_TRUSTED_IDENTITY=1`)

BE bây giờ trả **HTTP 401** nếu JWT không hợp lệ hoặc thiếu `auth_user_id` / `employeeCode`. FE phải xử lý:

```typescript
const response = await fetch('/api/chat/stream', { ... });

if (response.status === 401) {
  // JWT hết hạn hoặc không hợp lệ → redirect về trang đăng nhập
  redirectToLogin();
  return;
}

if (response.status === 403) {
  // session_id không thuộc user này
  toast.error('Bạn không có quyền xem hội thoại này.');
  return;
}
```

---

## 7. Checklist kiểm tra trước khi release

- [ ] POST body luôn có `"new_conversation": true/false` (không bỏ field)
- [ ] `session_id` được lưu vào localStorage sau `event: session`
- [ ] Sidebar chỉ refresh sau `event: done`, không phải `event: session`
- [ ] Sau reload trang, đọc `session_id` từ localStorage và tiếp tục đúng cuộc
- [ ] Nút "Cuộc hội thoại mới" xóa localStorage key và gửi `new_conversation: true`
- [ ] Xử lý HTTP 401 → redirect login
- [ ] DevTools Network: xác nhận POST body có `new_conversation: true` khi cuộc đầu tiên
