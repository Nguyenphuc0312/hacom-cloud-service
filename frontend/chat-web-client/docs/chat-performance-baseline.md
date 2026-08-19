# Chat Performance Baseline

Captured on local Windows workstation using production `vite preview` through:

```bash
npm run test:e2e:perf
```

The performance preview builds with `VITE_CHAT_PERF_DEBUG=true`, serves the
production bundle, and runs `e2e/chat-performance.spec.ts`.

## Browser Runtime Metrics

| Scenario | Budget | Captured |
|---|---:|---:|
| 10k open_to_first_render | <= 1000 ms | 173 ms |
| 10k open_to_bottom_applied | <= 1500 ms | 285.5 ms |
| append realtime single message | <= 100 ms | 96.2 ms |
| composer keypress latency in 10k conversation | <= 32 ms | 2.1 ms |
| rendered message items after 10k open | <= 120 | 31 |
| rendered message items after append | <= 120 | 29 |
| DOM nodes after 10k open | observation | 975 |
| DOM nodes after append | observation | 933 |
| final distance to bottom after realtime append | <= 120 px | 0 px |

Wall-clock values include browser navigation, route mocks, and Playwright
automation overhead:

| Scenario | Captured |
|---|---:|
| 10k navigation to first scroll container | 1011 ms |
| 10k navigation to bottom visible | 1020 ms |

## Timeline Derivation Metrics

Captured with:

```bash
npm test -- src/features/chat/performance/chatTimelinePerformance.bench.test.tsx
```

| Scenario | Budget | Captured |
|---|---:|---:|
| open 100 messages | <= 1000 ms | 20.43 ms |
| open 10k messages | <= 1000 ms | 93.77 ms |
| open 50k messages | <= 2500 ms | 447.9 ms |
| append 1 message | <= 100 ms | 22.64 ms |
| append 10-message burst | <= 250 ms | 10.66 ms |
| load older 50 messages | <= 150 ms isolated, <= 300 ms full Vitest contention gate | 135.67 ms |
| same-message rerender keypress proxy | <= 32 ms | 0.74 ms |

## Current Interpretation

- Virtualization is working: 10k messages render around 30 message DOM rows, not
  the full timeline.
- Timeline derivation remains O(n), but current measured costs are below the
  release budgets for 10k and 50k mock timelines.
- `load_older_50` is the closest budget margin. It passed the isolated 150 ms
  target at 135.67 ms, but the full Vitest run can contend with other suites;
  the automated full-suite guard is therefore 300 ms to avoid false failures.
- Browser append latency is within budget but close to the 100 ms threshold.
