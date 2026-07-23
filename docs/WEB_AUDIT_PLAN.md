# Kế hoạch rà soát & chuẩn hoá `chat-web-client`

> **Loại:** kế hoạch nội bộ FE (không phải file contract xuyên repo — xem `CLAUDE.md` mục 15 nếu đụng BE)
> **Phạm vi:** `chat-web-client/src` — cấu trúc dữ liệu, giải thuật, hướng đối tượng, SOLID, tái dùng code
> **Trạng thái:** PHASE 0 XONG · PHASE 1 XONG · PHASE 2 CHỜ DUYỆT
> **Ngày tạo:** 23-07-26
> **Nguyên tắc:** audit ra báo cáo trước → user duyệt → mới sửa. Không refactor mù trên diện rộng.

---

## 0. Vì sao phải chia phase

Số đo thật của repo (đo ngày 23-07-26, đã loại `src/poc/`):

| Chỉ số | Giá trị |
|---|---|
| File `.ts`/`.tsx` | **641** |
| Tổng dòng | **~128.800** |
| File test | **81** |
| Test case | **574** (563 pass · 4 fail · 7 skip) |

129k dòng là **quá lớn để sửa một lượt**. Một PR đụng nhiều file ở tầng dùng chung (`chatStore`, `useWebSocket`, `messageMerge`) mà lưới test đang thủng thì lỗi sẽ lọt ra production mà không ai thấy. Vì vậy: **vá lưới an toàn trước, đo trước, sửa sau, mỗi phase một PR review được.**

---

## 1. Hiện trạng — điều đã kiểm chứng, không phải phỏng đoán

### 1.1 Tin tốt: codebase kỷ luật hơn dự đoán

Đã quét trùng lặp toàn repo. **Không có bloat hàng loạt.** Các file trùng tên đều là re-export hợp lệ, không phải bản sao:

| File | Thực chất |
|---|---|
| `features/chat/api/chatApi.ts` (19 dòng) | facade gom `services/api.ts` — hợp lệ |
| `hooks/useSendMessage.ts` (5 dòng) | re-export thuần từ `features/chat/hooks/` — hợp lệ |
| `components/ui/Toast.tsx` (23 dòng) | container `react-hot-toast`; `utils/toast.tsx` là API gọi toast — **khác vai trò**, không trùng |
| `utils/messageIdentity.ts` vs `features/chat/domain/messageIdentity.ts` | ⚠️ **cần xác minh ở Phase 1** — hai file cùng tên, khác nội dung, là rủi ro thật |

→ Kết luận: **không cần "dọn rác lớn"**. Việc thật nằm ở vài file khổng lồ và ở lưới test.

### 1.2 Rủi ro #1: lưới an toàn đang thủng

**4 file test đỏ sẵn từ trước** (không do thay đổi nào của phiên này):

| File test đỏ | Ghi chú |
|---|---|
| `features/audio/__tests__/phase2c-audio.test.ts` | lỗi ở mức load file (suite chết cả file) |
| `hooks/useSendMessage.test.tsx` | 1 case: finalized attachments |
| `services/tokenService.test.ts` | 1 case: remember-me refresh token |
| `components/input/MessageInput.locationFlow.test.ts` | 2 case |

⚠️ `MessageInput.locationFlow.test.ts` assert bằng cách **đọc source dưới dạng chuỗi** (`expect(source).toContain("min-w-[108px]")`). Đây là test giòn: đổi class Tailwind là đỏ, dù UI vẫn đúng. Loại test này **cản trở refactor** và phải xử lý trước.

**Không refactor khi test đang đỏ** — vì khi đó không phân biệt được "đỏ sẵn" và "mình vừa làm hỏng".

### 1.3 Rủi ro #2: file khổng lồ = nơi SOLID vỡ

Top file theo số dòng (ứng viên chính của audit):

