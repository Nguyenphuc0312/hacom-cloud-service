# design-taste-frontend — Hướng dẫn sử dụng

Skill chuyên cho **landing page, portfolio, redesign**. Không dùng cho dashboard, data table, hay product UI nhiều bước (dùng `/impeccable` cho những thứ đó).

---

## Khi nào dùng

| Dùng `design-taste-frontend` | Dùng `impeccable` thay |
|---|---|
| Landing page SaaS / marketing | Dashboard, admin panel |
| Portfolio cá nhân / studio | Product UI (chat, calendar…) |
| Redesign trang marketing | Component nội bộ app |
| Campaign / editorial page | Settings, forms, data tables |

---

## Cách gọi

Không có sub-command — chỉ mô tả việc cần làm:

```
/design-taste-frontend redesign trang login của mình
/design-taste-frontend tạo landing page cho feature mới
/design-taste-frontend portfolio page — vibe minimal, editorial
```

Hoặc nói tự nhiên: *"dùng design-taste để làm lại trang login"*.

---

## Cách skill hoạt động

**Bước 1 — Đọc brief trước khi làm bất cứ thứ gì**

Skill sẽ tự infer:
- Loại trang (SaaS landing / portfolio / redesign…)
- Vibe bạn muốn ("minimalist", "premium", "playful", "trust-first"…)
- Đối tượng (B2B buyer / designer / recruiter…)
- Brand assets hiện có (logo, màu, font)

Rồi declare một dòng **"Design Read"** trước khi code:
> *"Reading this as: B2B SaaS landing for technical buyers, Linear-style minimalist, leaning Geist + restrained motion."*

**Bước 2 — Set 3 dial**

```
DESIGN_VARIANCE: 1–10   (1=đều/symmetry, 10=chaos/artsy)
MOTION_INTENSITY: 1–10  (1=static, 10=cinematic)
VISUAL_DENSITY: 1–10    (1=gallery/airy, 10=packed)
```

Default: `8 / 6 / 4`. Bạn có thể override bằng ngôn ngữ tự nhiên:
- *"minimal hơn"* → variance 5, motion 3, density 2
- *"wild hơn, Awwwards-style"* → variance 10, motion 9

**Bước 3 — Code production-grade**

Không phải prototype. Skill cam kết ship code đẹp, responsive, on-brand.

---

## Override dial bằng ngôn ngữ thường

```
"minimal / clean / Linear-style"     → variance 5-6, motion 3-4, density 2-3
"premium / Apple-y / luxury"         → variance 7-8, motion 5-7, density 3-4
"wild / Awwwards / experimental"     → variance 9-10, motion 8-10, density 3-4
"trust-first / public-sector"        → variance 3-4, motion 2-3, density 4-5
```

---

## Lưu ý với dự án HACOM Chat

- Skill này **không tự biết bảng màu** của HACOM — nhắc kèm:  
  *"giữ màu đỏ/vàng cho SideRail & Login, xanh `#1565C0` cho phần còn lại"*
- Dùng tốt nhất cho: LoginPage, landing page marketing, trang public (help, faq…)
- Không dùng cho ChatPage, CalendarPage, SettingsPage — dùng `/impeccable` cho đó

---

## Anti-defaults skill tránh

Skill chủ động tránh các lỗi AI điển hình:
- Gradient tím/xanh AI-generic
- Hero center trên nền dark mesh
- 3 feature card đều nhau
- Glassmorphism khắp nơi
- Inter + slate-900 mọi lúc
