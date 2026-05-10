# chat-web-client deploy contract

- runtime service: `chat-web-client`
- network alias: `chat-web-client`
- internal port: `80`
- health endpoint: `http://127.0.0.1/healthz`
- external network: `chat-platform`
- serves static assets only
- public `/`, `/api`, `/auth`, and `/ws` routing is owned by `chat-infrastructure`

## VITE_* flags are BUILD-TIME, not runtime

Vite inlines `import.meta.env.VITE_*` into the JavaScript bundle at build
time. The runtime nginx container's environment, the compose `env_file`,
and `service.env` on the server all have **no effect** on values that
were already baked into `dist/assets/*.js`.

To change a `VITE_*` value, you MUST:

1. Pass it to `docker buildx build --build-arg VITE_*=value` (the GitHub
   Actions workflows do this for the canonical list).
2. Have the corresponding `ARG` + `ENV` declared in the `build` stage of
   the Dockerfile, BEFORE `RUN npm run build`.
3. Build a new image tag and deploy it. Re-deploying the same SHA does
   nothing.

If you observe `const sg={}` or similar in `/usr/share/nginx/html/assets/*.js`
near a `VITE_CHAT_*` literal, the env var did not reach the Vite build.
Cause is almost always a missing `--build-arg` line in the workflow or a
missing `ARG`/`ENV` pair in the Dockerfile.

## Timeline V2 flags

Three build-time switches gate the Timeline V2 scroll owner. All three
are forwarded by the deploy workflows when GitHub Actions `vars.*` define
them, with the per-environment defaults below.

| Flag | Develop default | Production default | Effect when `true` |
| --- | --- | --- | --- |
| `VITE_CHAT_TIMELINE_V2_OWNER` | `true` | `true` | `<ChatTimelineV2>` mounts and observes; legacy still drives scroll. |
| `VITE_CHAT_SCROLL_OWNER_V2_DRIVES` | `false` | `true` | V2 ScrollOwner becomes the only scrollTo* writer; legacy is suppressed. |
| `VITE_CHAT_SCROLL_DEBUG` | `true` | `false` | Emits `[chat-scroll-v2]` console logs. **Never `true` in production.** |

Workflow vars override these defaults per environment (Settings →
Environments → develop/production → Variables). Unsetting a var falls
back to the workflow default.

### Rollout sequence (per `src/features/chat/timeline-v2/TIMELINE_V2_ROLLOUT.md`)

| Stage | OWNER | DRIVES | DEBUG |
| --- | --- | --- | --- |
| 1 — observe-only on staging | `true` | `false` | `true` |
| 2 — V2 drives on staging | `true` | `true` | `true` |
| 3 — V2 drives on production | `true` | `true` | `false` |

Stage transitions are flag-only — no code change. To advance staging from
Stage 1 → Stage 2, set `vars.VITE_CHAT_SCROLL_OWNER_V2_DRIVES=true` for
the develop environment and re-run the deploy workflow.

### Rollback

V2 has zero backend dependency. Rollback is build-time:

```text
# Quickest: V2 mounted but does not drive scroll.
vars.VITE_CHAT_SCROLL_OWNER_V2_DRIVES=false
# Re-run the deploy workflow.

# Full rollback to legacy.
vars.VITE_CHAT_TIMELINE_V2_OWNER=false
vars.VITE_CHAT_SCROLL_OWNER_V2_DRIVES=false
# Re-run the deploy workflow.
```

After rollback redeploy, hard-refresh the browser once so the new hashed
chunks are picked up.

### Verifying the build inside CI

Both deploy workflows run a "Verify Timeline V2 build-time flags landed
in bundle" step after `docker buildx build`. It pulls the pushed image,
extracts `/usr/share/nginx/html/assets`, and:

1. Asserts the literal `chat-scroll-v2` exists (proves V2 code is in the
   bundle and not tree-shaken).
2. Prints occurrences of the V2 flag literals for visual review.
3. Fails the workflow if any bundle file contains BOTH a `const X={}`
   minified empty-env-object pattern AND a `VITE_CHAT_*` literal — the
   exact regression signature observed when build args fail to reach the
   Vite build.

If this step fails, do NOT deploy. Inspect the printed grep output and
verify the build args were threaded through the entire chain (workflow
env → trim block → `--build-arg` → Dockerfile `ARG` → Dockerfile `ENV` →
Vite build).
