ARG NODE_VERSION=20-alpine

FROM node:${NODE_VERSION} AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci

FROM deps AS build
# VITE_* values are public build-time frontend config baked into the bundle.
# Do not pass secrets, tokens, or passwords through these build args.
ARG VITE_ADMIN_API_ROOT=/api/v1/admin
ARG VITE_ADMIN_API_BASE_URL=/api/v1/admin
ARG VITE_AUTH_BASE_URL=/api/v1/auth
ARG VITE_APP_ENV=DOCKER
ARG VITE_DASHBOARD_REFETCH_INTERVAL_MS=15000
ARG VITE_ADMIN_WRITE_ACTIONS_ENABLED=false

ENV VITE_ADMIN_API_ROOT=${VITE_ADMIN_API_ROOT}
ENV VITE_ADMIN_API_BASE_URL=${VITE_ADMIN_API_BASE_URL}
ENV VITE_AUTH_BASE_URL=${VITE_AUTH_BASE_URL}
ENV VITE_APP_ENV=${VITE_APP_ENV}
ENV VITE_DASHBOARD_REFETCH_INTERVAL_MS=${VITE_DASHBOARD_REFETCH_INTERVAL_MS}
ENV VITE_ADMIN_WRITE_ACTIONS_ENABLED=${VITE_ADMIN_WRITE_ACTIONS_ENABLED}

WORKDIR /app
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS production
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=10 \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]

FROM build AS development
ENV NODE_ENV=development
WORKDIR /app

EXPOSE 5174

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5174"]
