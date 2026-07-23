# Báo cáo audit `chat-web-client` — Phase 2

> **Loại:** báo cáo audit, **KHÔNG sửa code** (theo `WEB_AUDIT_PLAN.md` mục Phase 2)
> **Ngày:** 23-07-26 · **Phạm vi:** `src/` (bỏ `src/poc/`)
> **Trạng thái:** F-01 ✅ · F-02 ✅ · F-04 ✅ · F-03 🟡 làm một phần (2/6 nhóm state) — tất cả ở Phase 3 (23-07-26)
> Mọi kết luận dưới đây dẫn chiếu `file:line` thật, đã đọc code — không suy đoán.

---

## Tóm tắt cho người bận

**Codebase khoẻ hơn vẻ ngoài.** Không có bloat hàng loạt, không có code chép-dán tràn lan. Các file trùng tên đều là re-export hợp lệ. Store lớn nhưng đã dùng index `Record<string, …>` đúng chỗ — chỉ có **1 chỗ `.sort()`** trong 5099 dòng `chatStore.ts`.

Việc thật nằm ở **4 finding**, xếp theo giá trị ÷ rủi ro:

| # | Finding | Loại | Rủi ro sửa | Giá trị |
|---|---|---|---|---|
| **F-01** | Hàm so sánh sort đọc global store trong mỗi lần so sánh → O(n log n × p) + vi phạm DIP | giải thuật + DIP | **THẤP** | **CAO** |
| **F-02** | `useMemo` phụ thuộc object `currentUser` thay vì `currentUser.id` → tính lại thừa ở hot path | giải thuật | **THẤP** | VỪA |
| **F-03** | `GroupInfo.tsx`: **35 `useState`** trong 1 component, 1807 dòng | SRP | VỪA | VỪA |
| **F-04** | Hai file cùng tên `messageIdentity.ts` khác vai trò → dễ import nhầm | đặt tên | **THẤP** | THẤP |
| **F-05** | 🔴 **BUG:** hai hộp thoại xác nhận mở chồng nhau (xoá/cấm thành viên, chuyển quyền) | correctness | **THẤP** | **CAO** |

Ngoài ra: **97 lỗi lint** tồn đọng (mục 6) và ghi chú vì sao `chatStore` **chưa nên** cắt vội (mục 5).

---

## F-01 · Hàm so sánh sort đọc global store trong mỗi lần so sánh 🔴 ƯU TIÊN 1

