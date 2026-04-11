# chat-web-client deploy contract

- runtime service: `chat-web-client`
- network alias: `chat-web-client`
- internal port: `80`
- health endpoint: `http://127.0.0.1/healthz`
- external network: `chat-platform`
- serves static assets only
- public `/`, `/api`, `/auth`, and `/ws` routing is owned by `chat-infrastructure`
