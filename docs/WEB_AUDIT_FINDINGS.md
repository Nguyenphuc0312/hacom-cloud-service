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
| **F-06** | `asRecord` / `asString` chép nguyên ở ~20 file | tái-dùng | THẤP (4 file) | VỪA |

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

## F-07 · Refresh token bỏ qua lựa chọn "ghi nhớ đăng nhập" 🔴 ĐÃ SỬA

- **Vị trí:** [`services/tokenService.ts`](../src/services/tokenService.ts) — `storeTokens`
- **Loại:** bảo mật / đúng ý người dùng · **Đã sửa 23-07-26**
- Phát hiện từ Phase 1 (test đỏ `tokenService.test.ts`), treo chờ duyệt vì **đổi hành vi đăng nhập**.

**Hiện trạng cũ:** refresh token **luôn** ghi vào `localStorage`, bất kể người dùng có tick "ghi nhớ đăng nhập" hay không. Hệ quả: ô tick chỉ còn ý nghĩa hiển thị, và trên máy dùng chung phiên vẫn sống sau khi đóng trình duyệt.

**Sau khi sửa:**

| Lựa chọn | Nơi lưu | Vòng đời |
|---|---|---|
| Có tick ghi nhớ | `localStorage` | sống qua đóng/mở trình duyệt |
| Không tick | `sessionStorage` | đóng tab là mất phiên |

**Vì sao an toàn:** `getRefreshToken()` vốn đã đọc **cả hai** storage nên không phải sửa chỗ đọc. Luồng refresh dùng `isRememberMeEnabled()` đọc cờ đã lưu nên vẫn nhất quán.

Thêm 2 test: đổi lựa chọn giữa hai lần đăng nhập **dọn sạch storage cũ** (token không nằm lại hai nơi), và `getRefreshToken` đọc được từ cả hai nguồn.

---

## F-06 · `asRecord` / `asString` bị chép khắp repo ✅ ĐÃ SỬA

- **Loại:** tái-dùng · **Rủi ro sửa: THẤP (4 file) / VỪA (phần còn lại)**
- Phát hiện khi rà lại chính code của phiên này — 2 trong 4 bản trùng là **do phiên này tạo ra**.

**Hiện trạng:** `asRecord` và `asString` là hai type-guard 2 dòng, bị **chép nguyên** ở khoảng **20 file**.

### ✅ Đã gộp (4 file — giống hệt nhau từng ký tự)

Tạo [`utils/payloadGuards.ts`](../src/utils/payloadGuards.ts) làm nguồn duy nhất, 4 nơi trỏ về:
`stores/messageNormalizer.ts` · `hooks/realtimePayload.ts` · `hooks/usePresence.ts` · `stores/friendshipStore.ts`

Hai module đầu **re-export** lại nên nơi gọi cũ (`chatStore`, `useWebSocket`) không phải sửa.

**Giữ riêng `asString` và `asStringValue`** dù chỉ khác kiểu trả về (`null` vs `undefined`): nơi gọi phụ thuộc đúng kiểu đó trong các chuỗi `??`. Đã có test khoá lại khác biệt này để lần sau không ai gộp nhầm.

### ✅ Đã gộp nốt phần còn lại (23-07-26) — tổng **19 file**

Phân loại bằng **vân tay MD5** từng bản thay vì đọc mắt thường, ra 4 nhóm:

| Nhóm | Số file | Xử lý |
|---|---|---|
| `asRecord` chuẩn | 9 | ✅ gộp → `payloadGuards.asRecord` |
| `asString` trả `null` | 5 | ✅ gộp → `payloadGuards.asString` |
| `asString` trả `undefined` | 4 | ✅ gộp → `payloadGuards.asStringValue` (import kèm alias, không phải sửa lời gọi) |
| **Hành vi khác** | 3 | ⛔ **giữ nguyên có chủ ý** |

Hai biến thể `asRecord` tưởng khác hoá ra tương đương: `conversationRanking` chỉ khác alias kiểu, `ProfileEditDialog` dùng `value &&` thay `value !== null` — khác duy nhất ở `0`/`""` mà cả hai đều trả `null` vì không phải object.

### ⛔ 3 file CỐ Ý không gộp

| File | Hành vi riêng |
|---|---|
| `features/auth/api/authApi.ts` | trả **bản đã trim** (chuẩn trả chuỗi gốc) |
| `features/auth/utils/authErrorMapper.ts` | như trên |
| `features/chat/identity/resolveUserDisplayName.ts` | trả `""`, **không phải `null`** |

