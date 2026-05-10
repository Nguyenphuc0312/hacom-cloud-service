ARG NODE_VERSION=20-alpine

FROM node:${NODE_VERSION} AS deps
WORKDIR /workspace

COPY chat-shared-types/package*.json ./chat-shared-types/
WORKDIR /workspace/chat-shared-types
RUN npm ci

WORKDIR /workspace
COPY chat-web-client/package*.json ./chat-web-client/
WORKDIR /workspace/chat-web-client
RUN npm ci

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
ARG VITE_CHAT_TIMELINE_V2_OWNER=false
ARG VITE_CHAT_SCROLL_OWNER_V2_DRIVES=false
ARG VITE_CHAT_SCROLL_DEBUG=false

ENV VITE_APP_BASE_PATH=${VITE_APP_BASE_PATH}
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_APP_BUILD_SHA=${VITE_APP_BUILD_SHA}
ENV VITE_APP_BUILD_TIME=${VITE_APP_BUILD_TIME}
ENV VITE_AUTH_BASE_URL=${VITE_AUTH_BASE_URL}
ENV VITE_USE_AUTH_SERVICE=${VITE_USE_AUTH_SERVICE}
ENV VITE_WS_URL=${VITE_WS_URL}
ENV VITE_WS_USE_QUERY_TOKEN=${VITE_WS_USE_QUERY_TOKEN}
ENV VITE_WS_AUTO_QUERY_TOKEN_FALLBACK=${VITE_WS_AUTO_QUERY_TOKEN_FALLBACK}
ENV VITE_CHAT_TIMELINE_V2_OWNER=${VITE_CHAT_TIMELINE_V2_OWNER}
ENV VITE_CHAT_SCROLL_OWNER_V2_DRIVES=${VITE_CHAT_SCROLL_OWNER_V2_DRIVES}
ENV VITE_CHAT_SCROLL_DEBUG=${VITE_CHAT_SCROLL_DEBUG}

WORKDIR /workspace
COPY chat-shared-types ./chat-shared-types
COPY chat-web-client ./chat-web-client

WORKDIR /workspace/chat-shared-types
RUN npm run build

WORKDIR /workspace/chat-web-client
RUN npm run build && node scripts/verify-dist-assets.mjs

FROM nginx:1.27-alpine AS production
COPY chat-web-client/nginx/default.conf.template /etc/nginx/templates/default.conf.template
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