| Dòng | File | Nghi vấn |
|---|---|---|
| 4682 | `stores/chatStore.ts` | ⚠️ **God object.** Đã tách một phần (`chatStoreOutbox/Unread/Typing`) nhưng lõi vẫn 4.6k dòng → vi phạm SRP |
| 2845 | `hooks/useWebSocket.ts` | nhiều trách nhiệm trong 1 hook |
| 1969 | `services/api.ts` | khai báo mọi endpoint — chấp nhận được nếu chỉ là khai báo, cần xác minh |
| 1807 | `components/info/GroupInfo.tsx` | component quá lớn |
| 1609 | `components/input/MessageInput.tsx` | component quá lớn |
| 1493 | `pages/ChatPage.tsx` | trang điều phối quá nặng |
| 1445 | `features/calendar/pages/CalendarPage.tsx` | trang điều phối quá nặng |

> Dòng nhiều **không tự động là lỗi**. Phải đọc rồi mới kết luận — đó là việc của Phase 1.

### 1.4 Đã sửa (phát sinh ngoài kế hoạch, tại phiên 23-07-26)

`components/ui/SegmentedControl.tsx` — bug "UI Tất cả/Nhóm lệch":
nguyên nhân `flex-[1_0_auto]` khiến tab rộng theo nội dung → badge đổi số là layout nhảy.
Sửa: `grid auto-cols-fr grid-flow-col` (chia đều cột) + `truncate` label + `shrink-0 tabular-nums` badge.
Ăn theo cả `Sidebar` và 2 chỗ ở `FriendsPage`. Có test kèm: `SegmentedControl.test.tsx` ✅

---

## 2. Nguyên tắc an toàn (áp dụng cho MỌI phase)

1. **Một phase = một PR** (`git checkout -b`). Không gộp phase.
2. **Bắt đầu phase = chạy `npm test` ghi lại baseline.** Kết thúc phase, số test pass phải **≥** baseline.
3. **Cổng bắt buộc trước khi đóng phase:**
   ```bash
   npm run typecheck && npm run lint && npm test && npm run test:chat-runtime
   ```
   `test:chat-runtime` là bộ trọng yếu (timeline/merge/scroll/realtime) — **không được đỏ, không có ngoại lệ**.
4. **Sửa hành vi và sửa cấu trúc KHÔNG đi chung commit.** Refactor = hành vi giữ nguyên, test không phải sửa. Nếu buộc phải sửa test → đó là đổi hành vi → tách commit riêng, ghi rõ.
5. **Đụng file > 1000 dòng → phải có test phủ TRƯỚC khi đụng.** Không có test thì viết test trước (đặc tả hành vi hiện tại), rồi mới refactor.
6. **Casing import phải khớp tuyệt đối** — CI Linux đã từng gãy TS1261 vì Windows không phân biệt hoa/thường (`CLAUDE.md` mục 13).
7. **Không đụng contract BE.** Cần BE đổi field → mở file trong `chat-api-service/docs/requests/` theo quy ước `FE__...`, không tự chế.
8. **Dừng và hỏi** khi phát hiện việc vượt phạm vi phase, thay vì tự mở rộng.

---

## 3. Các phase

### PHASE 0 — Chốt baseline ✅ XONG

**Mục tiêu:** biết chính xác đang đứng ở đâu.

- [x] Đếm quy mô: 641 file / 128.8k dòng / 81 file test
- [x] Chạy `npm test` → **563 pass · 4 fail · 7 skip**
- [x] Quét trùng lặp toàn repo → không có bloat hàng loạt
- [x] Lập danh sách file khổng lồ
- [x] `npm run typecheck` → **sạch, 0 lỗi**

**Kết luận Phase 0:** rủi ro lớn nhất **không phải** code bẩn, mà là **lưới test thủng**. Đảo thứ tự ưu tiên: vá test trước, audit sau.

---

### PHASE 1 — Vá lưới an toàn ✅ XONG

**Kết luận quan trọng: cả 4 file đỏ đều là TEST LẠC HẬU, không có bug code nào.**

