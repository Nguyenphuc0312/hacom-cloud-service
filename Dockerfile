ARG NODE_VERSION=20-alpine

FROM node:${NODE_VERSION} AS deps
WORKDIR /workspace

COPY chat-shared-types/package*.json ./chat-shared-types/
WORKDIR /workspace/chat-shared-types
RUN npm ci

WORKDIR /workspace
# package*.json matches both package.json AND package-lock.json (if present),
# so the build doesn't hard-fail when the lockfile is missing from context.
COPY chat-web-client/package*.json ./chat-web-client/
WORKDIR /workspace/chat-web-client
# Use ci (fast, deterministic) when lockfile exists; fall back to install otherwise.
RUN npm ci 2>/dev/null || npm install --no-audit --no-fund

FROM deps AS build
ARG VITE_APP_BASE_PATH=/
ARG VITE_API_BASE_URL=/api/v1
ARG VITE_APP_BUILD_SHA=unknown
ARG VITE_APP_BUILD_TIME=unknown
# Canonical auth contract for web client bundles.
ARG VITE_AUTH_BASE_URL=/api/v1/auth
ARG VITE_USE_AUTH_SERVICE=true
ARG VITE_WS_URL=/ws
ARG VITE_WS_USE_QUERY_TOKEN=false
ARG VITE_WS_AUTO_QUERY_TOKEN_FALLBACK=true
# Timeline V2 build-time flags. Vite inlines `import.meta.env.VITE_*` at
# build time; runtime container env CANNOT change them. Defaults are
# false/false/false so omitting the build args matches legacy behaviour.
# Stage 1 staging:   OWNER=true,  DRIVES=false, DEBUG=true
# Stage 2 staging:   OWNER=true,  DRIVES=true,  DEBUG=true
# Stage 3 production: OWNER=true, DRIVES=true,  DEBUG=false
# Post-cleanup (2026-05): production mounts SimpleVirtualizedChatTimeline.
# Defaults bake the simple timeline ON; only USE_LEGACY=true falls back to
# the legacy MessageList (emergency-rollback only, remove by 2026-06-30).
ARG VITE_CHAT_SIMPLE_VIRTUAL_TIMELINE=true
ARG VITE_CHAT_SIMPLE_TIMELINE_DEBUG=false
ARG VITE_CHAT_USE_LEGACY_TIMELINE=false
ARG VITE_HR_API_BASE_URL
# Màn "Công & Phép" (/timesheet, /leave, /timesheet/team). Mặc định `false` ở
# đây vì Dockerfile này chỉ dùng cho bản deploy: quên truyền build-arg thì rơi
# về "ẩn" chứ không lộ màn chưa nghiệm thu. Local `npm run dev` không đọc file
# này nên vẫn bật bình thường.
ARG VITE_WORK_MODULE_ENABLED=false
# Refresh token storage mode. "cookie" = HttpOnly cookie set by auth-service
# (secure, XSS-proof). "session" = localStorage fallback for envs without
# cookie-based auth. Production must always use "cookie".
ARG VITE_REFRESH_TOKEN_STORAGE_MODE=cookie

ENV VITE_APP_BASE_PATH=${VITE_APP_BASE_PATH}
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_APP_BUILD_SHA=${VITE_APP_BUILD_SHA}
ENV VITE_APP_BUILD_TIME=${VITE_APP_BUILD_TIME}
ENV VITE_AUTH_BASE_URL=${VITE_AUTH_BASE_URL}
ENV VITE_USE_AUTH_SERVICE=${VITE_USE_AUTH_SERVICE}
ENV VITE_WS_URL=${VITE_WS_URL}
ENV VITE_WS_USE_QUERY_TOKEN=${VITE_WS_USE_QUERY_TOKEN}
ENV VITE_WS_AUTO_QUERY_TOKEN_FALLBACK=${VITE_WS_AUTO_QUERY_TOKEN_FALLBACK}
ENV VITE_CHAT_SIMPLE_VIRTUAL_TIMELINE=${VITE_CHAT_SIMPLE_VIRTUAL_TIMELINE}
ENV VITE_CHAT_SIMPLE_TIMELINE_DEBUG=${VITE_CHAT_SIMPLE_TIMELINE_DEBUG}
ENV VITE_CHAT_USE_LEGACY_TIMELINE=${VITE_CHAT_USE_LEGACY_TIMELINE}
ENV VITE_HR_API_BASE_URL=${VITE_HR_API_BASE_URL}
ENV VITE_WORK_MODULE_ENABLED=${VITE_WORK_MODULE_ENABLED}
ENV VITE_REFRESH_TOKEN_STORAGE_MODE=${VITE_REFRESH_TOKEN_STORAGE_MODE}

WORKDIR /workspace
COPY chat-shared-types ./chat-shared-types
COPY chat-web-client ./chat-web-client

WORKDIR /workspace/chat-shared-types
RUN npm run build
RUN test -f /workspace/chat-shared-types/dist/index.d.ts

WORKDIR /workspace/chat-web-client
RUN npm run build \
  && printf '{"buildSha":"%s"}\n' "${VITE_APP_BUILD_SHA}" > dist/build-info.json \
  && node scripts/verify-dist-assets.mjs

FROM nginx:1.27-alpine AS production
COPY chat-web-client/nginx/default.conf.template /etc/nginx/templates/default.conf.template
# Snippet security header — default.conf.template include vào từng location.
# Thiếu file này nginx sẽ KHÔNG khởi động được (include trỏ vào file không có).
COPY chat-web-client/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /workspace/chat-web-client/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]

FROM build AS development
ENV NODE_ENV=development
WORKDIR /workspace/chat-web-client

EXPOSE 5100

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5100"]
