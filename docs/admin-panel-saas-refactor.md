# Admin Panel SaaS Refactor

## A. Audit UI Hien Tai

### 1. Layout

- Sidebar truoc day co grouping ton tai nhung chua map theo domain van hanh, nen cac route monitoring, service, settings va user bi tron logic.
- Topbar co search va user menu nhung thieu context quan trong cho admin tool: environment, quick actions, live status, breadcrumb.
- Dashboard cu dung `Row/Col + Card` theo kieu analytics demo, chua co mot grid thong nhat cho hero, metric strip, chart, insight va activity.
- Responsive shell da co nen, nhung page-level hierarchy van phu thuoc vao Ant spacing thay vi mot 8px rhythm ro rang.

### 2. Visual Hierarchy

- Hero card cu da co tone system status, nhung metrics ben duoi chua tao thu tu uu tien: card user counts va panels service/incidents canh tranh nhau.
- Chart-heavy monitoring o route rieng, con dashboard chinh chua dua duoc 2-3 tin hieu quan trong nhat len dau man hinh.
- Topbar eyebrow truoc day hien section text chung chung, khong giup user xac dinh minh dang o dau trong flow.

### 3. Data Density

- Dashboard cu thieu grouping theo "decide now / investigate next / history", nen user nhin thay nhieu card nhung kho biet nen hanh dong gi.
- Khong co quick actions cho tac vu hang ngay.
- Activity feed moi chi tap trung vao incidents; service degradation va monitoring warnings chua duoc hop nhat thanh mot timeline van hanh.

### 4. Interaction

- `Ctrl + K` da ton tai, nhung `/` chua focus global search.
- Loading/error/permission state ton tai o cap page, chua duoc chuan hoa o cap panel.
- Quick actions truoc day la icon mo palette, chua phan loai thanh workflow ro rang.

### 5. UX Flow

- Dashboard -> detail chua co drill-down ro qua metric cards.
- Navigation context thieu breadcrumb.
- Environment context va live/polling mode khong hien thi ro, de gay nham lan khi van hanh nhieu moi truong.

## B. Design Proposal

### Shell Moi

- Sidebar regroup theo 5 domain: `Analytics`, `Users`, `Conversations`, `System`, `Settings`.
- Topbar bo sung:
  - breadcrumb tu route hierarchy
  - environment badge
  - live/polling badge
  - quick actions dropdown
  - command palette shortcut `Ctrl + K` va `/`

### Dashboard Moi

- Hero trai:
  - system posture
  - 3 operational counters
  - CTA toi monitoring va service health
- Panel phai:
  - quick actions cho `Create user`, `Send broadcast`, `Create group`
- Metric strip:
  - `Active admins`
  - `Pending verification`
  - `Online users`
  - `Sender ACK p95`
  - `Healthy services`
  - `Delivery failures`
- Analytics row:
  - chart line co toggle `Traffic / Latency / Reliability`
  - insight panel co explanation + tone + CTA
- Secondary row:
  - bar chart top failure reasons
  - activity timeline hop nhat incidents, service degradations, warnings

## C. Design System Guideline

### Spacing

- Base scale theo 8px (`4 / 8 / 12 / 16 / 24 / 32 / 40 / 48 / 64`).
- Surface padding mac dinh `20-24px`.
- Gap giua dashboard sections `16px`.

### Mau

- Primary: `#3154ff`
- Accent support: teal + violet dung cho chart va status
- Warning: amber
- Danger: red
- Surface: white-to-slate gradient, border subtle, shadow nhe

### Typography

- Heading dung display family va tracking am.
- Metric value lon hon text mo ta mot cap ro rang.
- Eyebrow uppercase nho de chia context, khong dung lam title chinh.

### Component Rule

- Moi panel phai co purpose ro: title, short description, action hoac status.
- Metric cards la decision widgets, khong chen text dai.
- Charts chi giu 2-3 series uu tien, legend toggle va state ro rang.
- Empty/error/permission/loading duoc xem la first-class state, khong phai afterthought.

## D. Refactor Frontend Structure

### Da tach va them moi

- `src/components/ui/`
  - `SurfaceCard`
  - `MetricCard`
  - `DataTable`
  - `EmptyState`
  - `ErrorState`
- `src/features/dashboard/`
  - `components/DashboardHero`
  - `components/DashboardQuickActions`
  - `components/DashboardInsightPanel`
  - `components/DashboardActivityTimeline`
  - `hooks/useDashboardOverview`
  - `utils/dashboardView`
- `src/features/analytics/`
  - `components/AnalyticsChart`
  - `components/ChartWrapper`
- `src/layout/`
  - re-export shell boundary cho huong move layout ra khoi `app/`
- `src/config/appConfig.ts`
  - central env/config cho environment, polling interval, live updates, feature flags

### Nguyen tac state management

- Server state tiep tuc nam o `react-query`.
- UI state cuc bo giu trong component (`range`, `trendMode`, activity filter).
- Config env tap trung qua `appConfig`, khong doc `import.meta.env` truc tiep o tung component moi.

## E. Production-Ready UI Checklist

- [x] Domain-based sidebar grouping
- [x] Topbar co global search, environment badge, live/polling badge
- [x] Quick actions cho workflow hang ngay
- [x] Dashboard co hero, metric strip, trend panel, insight panel, activity timeline
- [x] Metric cards co drill-down
- [x] Chart duoc lazy load
- [x] Empty/error/permission/loading state cho chart va timeline
- [x] Keyboard shortcut `Ctrl + K` va `/`
- [x] Env config tap trung cho app state va live updates URL
- [x] Build, lint, tests pass

## Ghi Chu

- Dashboard time range hien tai van theo backend support (`15m / 1h / 6h / 24h`). Neu muon `7d / 30d / custom`, can mo rong contract API truoc khi bat frontend.
- Quick action `Create group` da co affordance UI, nhung workflow backend/page detail chua duoc wire vao repo hien tai.
