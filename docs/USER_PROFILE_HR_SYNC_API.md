# Yêu cầu API — Đồng bộ hồ sơ HR cho hồ sơ người dùng

> **Người yêu cầu:** FE web client (`chat-web-client`)
> **Đối tượng implement:** team BE `chat-api-service` (+ `@hacom/chat-shared-types`)
> **Trạng thái:** ĐỀ XUẤT — chờ BE xác nhận
> **Mục đích:** Hồ sơ người dùng hiển thị **cùng một bộ thông tin HR-chuẩn ở mọi nơi** —
> dù là xem hồ sơ của chính mình hay xem hồ sơ người khác (và người khác xem mình).

---

## 1. Bối cảnh & vấn đề

FE hiển thị hồ sơ ở các surface sau:

| Surface | File FE | Nguồn dữ liệu hiện tại |
|---|---|---|
| Cài đặt → Hồ sơ cá nhân (self) | `features/profile/components/ProfileSettingsSection.tsx` | hr-api `/auth/me` + chat profile |
| Panel "Hồ sơ của bạn" (self) | `components/info/UserProfile.tsx` (nhánh self) | hr-api `/auth/me` + chat profile |
| Dialog chỉnh sửa hồ sơ (header) | `features/profile/components/ProfileEditDialog.tsx` | hr-api `/auth/me` + chat profile |
| **Panel "Thông tin người dùng" (người khác)** | `components/info/UserProfile.tsx` (nhánh other) | **chat-api `GET /users/{id}`** |

FE đã gom toàn bộ logic resolve hồ sơ **của chính mình** về 1 hook chuẩn
`features/profile/useMyProfile.ts` (HR ưu tiên hơn chat). Ba surface self ở trên
đều đã đồng bộ.

**Vấn đề:** khi xem hồ sơ **người khác**, FE chỉ có chat-api `GET /users/{id}`.
FE **không được phép** gọi hr-api cho người khác — `hr-api-service` chỉ phục vụ
`/auth/me` (chính chủ) và attendance/calendar của chính mình. Hệ quả:

- Chức danh / phòng ban / công ty… của người khác lấy từ bản copy trong
  user-directory của chat-api. Nếu bản này **cũ/không sync với HR**, FE hiển thị
  sai (ví dụ thực tế: một nhân sự đã đổi chức danh trên HRM nhưng panel người khác
  vẫn hiện "Nhân viên").
- Other-user view **thiếu** các trường mà self view có (mã NV, email công ty,
  trạng thái nhân sự, ngày vào làm).

➡️ **FE không thể tự khắc phục.** Cần BE cung cấp dữ liệu HR-chuẩn cho **bất kỳ
user nào** qua chat-api.

---

## 2. Mục tiêu

1. `GET /users/{id}` và `POST /users/batch` trả về các trường HR-chuẩn cho **mọi**
   user, lấy **single source of truth từ HR** (employee record), đồng bộ vào
   user-directory.
2. Bộ trường đủ để other-user view khớp self view (xem mục 4).
3. Có quy tắc freshness/sync rõ ràng để không bị "kẹt" giá trị cũ (mục 6).

---

## 3. Hiện trạng hợp đồng

### 3.1 Self (đã chuẩn) — hr-api `GET /auth/me`
FE đọc `HrMeProfile.employee` (xem `features/api/hrProfileApi.ts`):

```ts
employee: {
  employeeCode, fullName, companyEmail, phone,
  dateOfJoining, employmentStatus,                 // "PROBATION|ACTIVE|SUSPENDED|TERMINATED|RESIGNED"
  unit: { name },          // Công ty
  department: { name },    // Phòng ban
  position: { name },      // Chức danh
}
```

### 3.2 Other-user — chat-api, DTO hiện có
`UserProfileSummaryDto` (`@hacom/chat-shared-types/src/dtos/user.dto.ts`), trả về bởi
`GET /users/{id}` và `POST /users/batch`:

```ts
interface UserProfileSummaryDto {
  id: string;
  username?: string | null;
  displayName?: string | null;
  fullName?: string | null;
  fullNameFromHr?: string | null;
  avatarUrl?: string | null;
  employeeCode?: string | null;
  department?: string | null;   // có sẵn
  position?: string | null;     // có sẵn — NHƯNG cần đảm bảo sync từ HR
  status?: string | null;
  updatedAt?: string | null;
}
```

> Ghi chú FE: panel người khác hiện đọc chức danh theo thứ tự
> `position → title → jobTitle`. Nếu BE trả `position` đúng (đã sync HR) thì FE
> hiện đúng ngay, **không cần đổi FE thêm**.

---

## 4. YÊU CẦU CHÍNH — bổ sung trường HR vào `UserProfileSummaryDto`

Bổ sung các field sau (tất cả lấy từ **HR employee record**, KHÔNG lưu tay ở chat
profile). Áp dụng cho cả `GET /users/{id}` và `POST /users/batch`.

| Field (DTO) | Kiểu | Nhãn FE | Nguồn HR (`employee.*`) | Bắt buộc | Quyền riêng tư |
|---|---|---|---|---|---|
| `position` | `string \| null` | Chức danh | `position.name` | ✅ (sync HR) | Công khai nội bộ |
| `department` | `string \| null` | Phòng ban | `department.name` | ✅ (sync HR) | Công khai nội bộ |
| `company` | `string \| null` | Công ty | `unit.name` | ✅ | Công khai nội bộ |
| `employeeCode` | `string \| null` | Mã nhân viên | `employeeCode` | ✅ | Công khai nội bộ |
| `employmentStatus` | `string \| null` (enum*) | Trạng thái nhân sự | `employmentStatus` | ➖ nên có | Cân nhắc policy |
| `dateOfJoining` | `string \| null` (ISO) | Ngày vào làm | `dateOfJoining` | ➖ nên có | Cân nhắc policy |
| `companyEmail` | `string \| null` | Email công ty | `companyEmail` | ➖ nên có | Cân nhắc policy |
| `phone` | `string \| null` | Số điện thoại | `phone` | ➖ tuỳ | Nhạy cảm — theo policy |