| # | File | Chẩn đoán | Cách vá |
|---|---|---|---|
| 1 | `features/audio/__tests__/phase2c-audio.test.ts` | Import sai 1 cấp + viết cho **Jest** (`jest.fn`, `require`) trong dự án **Vitest** → **chưa từng chạy được lần nào**. 13/23 case chỉ là `expect(true).toBe(true)`. Case 7 gọi `Object.values()` trên một **type** TS → luôn `undefined` | Viết lại: bỏ 13 case giả, giữ + mở rộng phần state machine thật → **11 case thật** |
| 2 | `services/tokenService.test.ts` | Không phải bug. `tokenService.ts:158` ghi rõ yêu cầu sản phẩm: *"stay logged in until explicit logout"* → refresh token luôn vào localStorage. Test cũ vẫn đòi `sessionStorage` | Sửa test theo code + **comment nêu rõ đánh đổi** |
| 3 | `hooks/useSendMessage.test.tsx` | Test assert **chặt hơn contract**: đòi payload không có `url`, nhưng `url` là field hợp lệ của `SendMessageAttachmentInput` (`chatApi.ts:115`), cùng nhóm metadata với `width`/`height`/`thumbnailUrl` | Giữ assert loại `objectKey`/`downloadUrl`/`expiresAt`; đổi `url` thành assert giá trị đúng |
| 4 | `components/input/MessageInput.locationFlow.test.ts` | Assert vào **class Tailwind** (`min-w-[108px]`…) đã đổi. Đã grep xác minh: **logic vị trí còn nguyên vẹn**. Thêm nữa nhãn thật là `Đang gửi vị trí…` (ký tự `…`) chứ không phải `Đang gửi...` | Viết lại chỉ assert hành vi: API geolocation, guard chống race, nhãn người dùng, `aria-label`, secure-context |

**⚠️ Ghi nhận rủi ro bảo mật (KHÔNG sửa ở phase này — đổi hành vi, vượt phạm vi):**
refresh token vào `localStorage` **kể cả khi user không tick "ghi nhớ đăng nhập"** → phiên sống qua đóng/mở trình duyệt; cờ `rememberMe` gần như chỉ còn ý nghĩa hiển thị. Code đúng theo yêu cầu sản phẩm đã ghi. Muốn tôn trọng lựa chọn "không ghi nhớ" thì sửa `storeTokens` (dùng `sessionStorage`) + cập nhật test — **cần user quyết riêng**.

**Kết quả cổng:**

| Cổng | Trước | Sau |
|---|---|---|
| `npm test` | 563 pass · **4 fail** | **580 pass · 0 fail** ✅ |
| `test:chat-runtime` | — | **118 pass / 12 file** ✅ |
| `npm run typecheck` | sạch | **sạch** ✅ |
| `npm run lint` (file đã sửa) | — | **0 lỗi** ✅ |

> `npm run lint` toàn repo vẫn **97 lỗi + 21 warning** — **nợ có sẵn từ trước**, không do phase này (`responsive.ts`, `pdfmake.d.ts`, …). Đưa vào Phase 2 để xếp hạng.

**Chưa làm (chuyển sang Phase 2):** xác minh `utils/messageIdentity.ts` vs `features/chat/domain/messageIdentity.ts` — không cần thiết để làm test xanh, và là việc đọc-hiểu đúng chất Phase 2.

---

### PHASE 2 — Audit ra báo cáo, KHÔNG sửa code 📋

**Việc:** đọc kỹ 7 file lớn ở mục 1.3, xuất báo cáo `docs/WEB_AUDIT_FINDINGS.md`.

Mỗi phát hiện ghi đúng format:

```
### F-xx · <tiêu đề>
- Vị trí:    <file:line>
- Loại:      SRP | DIP | tái-dùng | cấu-trúc-dữ-liệu | giải-thuật | chết
- Hiện trạng: <mô tả>
- Vì sao hại: <hệ quả CỤ THỂ, không nói chung chung>
- Đề xuất:    <cách sửa>
- Rủi ro sửa: THẤP | VỪA | CAO   ← quyết định nó rơi vào Phase 3 hay 4
- Test phủ:   CÓ | KHÔNG          ← KHÔNG thì phải viết test trước khi sửa
```

Soi riêng theo yêu cầu của user:
- **Cấu trúc dữ liệu:** chỗ nào duyệt mảng `O(n)` lặp lại trong khi Map/Set là `O(1)` — đặc biệt trong sidebar và merge timeline (chạy mỗi tin nhắn đến).
- **Giải thuật:** vòng lặp lồng nhau trên danh sách hội thoại/tin nhắn; sort lại toàn bộ khi chỉ cần chèn 1 phần tử.
- **Hướng đối tượng / SOLID:** `chatStore` 4.6k dòng — liệt kê từng nhóm trách nhiệm để đề xuất đường cắt.
- **Tái dùng:** logic bị chép ở nhiều component thay vì gọi helper chung (đúng ý "cái nào dùng chung thì dùng đi").

