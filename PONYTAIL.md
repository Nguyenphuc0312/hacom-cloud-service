# Ponytail — Hướng dẫn sử dụng

Bộ skill ép AI viết code **ngắn nhất, đơn giản nhất, tối thiểu nhất** có thể. Mặc định luôn bật trong project này.

---

## Triết lý

> Code tốt nhất là code không cần viết.

Trước khi viết gì, AI leo thang này (dừng ở bậc đầu tiên đứng vững được):

1. **Cần tồn tại không?** → Không cần = bỏ qua, nói 1 dòng lý do (YAGNI)
2. **Codebase đã có chưa?** → Có = dùng lại, không viết lại
3. **Stdlib làm được?** → Dùng stdlib
4. **Platform native làm được?** → CSS thay JS, DB constraint thay app code
5. **Dependency đã cài làm được?** → Dùng nó, không thêm dep mới
6. **Làm được 1 dòng?** → 1 dòng
7. **Chỉ khi đó:** code tối thiểu hoạt động được

---

## Các skill / lệnh

### `/ponytail` — chế độ làm việc chính

Bật chế độ "lazy senior dev" cho toàn session. Có 3 mức:

| Lệnh | Mức | Tác dụng |
|------|-----|----------|
| `/ponytail` hoặc `/ponytail full` | **full** (mặc định) | Enforce ladder, stdlib first, diff ngắn nhất |
| `/ponytail lite` | lite | Nhẹ hơn, ít enforce hơn |
| `/ponytail ultra` | ultra | Cực đoan — xóa thay vì thêm, 1 dòng thay vì 5 |
| `stop ponytail` / `normal mode` | tắt | Quay về hành vi mặc định |

**Đã bật sẵn** trong project này ở mức `full`. Không cần gọi lại trừ khi muốn đổi mức.

---

### `/ponytail-review` — review over-engineering trong diff

Review code đang thay đổi (diff hiện tại), tìm **những gì cần xóa**:
- Tái phát minh stdlib
- Dependency không cần thiết
- Abstraction suy đoán (interface 1 impl, factory 1 product)
- Flexibility chết (config cho giá trị không bao giờ đổi)

```
/ponytail-review
```

Output: 1 dòng/finding — vị trí, cần cắt gì, thay bằng gì.

---

### `/ponytail-audit` — audit toàn repo

Giống `ponytail-review` nhưng quét **toàn bộ codebase**, không chỉ diff:

```
/ponytail-audit
```

Output: danh sách ranked — cái nặng nhất trên đầu. One-shot, không tự sửa.

---

### `/ponytail-debt` — thu hoạch comment `ponytail:`

Khi AI để lại shortcut có chủ đích, nó comment `// ponytail: <lý do> [upgrade path]`. Lệnh này gom tất cả lại thành ledger:

```
/ponytail-debt
```

Dùng để track những gì đã defer, không để "later means never".

---

### `/ponytail-gain` — xem impact đã đạt được

Scoreboard đo lường: ít code hơn, ít cost hơn, nhanh hơn bao nhiêu:

```
/ponytail-gain
```

One-shot display, không thay đổi gì.

---

### `/ponytail-help` — quick reference

```
/ponytail-help
```

In ra bảng tóm tắt tất cả lệnh + mode. Dùng khi quên.

---

## Pattern output của Ponytail

```
[code] → skipped: [X], add when [Y].
```

Ví dụ:
- *"`@lru_cache(maxsize=1000)` on fetch. Skipped custom cache class, add when lru_cache measurably falls short."*

Giải thích ngắn hơn code là tốt. Không essay, không feature tour.

---

## Khi nào Ponytail KHÔNG simplify

- Input validation tại trust boundary (user input, external API)
- Error handling ngăn data loss
- Security measures
- Accessibility cơ bản
- Bất cứ thứ gì user explicitly yêu cầu đầy đủ

---

## Lưu ý với dự án HACOM Chat

- Ponytail **không xung đột** với impeccable hay design-taste — chỉ ảnh hưởng đến logic code, không phải UI aesthetics
- Khi AI để lại comment `// ponytail: global lock, per-account locks nếu throughput cần` → đó là ceiling đã biết, không phải bug
- Chạy `/ponytail-debt` định kỳ để không bị "technical debt ẩn"
