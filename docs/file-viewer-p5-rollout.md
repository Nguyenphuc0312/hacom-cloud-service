# File viewer P5 rollout runbook

## Scope and invariant

P5 controls only the browser's reversible in-app file viewer in the chat file
card. The explicit download action, upload flow, desktop native save/open/reveal
flow, and chosen download folder are not gated by either flag.

When the viewer switch is off, a chat file card does not invoke the in-app
viewer. Existing image/video thumbnails remain visible and the explicit download
action remains available. Cloud and Calendar use the shared viewer independently
of this chat-card rollout switch.

The switches are build-time Vite values. Changing a container environment,
Compose env_file, or a server runtime env file after an image is built cannot
change them. Build and deploy a new image instead.

## Public build flags

| Flag | Default | Exact enabling value | Effect |
| --- | --- | --- | --- |
| VITE_FILE_VIEWER_ENABLED | false | true | Enables in-app chat file viewer interaction. |
| VITE_FILE_LIFECYCLE_TELEMETRY_ENABLED | false | true | Emits local, allowlisted viewer lifecycle CustomEvents. |

Any unset or malformed value is treated as false by client code. The staging
and production workflows also reject non-boolean configured values before
building an image.

Docker receives both values through ARG and ENV before npm run build. Direct
production builds use the same false defaults in .env.production.

## Staging rollout

1. Leave both staging environment variables unset for a disabled baseline.
2. Set VITE_FILE_VIEWER_ENABLED=true, rebuild through the staging workflow, and
   verify chat file preview while download continues to work.
3. Set VITE_FILE_LIFECYCLE_TELEMETRY_ENABLED=true only for an approved,
   bounded observation window. Listen for chat:file-viewer-lifecycle in the
   browser renderer; there is intentionally no network collector in P5.
4. Turn telemetry off again after the observation window unless a separately
   approved backend telemetry contract exists.

## Production rollout and rollback

Promote only after the staging checks below are recorded. For production,
VITE_FILE_VIEWER_ENABLED=true enables the viewer. Keep
VITE_FILE_LIFECYCLE_TELEMETRY_ENABLED=false unless the privacy review approves
a bounded local-observation procedure.

Rollback is build-time: set VITE_FILE_VIEWER_ENABLED=false, rebuild, push, and
deploy a new image. Do not rely on changing Compose or runtime environment
variables. Deploying the last known-good image is an equivalent rollback.

The Electron shell loads this web client bundle. P5 does not change native
main/preload code, so it does not require a new desktop executable. A desktop
rebuild is required only when native Electron code changes.

## Telemetry privacy contract

The local browser event contains only these fields:

- platform: web
- phase: open_requested, open_blocked, source_ready, source_unavailable, or closed
- fileKind: a fixed preview-type enum
- optional source: cache, network, legacy, or none
- optional outcome: success, blocked, or error

It never contains a file name, path, object key, URL, signed URL, token,
attachment ID, conversation ID, account ID, or raw error. Invalid runtime
values are discarded. The event is not an audit log and is not sent to a
server in P5. Native desktop download/open/reveal lifecycle is not instrumented
by this web-only telemetry.

## Evidence status on 2026-09-08

- Focused unit coverage for the flags, allowlist, shared viewer source lifecycle,
  and chat file card: PASS in the local change verification.
- Browser staging runtime exercise: NOT_RUN.
- Browser end-to-end exercise: NOT_RUN.
- Windows/Electron chosen-folder, native app open, and reveal exercise: NOT_RUN.
- Production deployment and telemetry-consumer validation: NOT_RUN.

Before enabling either flag beyond a local build, run and record all four
runtime checks above. The native desktop source tests do not substitute for a
Windows runtime exercise.
