# chat-web-client deploy contract

- runtime service: `chat-web-client`
- network alias: `chat-web-client`
- internal port: `80`
- health endpoint: `http://127.0.0.1/healthz`
- external network: `chat-platform`
- upstream aliases are pinned to `chat-api`, `chat-auth`, `chat-websocket`