Gộp chúng sẽ **đổi hành vi âm thầm** ở tầng auth và hiển thị tên — đúng loại bug khó truy nhất. Muốn gộp thì phải sửa cả nơi gọi, là việc khác.

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

### 🟡 Phase 4 — 10 lát cắt an toàn đã thực hiện (23-07-26)

Theo đúng khuôn mẫu sẵn có trong repo (`chatStoreOutbox` / `chatStoreUnread` / `chatStoreTyping`): **hàm thuần nhận state, trả state mới** — không class, không giữ state riêng.

| Lát | Module | Dòng | Nội dung |
|---|---|---|---|
| 1 | [`messageNormalizer.ts`](../src/stores/messageNormalizer.ts) | 203 | `normalizeAttachments/Reactions/Mentions/LocationPayload`, `toDateObject` + 3 helper cơ sở |
| 2 | [`conversationCursor.ts`](../src/stores/conversationCursor.ts) | 128 | con trỏ phân trang, `computeCanonicalTotalUnreadCount`, `buildConversationIndexState` |
| 3 | [`conversationSummaryMerge.ts`](../src/stores/conversationSummaryMerge.ts) | 158 | `shouldApplyConversationSummary` + `mergeConversationSummary` — **stale-read guard** |
| 4 | [`messageOrdering.ts`](../src/stores/messageOrdering.ts) | 97 | `compareMessages`, `sortMessages`, `matchesMessage`, `resolveMessageMatchIndex` — **thứ tự + nhận dạng tin nhắn** |
| 5 | [`realtimePayload.ts`](../src/hooks/realtimePayload.ts) | 143 | đọc & phân loại payload WebSocket — cắt từ `useWebSocket.ts`, không phải `chatStore` |
| 6 | [`messageMergeRecords.ts`](../src/stores/messageMergeRecords.ts) | 224 | trộn hai bản ghi cùng một tin + khử trùng lặp — **version-guard, ack optimistic** |
| 7 | [`senderProfiles.ts`](../src/stores/senderProfiles.ts) | 287 | chuẩn hoá hồ sơ người gửi + áp vào tin nhắn/hội thoại — **giữ tham chiếu khi không đổi** |
| 8 | [`sendFailure.ts`](../src/stores/sendFailure.ts) | 129 | phân loại lý do gửi thất bại + trạng thái kết nối |
| 9 | [`messageAliasIndex.ts`](../src/stores/messageAliasIndex.ts) | 98 | quy mọi bí danh tin nhắn về một id chuẩn |
| 10 | [`conversationSummaryState.ts`](../src/stores/conversationSummaryState.ts) | 191 | preview tin cuối + mốc hoạt động + tiến độ đọc |

**Quy trình từng lát (bắt buộc, mục 2.5 của kế hoạch):**
viết test đặc tả **trước** → chạy xanh trên module mới → mới gỡ code cũ trong `chatStore` → `test:chat-runtime` ngay sau mỗi lát.

**Vì sao chọn đúng 2 nhóm này:** đã kiểm chứng bằng grep là **hoàn toàn thuần** — không một lần gọi `set()` / `get()` / store nào trong vùng cắt. Đây là ranh giới sạch nhất trong cả file.

**Đo được:**

| File | Trước | Sau |
|---|---|---|
| `chatStore.ts` | 5101 | **3891** (−1210, −24%) |
| `useWebSocket.ts` | 3104 | **3016** (−88) |

**+178 test mới**: 21 normalizer · 16 cursor · 15 summary-merge · 24 ordering · 23 realtime-payload · 17 merge-records · 18 sender-profiles · 12 send-failure · 14 alias-index · 18 conversation-summary-state.

**Lát 10 — bắt được một thay đổi hành vi của chính mình:** khi tách, tôi định gộp logic inline trong `updateConversationActivitySummary` vào `toConversationLastMessageStatus` (trông giống hệt nhau). Kiểm lại thì **khác thật**: bản inline không có nhánh `"pending"` — tin đang gửi được coi là `"sent"` ngay để preview sidebar không nhấp nháy trong lúc chờ ack.

Đã **trả về logic gốc** và thêm test khoá lại chính khác biệt đó, để lần sau ai định gộp sẽ thấy ngay. Gộp hai nhánh là đổi hành vi — phải là quyết định riêng, không nhét vào một lát refactor.

