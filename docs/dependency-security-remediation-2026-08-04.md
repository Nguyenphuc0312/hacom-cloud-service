# Frontend dependency security remediation — 2026-08-04

## Verified baseline

`npm audit --json` was run against the committed lockfile before remediation:

| Severity | Count |
|---|---:|
| Critical | 1 |
| High | 9 |
| Moderate | 1 |
| Low | 1 |

The critical finding was `vitest <3.2.6`. Compatible direct dependency updates
were applied for Vitest, Axios, Vite and PostCSS. The follow-up audit is:

| Severity | Count |
|---|---:|
| Critical | 0 |
| High | 5 |
| Moderate | 1 |
| Low | 1 |

## Remaining work

| Priority | Owner | Package/path | Required action | Acceptance evidence |
|---|---|---|---|---|
| P0 | Web security owner | `xlsx` | Replace npm `xlsx@0.18.5`, which has no registry fix, with a reviewed patched SheetJS CE artifact newer than `0.20.2` or a maintained parser. Record artifact origin, license and lockfile integrity. | Malicious-workbook regression, file-size limit test, production build and audit disposition reviewed |
| P0 | Web owner | `react-router-dom` / `react-router` | Plan the required major upgrade in a dedicated change; verify login, guards, deep links, 403/404 and refresh behavior. | Route unit tests plus Playwright login/navigation smoke pass |
| P1 | Tooling owner | `brace-expansion`, `js-yaml`, `undici`, `esbuild` | Upgrade the owning direct toolchain packages or use narrowly pinned overrides only after dependency-tree review. | `npm explain`, full unit suite, lint, typecheck and build recorded |

Until the `xlsx` P0 item is closed, spreadsheet data must be rendered only as
React text nodes. Raw SheetJS HTML must never be assigned to `innerHTML` or
`dangerouslySetInnerHTML`.

## Gate rule

The audit plan is evidence, not a vulnerability waiver. Gate 1 remains pending
until the critical count is zero, the Excel XSS regression passes, remaining
high findings have an approved disposition, and live security acceptance is
complete.