- **Vị trí:** [`utils/conversationRanking.ts:123-146`](../src/utils/conversationRanking.ts#L123)
- **Loại:** giải thuật + cấu trúc dữ liệu + DIP (SOLID)
- **Rủi ro sửa: THẤP** · **Test phủ: KHÔNG** (phải viết test trước)

**Hiện trạng:**

```ts
export const compareConversationsByActivity = (a, b) => {
  const pinnedIds = useUIStore.getState().pinnedConversationIds; // ← đọc global store
  const aPinned = pinnedIds.includes(a.id);                      // ← O(p) quét mảng
  const bPinned = pinnedIds.includes(b.id);                      // ← O(p) quét mảng
  ...
}
```

**Vì sao hại — 3 vấn đề riêng biệt trong 6 dòng:**

1. **Độ phức tạp.** `Array.sort` gọi hàm so sánh **O(n log n)** lần. Mỗi lần lại `useUIStore.getState()` + **2 lần** `.includes()` quét tuyến tính. Tổng: **O(n log n × p)** thay vì O(n log n). Với 40 hội thoại + 5 ghim ≈ **2.000 phép quét thừa mỗi lần sort**.
2. **Đây là hot path.** Sort này chạy trong [`useSidebarConversationSummaries.ts:32`](../src/features/chat/hooks/useSidebarConversationSummaries.ts#L32) — tức là **mỗi khi có tin nhắn đến**, mỗi lần unread đổi. Không phải đường code hiếm.
3. **Vi phạm DIP + khó test.** Một hàm so sánh lẽ ra phải **thuần** (chỉ phụ thuộc `a`, `b`) lại đi với tay ra global store. Hệ quả: không thể test độc lập nếu không dựng `uiStore`, và nó **ngầm phụ thuộc thời điểm gọi** — cùng input, khác thời điểm, khác kết quả.

**Có 4 nơi gọi**, đều dính:
[`useSidebarConversationSummaries.ts:32`](../src/features/chat/hooks/useSidebarConversationSummaries.ts#L32) · [`useGlobalSearch.ts:128`](../src/features/chat/hooks/useGlobalSearch.ts#L128) · [`chatStore.ts:1004`](../src/stores/chatStore.ts#L1004) · [`chatStore.ts:1182`](../src/stores/chatStore.ts#L1182)

**Đề xuất — biến hàm thuần, tiêm phụ thuộc vào (đúng DIP):**

```ts
// Nhận Set (O(1) tra cứu) thay vì tự đi lấy mảng
export const createConversationComparator = (pinnedIds: ReadonlySet<string>) =>
  (a: Conversation, b: Conversation): number => { ... };
```

Nơi gọi dựng `Set` **một lần** trước khi sort. Độ phức tạp về đúng **O(n log n)**, hàm so sánh thành thuần và test được không cần store.

⚠️ **Liên quan — bug tiềm ẩn cần kiểm khi sửa:** [`useSidebarConversationSummaries.ts:55`](../src/features/chat/hooks/useSidebarConversationSummaries.ts#L55) khai `pinnedConversationIds` trong mảng deps nhưng **thân `useMemo` không hề dùng biến đó** (nó đi vào gián tiếp qua `compareConversationsByActivity`). Hiện tại "may mà đúng" — deps vô tình khớp với phụ thuộc ẩn. Sau khi sửa F-01 thì quan hệ này thành tường minh, đúng bản chất.

---

## F-02 · `useMemo` phụ thuộc object thay vì id 🟠 ƯU TIÊN 2

- **Vị trí:** [`useSidebarConversationList.ts:108`](../src/features/chat/hooks/useSidebarConversationList.ts#L108)
- **Loại:** giải thuật (memo hoá sai khoá)
- **Rủi ro sửa: THẤP** (đổi 1 dòng) · **Test phủ: KHÔNG**

**Hiện trạng:** thân `useMemo` chỉ dùng `currentUser.id`, nhưng deps khai cả **object** `currentUser`:

```ts
}, [counts, currentUser, options.filter, options.query, orderedConversations]);
//            ^^^^^^^^^^^ object — đổi identity là tính lại toàn bộ
```

**Vì sao hại:** `currentUserSummary` được tạo bởi `useMemo` ở [`ChatPage.tsx:612`](../src/pages/ChatPage.tsx#L612). Mỗi lần object đó đổi identity (dù `id` y nguyên) → chạy lại **2 vòng `.filter()` + 1 `.map()` trên toàn bộ hội thoại**, trong đó `includesQuery` còn quét cả `participants` của từng hội thoại. Vô ích vì kết quả không đổi.

**Đề xuất:** đổi deps thành `currentUser.id`. Một dòng.

---

## F-03 · `GroupInfo.tsx` — 35 `useState` trong một component 🟡 ƯU TIÊN 3

- **Vị trí:** [`components/info/GroupInfo.tsx`](../src/components/info/GroupInfo.tsx) — 1807 dòng
- **Loại:** SRP (Single Responsibility)
- **Rủi ro sửa: VỪA** · **Test phủ: KHÔNG**

**Hiện trạng:** **35 `useState` + 27 `useCallback`** trong một component. Đếm được ít nhất **6 nhóm trách nhiệm** tách bạch, mỗi nhóm là một lý do để file này phải đổi:

| Nhóm | State tiêu biểu |
|---|---|
| Danh sách thành viên | `membersByUserId`, `membersHrByUserId`, `isLoadingMembers`, `memberSearch` |
| Đổi tên nhóm | `isRenamingGroup`, `groupNameDraft` |
| Link mời | `showCreateInviteForm`, `inviteNameDraft`, `isCreatingInvite`, `revokingInviteId` |
| Upload ảnh đại diện | `groupAvatarPreview`, `groupAvatarStage`, `groupAvatarProgress` |
| Modal xác nhận | `pendingConfirm`, `isConfirmActionPending`, `removeMemberTarget`, `banMemberTarget`, `transferOwnershipTarget`, `deleteGroupTarget` |
| Đóng/mở khu vực | `securityExpanded`, `showAddMember` |

**Vì sao hại:** sửa nút mời cũng phải mở file 1807 dòng, đọc qua 35 state không liên quan; mọi `setState` re-render toàn bộ panel; và không ai test được từng mảnh.

**Đề xuất:** tách theo **nhóm state**, không tách theo dòng. Mỗi nhóm → một hook (`useGroupInviteLinks`, `useGroupAvatarUpload`…) hoặc component con giữ state của chính nó. Bắt đầu từ nhóm **Upload ảnh đại diện** (3 state, gần như độc lập) để lấy đà, rồi tới **Link mời**.

**Đây là refactor hành vi-giữ-nguyên** → phải viết test đặc tả trước, theo mục 2.5 của kế hoạch.

### ✅ Hoàn thành (23-07-26) — 5/6 nhóm tách, 1 nhóm cố ý giữ nguyên

| Nhóm | Trạng thái | Kết quả |
|---|---|---|
| Upload ảnh đại diện | ✅ | [`useGroupAvatarUpload.ts`](../src/components/info/useGroupAvatarUpload.ts) — 192 dòng, mang theo cả `revokeBlobUrl` + `resolveGroupAvatarStageLabel` + `ALLOWED_GROUP_AVATAR_TYPES` + type `GroupAvatarUploadStage` |
| Link mời | ✅ | [`useGroupInviteLinks.ts`](../src/components/info/useGroupInviteLinks.ts) — 171 dòng, gom 4 state + 4 handler (create/copy/revoke/delete) |
| Modal xác nhận | ✅ | **Phát hiện + sửa bug thật — xem F-05 bên dưới** |
| Đổi tên nhóm | ✅ | [`useGroupRename.ts`](../src/components/info/useGroupRename.ts) — 84 dòng; gộp 2 state thành 1 (`draft: string \| null`), bỏ luôn effect đồng bộ |
| Danh sách thành viên | ✅ | [`useGroupMembers.ts`](../src/components/info/useGroupMembers.ts) — 295 dòng; gom fetch + `singleFlight` + chuẩn hoá + enrich HR + merge participants |
| Đóng/mở khu vực | ⛔ | **cố ý không tách** — xem ghi chú bên dưới |

**Đo được:** `GroupInfo.tsx` **1807 → 1527 dòng (−280, −15%)**, `useState` **35 → 23 (−12)**.

**Về `isSubmitting`** — trước đó tưởng là nút thắt phải gỡ. Đọc kỹ thì nó là **thiết kế đúng**: một cờ "đang có thao tác nặng cấp nhóm" dùng chung cho 4 luồng (thêm thành viên / đổi tên / rời nhóm / xoá nhóm), khoá chéo cả panel là chủ ý. Nên `useGroupRename` **nhận `setIsSubmitting` từ ngoài** thay vì tự giữ — giữ một nguồn duy nhất, không nhân đôi.

**Về nhóm "đóng/mở khu vực" (`securityExpanded`, `membersShowAll`, `pollsShowAll`)** — cố ý **không** tách. Ba cờ boolean thuần, mỗi cái dùng đúng một chỗ, không có logic đi kèm. Bọc vào hook chỉ thêm một lớp gián tiếp mà không giảm phức tạp — đó là abstraction thừa, đúng thứ audit này muốn loại bỏ.

> Số dòng giảm ít hơn kỳ vọng vì code chuyển đi được **giãn ra cho dễ đọc** trong hook (bản cũ nhồi nhiều lệnh trên một dòng). Giá trị thật không nằm ở số dòng mà ở chỗ: 7 state rời rạc giờ nằm sau 2 API có tên, có invariant riêng, test được độc lập.
>
> **Bề mặt tiếp xúc thu hẹp:** `GroupInfo` không còn import `uploadClient`, `createGroupInviteLinkUseCase`, `revokeGroupInviteLinkUseCase`, `upsertInviteLink`, `removeInviteLink` — 5 phụ thuộc biến mất khỏi component.
>
> **Lint:** cả 4 hook mới **sạch tuyệt đối**. `GroupInfo.tsx` từ **4 → 3 lỗi** `set-state-in-effect` (nợ có sẵn, đã đối chứng với bản gốc từ git).
>
> Lỗi thứ 4 theo `fetchMembers` sang `useGroupMembers`. Ở đó nó là **cảnh báo giả**: `refetch` là hàm async gọi API nên `setState` chỉ chạy *sau khi* request xong, không phải cascading render đồng bộ mà rule nhắm tới — đồng bộ với dữ liệu ngoài đúng là việc của effect. Đã `eslint-disable` **kèm lý do viết rõ tại chỗ**, thay vì để lỗi trôi nổi.

---

## F-04 · Hai `messageIdentity.ts` khác vai trò, trùng tên 🟢 ƯU TIÊN 4

- **Vị trí:** [`utils/messageIdentity.ts`](../src/utils/messageIdentity.ts) (29 dòng) vs [`features/chat/domain/messageIdentity.ts`](../src/features/chat/domain/messageIdentity.ts) (73 dòng)
- **Loại:** đặt tên · **Rủi ro sửa: THẤP** · **Test phủ: một phần**

**Đã kiểm chứng: KHÔNG trùng lặp, KHÔNG lệch logic.** Hai file làm hai việc khác hẳn:

| File | Vai trò | Ai dùng |
|---|---|---|
| `utils/messageIdentity.ts` | **Sinh** id (`generateClientMessageId`, `generateTempMessageId`) | `chatRealtimeAdapter.ts`, `chatStore.ts` |
| `features/chat/domain/messageIdentity.ts` | **So khớp** danh tính (`toMessageIdentityKeys`, `messagesShareIdentity`) | `useMessageJumpTargetRTK.ts`, `useWebSocket.ts` |

**Vì sao vẫn nên sửa:** hai file cùng tên, khác vai trò, cùng lĩnh vực → autocomplete rất dễ chọn nhầm. Import nhầm ở đây không gãy typecheck ngay mà sinh lỗi trùng/mất tin nhắn — loại bug đắt nhất để truy.

**Đề xuất:** đổi tên theo vai trò: `utils/messageIdentity.ts` → **`messageIdFactory.ts`**; `domain/messageIdentity.ts` → **`messageIdentityMatching.ts`**. Chỉ đổi tên + cập nhật import, không đụng logic.

> Ghi chú: `isTempMessageId` có ở **cả hai** file với cùng logic (`startsWith("temp-")`) — và một bản thứ ba ở [`chatStore.ts:1538`](../src/stores/chatStore.ts#L1538). Gộp về một nguồn khi làm F-04.

---

## F-05 · Hai hộp thoại xác nhận mở chồng nhau 🔴 BUG THẬT — ĐÃ SỬA

- **Vị trí:** [`components/info/GroupInfo.tsx`](../src/components/info/GroupInfo.tsx)
- **Loại:** correctness (một sự thật, hai nguồn) · **Đã sửa 23-07-26**
- **Không có trong audit ban đầu** — lộ ra khi tách nhóm "Modal xác nhận" của F-03.

**Triệu chứng:** bấm **Xoá thành viên** / **Cấm thành viên** / **Chuyển quyền trưởng nhóm** → **hai hộp thoại mở chồng lên nhau**.

**Nguyên nhân gốc:** hai state cùng mô tả một sự việc, và handler set **cả hai**:

```ts
const handleRemoveMember = useCallback((member) => {
  setPendingConfirm({ type: "remove-member", member });   // → mở ConfirmDialog
  setRemoveMemberTarget({ memberId, memberName });        // → mở RemoveMemberModal
}, ...);
```

`ConfirmDialog` mở khi `pendingConfirm !== null`, `RemoveMemberModal` mở khi `removeMemberTarget !== null`. Cả hai cùng khác null → cùng hiển thị. Y hệt với `ban-member` và `transfer-ownership`.

**Bug thứ hai, ngược chiều:** `handleDeleteGroup` chỉ set `deleteGroupTarget`, **không** set `pendingConfirm` → nhánh `"delete-group"` bên trong `ConfirmDialog` (title/message/confirmText) là **code chết**, không bao giờ chạy.

**Cách sửa (theo lựa chọn của user — giữ modal chuyên dụng):**

| Luồng | Sau khi sửa |
|---|---|
| Xoá / cấm thành viên, chuyển quyền, xoá nhóm | dùng `*Modal` chuyên dụng (nền `TypedConfirmationModal`) |
| **Rời nhóm** | giữ `ConfirmDialog` — **luồng duy nhất chưa có modal chuyên dụng** |

- Bỏ `pendingConfirm` + type `PendingGroupConfirm` + 3 khối `confirmTitle`/`confirmMessage`/`confirmText` (~24 dòng logic ba ngôi lồng nhau).
- Thay bằng một cờ đúng nghĩa: `isLeaveGroupConfirmOpen`.
- **Giữ nguyên** `DeleteGroupModal` vì nó bắt gõ đúng tên nhóm (`requiredConfirmationText`) — mức an toàn cao hơn `ConfirmDialog` cho thao tác không hoàn tác được.

**Kiểm chứng:** cả 5 handler giờ set **đúng một** state; `pendingConfirm` còn **0** lần xuất hiện trong file.

> **Bài học:** bug này không phải lỗi cẩu thả mà là hệ quả trực tiếp của nợ SRP. Trong một component 1807 dòng với 35 `useState`, việc hai state cùng mô tả một sự việc là gần như không thể phát hiện bằng mắt. Nó chỉ lộ ra khi gom state theo nhóm trách nhiệm.

---

## 5. Vì sao `chatStore.ts` (5099 dòng) CHƯA nên cắt vội

Kế hoạch xếp nó vào Phase 4. Sau khi đọc kỹ, **giữ nguyên đánh giá đó**, nhưng lý do đã đổi:

**Nó không tệ như số dòng gợi ý.** Đã đo:

| Chỉ số | Giá trị | Nhận xét |
|---|---|---|
| `.sort()` | **1** | rất tốt cho 5099 dòng |
| `.find()` / `.findIndex()` | 10 / 8 | chấp nhận được |
| Index tra cứu O(1) | `messageById`, `messageIdsByConversation`, `messageAliasIndexByConversation`, `conversationById` | **đã làm đúng** |
| Nơi tiêu thụ | **21 file** | đủ ít để cắt an toàn sau này |

Cấu trúc dữ liệu **đã được nghĩ kỹ** — không có ổ giải thuật tệ nào. Vấn đề thuần tuý là **kích thước** (~44 action + 35 field), tức nợ SRP chứ không phải nợ hiệu năng.

**Kết luận:** cắt `chatStore` là việc **giá trị vừa, rủi ro cao** → làm **sau cùng**, và chỉ khi user duyệt riêng. Sửa F-01 và F-02 cho lợi ích hiệu năng thật với rủi ro thấp hơn nhiều.

### 🟡 Phase 4 — 2 lát cắt an toàn đã thực hiện (23-07-26)

Theo đúng khuôn mẫu sẵn có trong repo (`chatStoreOutbox` / `chatStoreUnread` / `chatStoreTyping`): **hàm thuần nhận state, trả state mới** — không class, không giữ state riêng.

| Lát | Module | Dòng | Nội dung |
|---|---|---|---|
| 1 | [`messageNormalizer.ts`](../src/stores/messageNormalizer.ts) | 203 | `normalizeAttachments/Reactions/Mentions/LocationPayload`, `toDateObject` + 3 helper cơ sở |
| 2 | [`conversationCursor.ts`](../src/stores/conversationCursor.ts) | 128 | con trỏ phân trang, `computeCanonicalTotalUnreadCount`, `buildConversationIndexState` |

**Quy trình từng lát (bắt buộc, mục 2.5 của kế hoạch):**
viết test đặc tả **trước** → chạy xanh trên module mới → mới gỡ code cũ trong `chatStore` → `test:chat-runtime` ngay sau mỗi lát.

**Vì sao chọn đúng 2 nhóm này:** đã kiểm chứng bằng grep là **hoàn toàn thuần** — không một lần gọi `set()` / `get()` / store nào trong vùng cắt. Đây là ranh giới sạch nhất trong cả file.

**Đo được:** `chatStore.ts` **5101 → 4837 dòng (−264)**; **+37 test mới** (21 normalizer + 16 cursor).

> Ghi chú: `chatStore` từng export `__normalizeMessageForTest` — cửa hậu để test chọc vào hàm private. Sau lát 1, các hàm normalize đã test được trực tiếp, không cần cửa hậu nữa.

**Còn lại của Phase 4 (CHƯA làm, cần duyệt riêng):** phần lõi ~4.8k dòng vẫn là các action đóng/mở trên `set`/`get` — cắt tiếp là đụng vào state machine của timeline/outbox. Đó là lát cắt **rủi ro cao thật sự**, khác hẳn 2 lát thuần vừa rồi, nên phải tách PR và có kế hoạch test riêng.

---

## 6. Nợ lint tồn đọng (không do phiên này)

`npm run lint` → **97 lỗi + 21 warning**. Đã xác minh có sẵn từ trước. Nhóm chính:

- `@typescript-eslint/no-explicit-any` — vd [`types/pdfmake.d.ts:2,7`](../src/types/pdfmake.d.ts)
- `@typescript-eslint/no-unused-vars` — vd [`responsive/responsive.ts:154`](../src/responsive/responsive.ts#L154)
- **21 warning "Unused eslint-disable directive"** — các dòng `eslint-disable` không còn cần; đây là loại **an toàn nhất để dọn**, `--fix` xử lý được 5 cái.

**Đề xuất:** không gộp vào Phase 3. Tách một lượt dọn lint riêng, vì nó đụng rất nhiều file và sẽ làm nhiễu diff của phần refactor.

---

## 7. Thứ tự đề xuất cho Phase 3

Chỉ làm khi user duyệt:

1. **F-01** — giá trị cao nhất, rủi ro thấp nhất. Viết test cho comparator trước (giờ nó mới test được), rồi sửa 4 nơi gọi.
2. **F-02** — một dòng, làm luôn cùng F-01 vì cùng vùng sidebar.
3. **F-04** — đổi tên, cơ học, an toàn.
4. **F-03** — để riêng một PR; tách dần từng nhóm state, không làm một lượt.

**Không đưa vào Phase 3:** `chatStore` (Phase 4, cần duyệt riêng) · dọn lint (PR riêng) · vấn đề refresh token trong `localStorage` (đổi hành vi, cần user quyết — xem `WEB_AUDIT_PLAN.md` Phase 1).