**Lát 7 — bất biến dễ vỡ nhất:** `applySenderProfiles*` chạy trên **cả trang tin nhắn mỗi lần có payload mới**. Bất biến sống còn là **giữ nguyên tham chiếu khi không có gì đổi** — tạo object mới vô cớ sẽ khiến toàn bộ timeline re-render. Trước đây không có test nào bảo vệ điều này; giờ có 3 test riêng cho nó (message, mảng message, participant).

Nhân tiện gom 6 lần lặp `x && x.trim().length > 0` thành helper `hasContent` — cùng logic, đọc rõ hơn.

**Lát 6 — phần dày bất biến nhất:** `mergeMessageRecords` trộn hai bản ghi cùng một tin đến từ 3 nguồn (REST, WebSocket, optimistic cục bộ), mỗi nguồn thiếu/thừa field khác nhau và có thể đến sai thứ tự. 17 test khoá lại các bất biến mà trước đây không có gì bảo vệ:

- Field `undefined` của bản đến **không xoá** dữ liệu đang hiển thị (payload realtime chỉ mang vài field thay đổi)
- Version thấp hơn **không ghi đè** bản mới; `version` luôn tiến
- Ack về: id tạm được thay bằng id thật, `localId` **giữ vết** id cũ để lần đối chiếu sau vẫn nhận ra nhau
- `sendState: "failed"` của bản đến **thắng cả ack** — không nuốt lỗi
- `transportStatus` chỉ tiến (`synced_stream` > `acked_transport`), không tụt
- Gửi xong thì **dọn sạch** dấu vết lỗi cũ, tránh UI hiện cảnh báo ma

**Lát 5 — vì sao đáng làm dù diff nhỏ:** `shouldSkipGroupConversationRefreshForCurrentUser` và `shouldUseDeltaConversationRefresh` đã được `export` sẵn (dấu hiệu ai đó định test) nhưng **chưa có một test nào**. Đây là logic quyết định có gọi lại API refresh hay không — sai thì hoặc thừa request, hoặc danh sách hội thoại đứng im. Giờ đã có 23 test phủ, và `useWebSocket.ts` vẫn giữ nguyên API công khai qua re-export nên nơi gọi không phải sửa.

**Lát 4 gỡ thêm một trùng lặp ở tầng lõi** — đúng thứ user nêu từ đầu (*"cái nào dùng chung thì dùng đi"*):

| Hàm | Tình trạng trước | Sau |
|---|---|---|
| `toMessageIdentityKeys` | **chép nguyên** ở `chatStore` và `domain/messageIdentityMatching` | dùng chung bản domain, `chatStore` re-export |
| `compareMessages` | hai bản gần y hệt (`chatStore` vs `domain/messageOrdering`) | **chưa gộp** — xem dưới |

Đã viết [`messageOrdering.equivalence.test.ts`](../src/stores/messageOrdering.equivalence.test.ts) **đối chứng hai bản `compareMessages`**: tương đương trên 9 trường hợp (seq, serverTs, localOrder, createdAt, stableId, id, thiếu-seq, thiếu-localOrder, trùng hệt). Khác biệt **duy nhất**: bản domain đọc thêm `messageSeq` làm seq dự phòng.