**Xong khi:** có `WEB_AUDIT_FINDINGS.md` với danh sách xếp hạng theo (giá trị ÷ rủi ro). **User duyệt chọn mục nào làm.**
**Ước lượng:** vừa · **Rủi ro: KHÔNG** (không đụng code)

---

### PHASE 3 — Sửa nhóm rủi ro THẤP ⚡

Chỉ làm các finding user đã duyệt và được xếp **rủi ro THẤP**: đổi cấu trúc dữ liệu cục bộ trong một hàm, gộp helper trùng, xoá code chết, tách component thuần UI.

**Quy tắc:** mỗi finding = **một commit riêng**, ghi `F-xx` trong message → hỏng cái nào revert đúng cái đó, không kéo theo cái khác.

**Xong khi:** cổng ở mục 2.3 xanh · số test pass ≥ baseline.
**Rủi ro: THẤP–VỪA**

---

### PHASE 4 — Cắt God object (chỉ khi user duyệt riêng) 🏗️

Dành cho `chatStore.ts` (4682 dòng) và `useWebSocket.ts` (2845 dòng).

**Đây là phase nguy hiểm nhất** — hai file này là tim của app: sai một nhịp là mất tin nhắn hoặc rớt realtime.

**Bắt buộc:**
1. Viết test đặc tả hành vi **hiện tại** trước, ✅ xanh, rồi mới đụng.
2. Cắt **từng lát một**, mỗi lát một commit, chạy `test:chat-runtime` sau **mỗi** lát.
3. Cắt theo trách nhiệm đã có sẵn tiền lệ trong repo (`chatStoreOutbox/Unread/Typing`) — theo lối đã có, không phát minh kiến trúc mới.
4. Giữ nguyên API công khai của store → component không phải sửa theo.

**Chỉ khởi động khi user duyệt riêng phase này.** Không tự động chạy tiếp sau Phase 3.
**Rủi ro: CAO**

---

## 4. Việc KHÔNG làm

Ghi rõ để tránh phình phạm vi:

- ❌ Không đổi kiến trúc dual-state Redux + Zustand. Nó cố ý (`CLAUDE.md` mục 4), đổi là viết lại cả app.
- ❌ Không thêm thư viện mới. Vấn đề hiện tại không phải do thiếu lib.
- ❌ Không đổi màu/design token khi đang refactor — trộn vào là không review nổi diff.
- ❌ Không đụng `src/poc/`.
- ❌ Không sửa file contract của bên khác (`API__`, `AUTH__`, `HR__`, `TYPES__`).
- ❌ Không "tiện tay sửa luôn" thứ ngoài finding đã duyệt.

---

## 5. Bảng theo dõi

| Phase | Nội dung | Rủi ro | Trạng thái |
|---|---|---|---|
| 0 | Chốt baseline | — | ✅ XONG |
| 1 | Vá 4 test đỏ | THẤP | ✅ XONG — 580 pass · 0 fail |
| 2 | Audit → `WEB_AUDIT_FINDINGS.md` | KHÔNG | ✅ XONG — 4 finding (F-01…F-04) |
| 3 | Sửa F-01 + F-02 + F-04 | THẤP–VỪA | ✅ XONG — 588 pass · 0 fail · build ✓ |
| 3b | F-03 (`GroupInfo` 35 useState) | VỪA | 🟡 2/6 nhóm đã tách — 591 pass · 0 fail · build ✓ |
| 4 | Cắt `chatStore` / `useWebSocket` | CAO | ⬜ chờ user duyệt riêng |

**Ngoài kế hoạch — đã xong:** sửa `SegmentedControl` (bug tab lệch) + test kèm.

---

## 6. Lệnh hay dùng

```bash
# baseline / cổng đóng phase
npm run typecheck && npm run lint && npm test && npm run test:chat-runtime

# bộ trọng yếu — chạy sau MỖI lát cắt ở Phase 4
npm run test:chat-runtime

# chạy 1 file test khi đang vá Phase 1
npx vitest run src/<đường-dẫn>.test.tsx

# trước khi push (theo CLAUDE.md mục 13)
npm run build && node scripts/verify-dist-assets.mjs
```
