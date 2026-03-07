ARG NODE_VERSION=20-alpine

FROM node:${NODE_VERSION} AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci

FROM deps AS build
ARG VITE_ADMIN_API_BASE_URL=/api/v1
ARG VITE_APP_ENV=DOCKER
ARG VITE_DASHBOARD_REFETCH_INTERVAL_MS=15000

ENV VITE_ADMIN_API_BASE_URL=${VITE_ADMIN_API_BASE_URL}
ENV VITE_APP_ENV=${VITE_APP_ENV}
ENV VITE_DASHBOARD_REFETCH_INTERVAL_MS=${VITE_DASHBOARD_REFETCH_INTERVAL_MS}

WORKDIR /app
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS production
ENV ADMIN_API_UPSTREAM=http://chat-admin-service:3201

COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]

FROM build AS development
ENV NODE_ENV=development
WORKDIR /app

EXPOSE 5174

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5174"]