\* `employmentStatus` enum đúng theo HR: `PROBATION | ACTIVE | SUSPENDED | TERMINATED | RESIGNED`
(FE tự map sang nhãn vi/en, BE trả **mã enum thô**, không trả nhãn đã dịch).

> `company` đặt tên mới (HR `unit.name`) thay vì gộp vào `department`, để FE hiển
> thị "Phòng ban" và "Công ty" tách dòng đúng như self view.

### Bổ sung shared-types
Cập nhật `UserProfileSummaryDto` trong `@hacom/chat-shared-types/src/dtos/user.dto.ts`
(và bump version) để FE+BE dùng chung type. FE sẽ consume ngay khi field có mặt
(optional → backward-compatible, không breaking).

---

## 5. Hợp đồng response (giữ nguyên envelope hiện hành)

`GET /api/v1/users/{id}` → `200`:

```jsonc
{
  "success": true,
  "statusCode": 200,
  "data": {
    "id": "f5661fd8-4bf3-4f19-bf26-2c51b9efd89f",
    "username": "HC888890",
    "displayName": "Vũ Minh Quốc",
    "fullNameFromHr": "Vũ Minh Quốc",
    "avatarUrl": "https://.../avatar.jpg?X-Amz-...",
    "employeeCode": "HC888890",
    "position": "Trưởng phòng",          // ⬅️ giá trị HR mới, không phải bản cũ
    "department": "Ban Kinh tế Kỹ thuật",
    "company": "Công ty CPĐT Hacom Holdings",
    "employmentStatus": "ACTIVE",
    "dateOfJoining": "2026-06-11",
    "companyEmail": "quocvm@hacom...",
    "phone": "0385299251",
    "status": "online",
    "updatedAt": "2026-06-20T01:40:05.000Z"
  }
}
```

`POST /api/v1/users/batch` → `data.users[id]` mỗi phần tử có **đúng schema trên**
(các field HR áp dụng cho cả batch để timeline/danh bạ cũng nhất quán).

---

## 6. Nguồn dữ liệu & đồng bộ (quan trọng — đây là gốc của bug)

- Tất cả field HR ở mục 4 phải **đọc từ HR (employee record)** làm nguồn chuẩn,
  hợp nhất tại `src/services/user-directory.service.ts` (merge auth core + overlay
  `public.user_profiles`).
- **Không** để chức danh/phòng ban là giá trị nhập tay/cũ trong chat profile thắng
  giá trị HR.
- Cơ chế sync (tuỳ BE chọn, FE không ràng buộc): webhook từ HRM khi đổi
  chức vụ/phòng ban, hoặc cron đồng bộ định kỳ, hoặc enrich-on-read từ HR.
  **Yêu cầu:** sau khi HRM cập nhật, `GET /users/{id}` phản ánh giá trị mới trong
  vòng **≤ 5 phút** (FE cache user-directory 5 phút).

---

## 7. Quyền riêng tư

- `position`, `department`, `company`, `employeeCode`: coi như công khai nội bộ
  (đã hiển thị ở danh bạ/tìm kiếm).
- `phone`, `companyEmail`, `dateOfJoining`, `employmentStatus`: BE quyết định
  visibility rule (vd chỉ trả khi là bạn bè / cùng tổ chức, hoặc theo setting
  privacy của chủ hồ sơ). Nếu không được phép xem → trả `null`, FE tự ẩn field.

---

## 8. Phương án thay thế (nếu KHÔNG enrich được DTO)

Cung cấp endpoint HR-directory riêng cho user bất kỳ (BE proxy sang HR, có kiểm
quyền), ví dụ:

```
GET /api/v1/users/{id}/hr-profile      → trả khối employment HR như mục 4
```

FE sẽ gọi thêm endpoint này khi mở panel người khác (1 request/lần mở, có cache).
**Khuyến nghị vẫn ưu tiên Option mục 4** (enrich DTO) để tránh round-trip thừa và
giữ timeline/danh bạ nhất quán.

---

## 9. Checklist nghiệm thu

- [ ] `UserProfileSummaryDto` (shared-types) thêm: `company`, `employmentStatus`,
      `dateOfJoining`, `companyEmail`, `phone`; bump version.
- [ ] `GET /users/{id}` trả đủ field HR, lấy từ HR (không phải bản chat cũ).
- [ ] `POST /users/batch` trả cùng schema cho mọi id.
- [ ] `position`/`department`/`company` khớp **đúng** HRM hiện tại (test bằng 1
      nhân sự vừa đổi chức danh — không còn hiện giá trị cũ).
- [ ] `employmentStatus` trả **mã enum thô** (ACTIVE/…); `dateOfJoining` ISO `YYYY-MM-DD`.
- [ ] Field nhạy cảm trả `null` khi không đủ quyền (không lỗi 4xx).
- [ ] HRM đổi dữ liệu → `/users/{id}` cập nhật trong ≤ 5 phút.

---

## 10. Phía FE sẽ làm gì khi BE xong

- Other-user panel (`UserProfile.tsx`) hiển thị thêm: Mã nhân viên, Email công ty,
  Trạng thái nhân sự, Ngày vào làm — bằng đúng bộ nhãn/format như self view.
- `position` đã được đọc sẵn (không cần đổi).
- Không cần thay đổi cache/transport; chỉ map thêm field mới vào UI.
