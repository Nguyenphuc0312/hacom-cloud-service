# Spec Frontend: Tính năng Báo cáo Công việc Hàng ngày

> **Ngày:** 2026-05-30  
> **Backend:** đã hoàn thiện — FE chỉ cần implement phần UI và kết nối API  
> **Tags liên quan:** `#baocaocongviec` (user), `#baocaocv` (admin)

---

## Tổng quan luồng

```
User gõ #baocaocongviec
        ↓
Backend trả SSE event: form_request
        ↓
FE render form 4 cột (bảng)
        ↓
User điền → Submit
        ↓
FE gọi POST /api/work-reports
        ↓
Hiển thị thông báo thành công
```

```
Admin gõ #baocaocv
        ↓
Backend trả SSE event: selection_request
        ↓
FE render danh sách phòng ban (checkbox) + date picker
        ↓
Admin chọn → Xem báo cáo
        ↓
FE gọi GET /api/work-reports?department=X&start=...&end=...
        ↓
FE render bảng kết quả
```

---

## 1. Xử lý SSE Events mới

Trong hàm xử lý stream SSE hiện tại, thêm 2 case mới:

```javascript
// Giả sử hàm handleSseEvent(eventName, data) đang có sẵn
// Thêm 2 case sau:

switch (eventName) {
    // ... các case cũ (token, done, error, session, ...) giữ nguyên ...

    case 'form_request':
        if (data.form_type === 'daily_work_report') {
            showDailyWorkReportForm(data);
        }
        break;

    case 'selection_request':
        if (data.selection_type === 'department_report') {
            showDepartmentSelector(data);
        }
        break;
}
```

> **Lưu ý:** Khi nhận `form_request` hoặc `selection_request`, FE **không render token** vào bubble chat.  
> Thay vào đó render component tương ứng (form / selector) ngay trong luồng chat.

---

## 2. SSE Event: `form_request`

### Cấu trúc data từ backend

```json
{
  "form_type": "daily_work_report",
  "date": "2026-05-30",
  "employee_code": "HC001",
  "fields": ["task_name", "requirements", "completed", "difficulties"],
  "field_labels": {
    "task_name": "Tên công việc",
    "requirements": "Yêu cầu",
    "completed": "Đã làm được",
    "difficulties": "Khó khăn"
  },
  "existing": null,
  "submit_endpoint": "POST /api/work-reports"
}
```

**`existing`** — nếu user đã báo cáo hôm nay, sẽ có giá trị:
```json
{
  "task_name": "Nội dung cũ",
  "requirements": "...",
  "completed": "...",
  "difficulties": "..."
}
```
→ Pre-fill form để user sửa lại.

---

### UI Component: `WorkReportForm`

**Layout bảng (responsive):**

```
┌─── Báo cáo công việc ngày 30/05/2026 ─────────────────────────────┐
│                                                                      │
│  Tên công việc  │  Yêu cầu  │  Đã làm được  │  Khó khăn           │
│  ─────────────────────────────────────────────────────────────────  │
│  [textarea]     │ [textarea] │   [textarea]  │  [textarea]          │
│                                                                      │
│                                        [Hủy]  [💾 Lưu báo cáo]    │
└──────────────────────────────────────────────────────────────────────┘
```

**Gợi ý render trên mobile** (stack dọc thay vì bảng ngang):
```
Tên công việc:  [textarea]
Yêu cầu:        [textarea]
Đã làm được:    [textarea]
Khó khăn:       [textarea]
                [Hủy] [Lưu]
```

---

### API Call: Lưu báo cáo
https://ai-chat.fitora.id.vn/docs
**`POST /api/work-reports`**

```javascript
async function submitDailyReport(formData, eventData) {
    const body = {
        employee_code: eventData.employee_code,
        report_date:   eventData.date,          // "YYYY-MM-DD"
        task_name:     formData.task_name,
        requirements:  formData.requirements,
        completed:     formData.completed,
        difficulties:  formData.difficulties,
    };

    try {
        const res = await fetch('/api/work-reports', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Thêm auth header nếu hệ thống cần
            },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Lỗi không xác định');
        }

        const result = await res.json();
        // result.ok === true, result.report chứa dữ liệu đã lưu
        showSuccessMessage('Đã lưu báo cáo công việc!');
        closeForm();

    } catch (err) {
        showErrorMessage(`Không thể lưu: ${err.message}`);
    }
}
```

**Response thành công:**
```json
{
  "ok": true,
  "report": {
    "id": 42,
    "user_id": "HC001",
    "report_date": "2026-05-30",
    "task_name": "...",
    "requirements": "...",
    "completed": "...",
    "difficulties": "...",
    "created_at": "2026-05-30T08:30:00+07:00",
    "updated_at": "2026-05-30T08:30:00+07:00"
  }
}
```

