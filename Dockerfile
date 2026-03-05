FROM node:20-alpine AS deps
WORKDIR /workspace

COPY chat-shared-types/package*.json ./chat-shared-types/
COPY chat-web-client/package*.json ./chat-web-client/

WORKDIR /workspace/chat-shared-types
RUN npm ci

WORKDIR /workspace/chat-web-client
RUN npm ci

FROM deps AS build
WORKDIR /workspace

ARG VITE_API_BASE_URL=/api/v1
ARG VITE_AUTH_BASE_URL=/auth-api/v1
ARG VITE_USE_AUTH_SERVICE=true
ARG VITE_WS_URL=ws://localhost:5100
ARG VITE_WS_USE_QUERY_TOKEN=false
ARG VITE_WS_AUTO_QUERY_TOKEN_FALLBACK=true

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_AUTH_BASE_URL=${VITE_AUTH_BASE_URL}
ENV VITE_USE_AUTH_SERVICE=${VITE_USE_AUTH_SERVICE}
ENV VITE_WS_URL=${VITE_WS_URL}
ENV VITE_WS_USE_QUERY_TOKEN=${VITE_WS_USE_QUERY_TOKEN}
ENV VITE_WS_AUTO_QUERY_TOKEN_FALLBACK=${VITE_WS_AUTO_QUERY_TOKEN_FALLBACK}

COPY chat-shared-types ./chat-shared-types
COPY chat-web-client ./chat-web-client

WORKDIR /workspace/chat-shared-types
RUN npm run build

WORKDIR /workspace/chat-web-client
RUN npm run build

FROM nginx:1.27-alpine AS production
COPY chat-web-client/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/chat-web-client/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

FROM deps AS development
WORKDIR /workspace
ENV NODE_ENV=development
COPY chat-shared-types ./chat-shared-types
COPY chat-web-client ./chat-web-client
WORKDIR /workspace/chat-shared-types
RUN npm run build
WORKDIR /workspace/chat-web-client
EXPOSE 5100
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5100"]
