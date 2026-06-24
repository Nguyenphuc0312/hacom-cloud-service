# Impeccable — Hướng dẫn sử dụng

Impeccable là skill AI chuyên thiết kế và cải thiện giao diện frontend. Đã cài vào `.claude/skills/impeccable/`.

---

## Cách gọi

Nói thẳng với Claude hoặc gõ `/impeccable <sub-command> [target]`:

```
/impeccable audit          # đánh giá UI hiện tại
/impeccable polish         # làm đẹp/tinh chỉnh component
/impeccable craft          # build component mới từ đầu
/impeccable shape          # định hình lại layout/hierarchy
/impeccable animate        # thêm motion có chủ đích
/impeccable colorize       # cải thiện màu sắc / contrast
/impeccable typeset        # tinh chỉnh typography
/impeccable layout         # fix spacing/grid/alignment
/impeccable bolder         # thiết kế đang nhạt → đậm/mạnh hơn
/impeccable quieter        # thiết kế đang ồn → gọn/tinh tế hơn
/impeccable overdrive      # full-send visual effect cao cấp
/impeccable adapt          # responsive / dark mode / i18n
/impeccable clarify        # simplify UX / giảm cognitive load
/impeccable distill        # cắt bớt, giữ cốt lõi
/impeccable harden         # accessibility, error states, edge cases
/impeccable onboard        # onboarding flow
/impeccable optimize       # performance UI (paint, LCP, CLS)
/impeccable live           # iterate trực tiếp trên browser
/impeccable init           # setup PRODUCT.md (dự án mới)
/impeccable document       # tạo design system docs
/impeccable extract        # extract tokens/components từ design
```

---

## Ví dụ thực tế với dự án này

```
/impeccable audit src/components/layout/sidebar/RoomItem.tsx
/impeccable polish MessageInput
/impeccable colorize src/pages/LoginPage.tsx
/impeccable harden src/components/ui/Modal.tsx
/impeccable animate ChatWindow — thêm transition khi chuyển hội thoại
/impeccable quieter GroupInfo panel — đang quá nhiều chi tiết
/impeccable adapt CalendarPage — fix responsive trên mobile
```

---

## Lần đầu dùng (setup)

Nếu Claude báo `NO_PRODUCT_MD`, chạy:

```
/impeccable init
```

Nó sẽ tạo `PRODUCT.md` chứa context thiết kế cho dự án. Chỉ cần làm 1 lần.

---

## Lưu ý với dự án HACOM Chat

- **Màu đỏ/vàng** (SideRail, LoginPage) — Impeccable phải giữ nguyên, không tự ý đổi sang xanh.
- **Màu xanh** `#1565C0` / `#1976D2` — brand color cho toàn bộ app còn lại.
- Khi dùng `/impeccable colorize` hoặc `/impeccable craft`, nhắc thêm: *"giữ bảng màu trong WEBFE.md"*.
- Impeccable đọc file code thật (không hallucinate token) nên nên chỉ rõ file target.

---

## Cập nhật

```bash
npx impeccable update
```

Hoặc chạy lại lệnh cài:

```bash
node "$(npx --no-install which impeccable 2>/dev/null || echo C:/Users/Admin/AppData/Local/npm-cache/_npx/1a4eb60c8f6b0f89/node_modules/impeccable/cli/bin/cli.js)" skills install --providers=claude --scope=project --yes
```