> **Upsert behavior:** Nếu user báo cáo lại cùng ngày → backend tự cập nhật, không tạo duplicate.

---

## 3. SSE Event: `selection_request`

### Cấu trúc data từ backend

```json
{
  "selection_type": "department_report",
  "title": "Chọn phòng ban/đơn vị để xem báo cáo công việc:",
  "options": [
    {
      "label": "Phòng CNTT",
      "value": "Phòng CNTT",
      "type": "department",
      "company": "Hacom Holdings",
      "count": 5
    },
    {
      "label": "Phòng Kế toán",
      "value": "Phòng Kế toán",
      "type": "department",
      "company": "Hacom Holdings",
      "count": 3
    }
  ],
  "multi_select": true,
  "date_range": true,
  "fetch_endpoint": "GET /api/work-reports"
}
```

**`options`** được lấy từ DB thực tế — chỉ hiển thị các phòng ban **có báo cáo**.  
`count` = số báo cáo của phòng ban đó (hiển thị gợi ý cho admin).

---

### UI Component: `DepartmentSelector`

```
┌─── Xem báo cáo công việc ──────────────────────────────────────────┐
│                                                                      │
│  Chọn phòng ban/đơn vị:                                             │
│                                                                      │
│  ☑ Phòng CNTT          (5 báo cáo)                                 │
│  ☐ Phòng Kế toán       (3 báo cáo)                                 │
│  ☐ Phòng Kinh doanh    (8 báo cáo)                                 │
│                                                                      │
│  Từ ngày: [01/05/2026]    Đến ngày: [30/05/2026]                   │
│                                                                      │
│                                        [Hủy]  [📊 Xem báo cáo]    │
└──────────────────────────────────────────────────────────────────────┘
```

**Default date range:** Đầu tháng hiện tại → hôm nay.

---

### API Call: Lấy báo cáo theo phòng ban

**`GET /api/work-reports`**

```javascript
async function fetchDepartmentReport(selectedDepts, startDate, endDate) {
    const allReports = [];

    // Nếu chọn nhiều phòng ban → gọi song song
    const requests = selectedDepts.map(dept =>
        fetch(`/api/work-reports?department=${encodeURIComponent(dept)}&start=${startDate}&end=${endDate}`)
            .then(res => res.json())
    );

    const results = await Promise.all(requests);

    for (const result of results) {
        if (result.reports) {
            allReports.push(...result.reports);
        }
    }

    // Sắp xếp theo ngày rồi theo tên
    allReports.sort((a, b) => a.date.localeCompare(b.date) || a.user_name.localeCompare(b.user_name));

    renderWorkReportTable(allReports, startDate, endDate);
}
```

**Response từ API:**
```json
{
  "mode": "department",
  "department": "Phòng CNTT",
  "company": "",
  "start": "2026-05-01",
  "end": "2026-05-30",
  "count": 15,
  "reports": [
    {
      "user_id": "HC001",
      "user_name": "Nguyễn Văn A",
      "department": "Phòng CNTT",
      "date": "2026-05-30",
      "task_name": "Phát triển tính năng X",
      "requirements": "Hoàn thành trước 17h",
      "completed": "Xong 80%, còn test",
      "difficulties": "Thiếu tài liệu API"
    }
  ]
}
```

---

### UI Component: `WorkReportTable`

```
┌─── Báo cáo công việc — Phòng CNTT (01/05 – 30/05/2026) ───────────┐
│  15 báo cáo                              [📥 Xuất Excel]  [🖨 In]  │
├──────────────────┬────────────┬──────────────────┬──────────────────┤
│ Nhân viên        │ Ngày       │ Tên công việc    │ Đã làm được      │
│                  │            │ / Yêu cầu        │ / Khó khăn       │
├──────────────────┼────────────┼──────────────────┼──────────────────┤
│ Nguyễn Văn A     │ 30/05/2026 │ Phát triển X     │ Xong 80%         │
│                  │            │ Yêu cầu: ...     │ Khó khăn: ...    │
├──────────────────┼────────────┼──────────────────┼──────────────────┤
│ Trần Thị B       │ 30/05/2026 │ Fix bug Y        │ Hoàn thành       │
└──────────────────┴────────────┴──────────────────┴──────────────────┘
```

> Gợi ý: Gộp `task_name + requirements` vào 1 cột và `completed + difficulties` vào 1 cột để bảng gọn hơn trên màn hình nhỏ.

---

## 4. API endpoints đầy đủ

