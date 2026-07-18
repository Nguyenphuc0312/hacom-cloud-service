# Chat Admin Panel API Integration Inventory

Source of truth for this inventory is the panel router/API clients and the
`chat-admin-service` controllers. Browser requests use the base URL
`/api/v1/admin`; client paths below intentionally omit that prefix.

| Module | Visible screen/action | Client path | Owning service | Controller path | Status |
|---|---|---|---|---|---|
| Authentication | Login, current identity | auth `/login`; `/me` | auth-service, admin-service | `/api/v1/auth/login`; `admin/me` | Implemented; canonical claims required |
| Access control | Current IP/request/review actions | auth `/access/*`; `/access/ip-requests/*` | auth-service via admin-service | `admin/access/ip-requests/*` | Implemented |
| Dashboard | Overview and timeseries | dashboard client | admin-service aggregate | `admin/dashboard/*` | Implemented |
| Users | List, detail, lock, unlock, revoke sessions | `/users/*` | auth-service via admin-service | `admin/users/*` | Implemented |
| User sessions | Sessions and devices | `/users/:id/sessions`, `/devices` | auth-service via admin-service | `admin/users/:id/*` | Implemented |
| Authority | Admin role and permission overrides | `/authority/users/*` | auth-service via admin-service | `admin/authority/users/*` | Implemented |
| HR employees | List/detail/CRUD/import/provision | `/hr-employees`, `/hr-imports/*` | HR/auth orchestration | `admin/hr-employees/*` | Implemented |
| Conversations | List, messages, read action | `/conversations/*` | chat-api-service via admin-service | admin facade route | Requires runtime verification |
| Audit logs | List/filter | `/audit-logs` | admin-service | `admin/audit-logs` | Implemented |
| System logs | List and correlated lookups | `/system-logs/*` | admin-service/Loki facade | `admin/system-logs/*` | Implemented |
| Services | Health and projection status | `/service-health`, `/projection-status` | admin-service aggregate | `admin/service-health/*`, `admin/projection-status` | Implemented |
| Monitoring | Metrics overview | `/monitoring/overview` | admin-service | `admin/monitoring/overview` | Implemented |
| Realtime | Overview/users/typing/rooms/traffic | `/realtime/*`, `/traffic/*` | websocket/admin aggregate | `admin/realtime/*`, `admin/traffic/*` | Repaired duplicate prefix |
| Alerts | List, acknowledge, resolve | `/alerts/*` | admin-service | `admin/alerts/*` | Repaired duplicate prefix |
| Incidents | Export and status | `/incidents/*` | admin-service | `admin/incidents/*` | Repaired duplicate prefix |
| Settings | SMTP/templates/settings/maintenance | `/settings/*` | admin-service local domain | `admin/settings/*` | Implemented |
| Backup | Status/history/run | `/backup/*` | admin-service operations domain | `admin/backup/*` | Implemented |

## Contract guard

`adminAxiosInstance` is configured with `/api/v1/admin`. A client must supply
only the suffix shown above. `assertAdminApiPath` is used on the repaired
realtime, alerts and incidents callers to prevent reintroducing
`/api/v1/admin/admin/...` requests.

## Runtime boundary

Source inspection proves controller/client route compatibility except where a
facade calls an unavailable downstream service. Runtime verification must use a
deployed stack and an approved admin IP; it cannot be inferred from UI code.