**✅ ĐÃ GỘP (23-07-26).** Căn cứ quyết định: [`chatStore.ts:552`](../src/stores/chatStore.ts#L552) — `normalizeMessage` **đã gộp `messageSeq` vào `serverSeq`** (`asNumberValue(source.serverSeq) ?? asNumberValue(source.messageSeq)`) từ trước. Nên message nằm trong store không bao giờ có `messageSeq` mà thiếu `serverSeq` → khác biệt giữa hai bản **không tới được store**.

`stores/messageOrdering.ts` giờ re-export thẳng `compareMessages` của domain. Test đối chứng giữ lại làm bằng chứng, kèm một case mới xác nhận sau chuẩn hoá thì hai bản khớp tuyệt đối.

**Riêng lát 3 — phần đáng giá nhất:** `mergeConversationSummary` là logic tinh vi nhất store, chống race giữa optimistic `markAsRead` và response cũ về muộn (comment trong code cho thấy nó đã sửa qua nhiều bug thật: BIGINT về dạng chuỗi, phân biệt "dữ liệu cũ" với "dữ liệu thiếu"). Trước đây nó không có test riêng. Giờ 15 test khoá lại đúng các bất biến đó — ví dụ *server không gửi checkpoint là THIẾU dữ liệu, không phải dữ liệu cũ, nên vẫn phải nhận unread mới*.

`chatStoreUnread.test.ts` (429 dòng, test đúng vùng read-state này) vẫn xanh sau lát 3 — bằng chứng mạnh là hành vi không đổi.

> Ghi chú: `chatStore` từng export `__normalizeMessageForTest` — cửa hậu để test chọc vào hàm private. Sau lát 1, các hàm normalize đã test được trực tiếp, không cần cửa hậu nữa.

**Còn lại của Phase 4 (CHƯA làm, cần duyệt riêng):** phần lõi ~4.8k dòng vẫn là các action đóng/mở trên `set`/`get` — cắt tiếp là đụng vào state machine của timeline/outbox. Đó là lát cắt **rủi ro cao thật sự**, khác hẳn 2 lát thuần vừa rồi, nên phải tách PR và có kế hoạch test riêng.

---

## 6. Nợ lint tồn đọng (không do phiên này)

`npm run lint` → **97 lỗi + 21 warning**. Đã xác minh có sẵn từ trước. Nhóm chính:

- `@typescript-eslint/no-explicit-any` — vd [`types/pdfmake.d.ts:2,7`](../src/types/pdfmake.d.ts)
- `@typescript-eslint/no-unused-vars` — vd [`responsive/responsive.ts:154`](../src/responsive/responsive.ts#L154)
- **21 warning "Unused eslint-disable directive"** — các dòng `eslint-disable` không còn cần; đây là loại **an toàn nhất để dọn**, `--fix` xử lý được 5 cái.

### ✅ Đã dọn phần an toàn (23-07-26): **116 → 103 problems**, **96 → 87 errors**

| Nhóm | Cách xử lý |
|---|---|
| `no-unused-vars` — **9 lỗi**, tất cả là biến tiền tố `_` | Sửa **`eslint.config.js`** thêm `argsIgnorePattern: "^_"` (+ vars/caught/destructured). Codebase đã dùng quy ước này sẵn, chỉ là lint chưa biết → **lỗi giả**. Một chỗ sửa, hết 9 lỗi, không đụng file nguồn nào. |
| `catch (err)` không dùng | Đổi thành `catch {}` — `AudioBubble.tsx` |
| **Unused eslint-disable** — 4 directive thừa | Xoá: `ComposerLinkPreview` · `TipTapEditor` · `WeekView` · `sseWithAuth` |
| `src/poc/` | ⛔ bỏ qua đúng quy tắc mục 4 của kế hoạch |

### ⬜ Còn lại 87 errors — vì sao chưa dọn

| Rule | Số | Bản chất |
|---|---|---|
| `react-hooks/set-state-in-effect` | 46 | **Đổi hành vi thật** — phải viết lại luồng effect từng chỗ, không phải dọn hình thức |
| `react-hooks/exhaustive-deps` | 19 | Thêm deps có thể gây vòng lặp render; phải đọc từng hook |
| `react-refresh/only-export-components` | 10 | Đổi cấu trúc export của module |
| `react-hooks/preserve-manual-memoization` | 9 | Đụng memo hoá thủ công ở hot path |

Cả 4 nhóm đều **không phải sửa cơ học** — mỗi lỗi cần đọc hiểu ngữ cảnh và có rủi ro đổi hành vi. Đó là công việc riêng, không nên trộn vào một PR "dọn lint".

---

## 7. Thứ tự đề xuất cho Phase 3

Chỉ làm khi user duyệt:

1. **F-01** — giá trị cao nhất, rủi ro thấp nhất. Viết test cho comparator trước (giờ nó mới test được), rồi sửa 4 nơi gọi.
2. **F-02** — một dòng, làm luôn cùng F-01 vì cùng vùng sidebar.
3. **F-04** — đổi tên, cơ học, an toàn.
4. **F-03** — để riêng một PR; tách dần từng nhóm state, không làm một lượt.

**Không đưa vào Phase 3:** `chatStore` (Phase 4, cần duyệt riêng) · dọn lint (PR riêng) · vấn đề refresh token trong `localStorage` (đổi hành vi, cần user quyết — xem `WEB_AUDIT_PLAN.md` Phase 1).