### `POST /api/work-reports` — Lưu báo cáo ngày

| | |
|--|--|
| **Method** | `POST` |
| **Content-Type** | `application/json` |

**Request body:**
```json
{
  "employee_code": "HC001",
  "report_date": "2026-05-30",
  "task_name": "Nội dung công việc",
  "requirements": "Yêu cầu đặt ra",
  "completed": "Những gì đã làm được",
  "difficulties": "Khó khăn gặp phải"
}
```

| Field | Bắt buộc | Ghi chú |
|-------|----------|---------|
| `employee_code` | ✅ | Mã nhân viên |
| `task_name` | ✅ | Không được để trống |
| `report_date` | ❌ | Mặc định hôm nay nếu không truyền |
| `requirements` | ❌ | Để trống `""` nếu không có |
| `completed` | ❌ | Để trống `""` nếu không có |
| `difficulties` | ❌ | Để trống `""` nếu không có |

---

### `GET /api/work-reports` — Lấy báo cáo

**Xem báo cáo cá nhân (user tự xem):**
```
GET /api/work-reports?employee_code=HC001&start=2026-05-01&end=2026-05-30
```

**Xem theo phòng ban (admin):**
```
GET /api/work-reports?department=Phòng CNTT&start=2026-05-01&end=2026-05-30
```

**Xem theo công ty (admin):**
```
GET /api/work-reports?company=Hacom Holdings&start=2026-05-01&end=2026-05-30
```

| Param | Bắt buộc | Ghi chú |
|-------|----------|---------|
| `employee_code` | Một trong 3 | Xem cá nhân |
| `department` | Một trong 3 | Admin xem phòng ban |
| `company` | Một trong 3 | Admin xem công ty |
| `start` | ❌ | Mặc định đầu tháng |
| `end` | ❌ | Mặc định hôm nay |

---

### `GET /api/work-reports/departments` — Danh sách phòng ban

```
GET /api/work-reports/departments
```

**Response:**
```json
{
  "departments": [
    { "department": "Phòng CNTT", "company": "Hacom Holdings", "count": 5 },
    { "department": "Phòng Kế toán", "company": "Hacom Holdings", "count": 3 }
  ],
  "count": 2
}
```

> **Dùng khi:** Backend không có phòng ban trong SSE event (list rỗng) — FE tự gọi endpoint này để lấy danh sách.

---

### `GET /api/work-reports/print` — In báo cáo HTML

```
GET /api/work-reports/print?employee_code=HC001&start=2026-05-01&end=2026-05-30
```

> Trả về HTML sẵn sàng in — mở trong tab mới là tự print. Giữ nguyên behavior cũ, đã được cập nhật để hiển thị 4 cột mới.

---

## 5. Tóm tắt checklist cho FE

### Phải làm (bắt buộc)
- [ ] Thêm handler SSE event `form_request` → gọi `showDailyWorkReportForm()`
- [ ] Thêm handler SSE event `selection_request` → gọi `showDepartmentSelector()`
- [ ] Component `WorkReportForm`: form 4 cột, pre-fill nếu `existing` không null, gọi `POST /api/work-reports`
- [ ] Component `DepartmentSelector`: checkbox list + date picker, gọi `GET /api/work-reports?department=X`
- [ ] Component `WorkReportTable`: render bảng kết quả

### Không cần làm
- ❌ Không cần sửa SSE connection logic
- ❌ Không cần sửa chat input, auth, routing hiện tại
- ❌ `#congviectuan` và `#tongcvtuan` không liên quan, giữ nguyên

---

## 6. Lưu ý kỹ thuật

**UX quan trọng:**
- Form và selector nên hiển thị **inline trong bubble chat** (không phải modal popup) để nhất quán với UI chat hiện tại
- Sau khi lưu thành công, đóng form và hiển thị bubble xác nhận: *"✅ Đã lưu báo cáo ngày 30/05/2026"*
- Nếu `options` trong `selection_request` rỗng → hiển thị text *"Chưa có báo cáo nào trong hệ thống"* thay vì selector

**Error handling:**
- `POST /api/work-reports` lỗi 400: hiển thị message lỗi từ `detail` field
- `POST /api/work-reports` lỗi 503: *"Chức năng chưa được cấu hình, liên hệ quản trị viên"*
- `GET /api/work-reports` không có kết quả: hiển thị *"Không có báo cáo trong khoảng thời gian này"*

**Format ngày:**
- API nhận/trả ngày theo chuẩn `YYYY-MM-DD`
- FE hiển thị theo `DD/MM/YYYY`

---

*Mọi thắc mắc liên hệ backend team để làm rõ spec.*
