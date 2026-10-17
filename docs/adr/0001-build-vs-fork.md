# ADR 0001: Build vs fork the upstream Archify renderer

- **Status:** Accepted, 2026-10-17
- **Decision owner:** Principal Technical Architect (on behalf of the project owner)
- **Context:** [Plan.MD](../../Plan.MD) §9, decision D6. The rule was to run a 2-day spike against criteria F1–F7, fork if upstream passes, and otherwise build our own TypeScript core.

## Decision

**Fork.** We vendor upstream Archify at commit `88d1ae4498b6a1df610badf690c5406882622d15` (v3.1.0, MIT) and rebrand it to vc-archify. The website, CI/CD and Vercel setup from the plan are wrapped around it.

One criterion, **F6 (size)**, does not meet the numeric target the plan set. It is accepted as a documented deviation; see the F6 row and the rationale below.

## Evidence

The spike ran on 2026-10-17 against upstream `88d1ae4`, using Node 24.22.0 (pnpm-pinned) and macOS with Chrome. Upstream renders were compared with the 14 files in [`design/`](../../design/).

| # | Criterion | Result | Evidence |
| --- | --- | --- | --- |
| F1 | Licence | **Pass** | `LICENSE` is MIT (© 2026 tt-a1i, © 2025 Cocoon AI). JetBrains Mono is OFL 1.1, and its licence text is embedded in every artifact. Optional brand-mark vectors are Simple Icons (CC0 collection) with per-mark licences recorded in `THIRD_PARTY_NOTICES.md`; some marks are NC/SA-licensed, which is acceptable for this personal, non-commercial project (D5). All notices are kept verbatim. |
| F2 | Fidelity | **Pass** | For all 7 reference diagrams, the upstream render has the **same viewBox, the same node-ID set and the same edge set** as the design SVG. 68–83 % of `<rect>` geometry is byte-identical; the remainder is the extra background rect the SVG exporter adds and attribute ordering. The design files are the upstream viewer's own dual-theme SVG export of these sources. |
| F3 | Architecture fit | **Pass (with shim)** | Rendering runs headless in Node 24 with **no dependencies** (validators are precompiled). Output is **deterministic**: the same input rendered twice gives an identical SHA-256. The renderers are CLI scripts (top-level await, `fs` input/output), so the CLI and the gallery build call them as child processes. The browser playground uses a bundle with a small injected-I/O hook in `renderers/shared/cli.mjs` and node-builtin shims (see `packages/browser-engine`). |
| F4 | Viewer coverage | **Pass** | Every PRD §4 interaction exists in `viewer/`: focus passport (`focus.js`), route + journey (`route-probe.js`), lens (`semantic-lens.js`), radar (`semantic-radar.js`), finder (`node-finder.js`), guide and presentation (`guided-views.js`), export (PNG/JPEG/WebP/SVG/WebM/clipboard, `export.js`), and reading-depth camera (`viewer-camera.js`). |
| F5 | Security | **Pass** | An injection probe (`<b>x</b>"` label, `</text>&` sublabel, `T<img src=x onerror=alert(1)>` title) is fully escaped: 0 raw occurrences in the output. The template has 0 inline event handlers, 0 `eval`/`new Function`, 0 `fetch`/XHR, and only `blob:`/`data:` URLs for export. It works under a strict `default-src 'none'` CSP with script hashes. |
| F6 | Size | **Deviation** | An artifact is **≈ 824 KB raw / 207 KB gzip**: fonts 96 KB, viewer CSS 201 KB, viewer JS 450 KB (88 KB gzip), i18n 21 KB, SVG ≈ 30 KB. The plan's targets were ≤ 350 KB raw and a viewer ≤ 45 KB gzip. |
| F7 | Maintainability | **Pass** | Plain ES modules, one renderer per type, JSON Schema contracts, precompiled validators, and a large upstream test suite. The engine ships its own quality gates: `validate`, structural `check`, and Chrome-based `browser-check`. The rebrand is mechanical (`scripts/sync-upstream.mjs`) and does not change internal identifiers. |

### Why F6 is accepted

The size budget existed for two reasons, Hobby bandwidth and easy sharing, and both are still met:

- **Hobby bandwidth.** At 207 KB gzip, 100 GB/month allows about 480 k direct artifact loads. That is far beyond personal-use traffic. The gallery uses static thumbnails, so a visit loads at most one live artifact.
- **Easy sharing.** 824 KB is still a single self-contained file that can be attached to an email or a PR.

Rebuilding a smaller engine would cost an estimated 15+ FTE-weeks and would not reach this fidelity. Size reduction is tracked as a post-v1 item: minify the inlined viewer JS and CSS, and drop locales the artifact doesn't use.

## Consequences

- The plan's §3.4–§3.8 pipeline (IR → validate → layout → route → SVG → HTML) **is implemented by the vendored engine**. Our own code is the wrapper (`@vca/render`), the browser bundle for the playground, the website, CI/CD and the tests.
- Repository layout (this supersedes the plan's `packages/{ir,tokens,layout,render,viewer,html}`):
  - `skills/vc-archify/`: the vendored engine **and** the installable agent skill (`SKILL.md`, CLI `bin/vc-archify.mjs`)
  - `packages/viewer/`: viewer runtime sources plus the generator for `skills/vc-archify/assets/template.html`
  - `packages/render/`: Node API (`renderDiagram`, `validateDiagram`, `checkArtifact`) used by the gallery build and tests
  - `packages/browser-engine/`: browser bundle of the renderers for the playground
  - `gallery/`: versioned IR for gallery and "beyond code" artifacts
- IR is **upstream's schema** (v1/v2 per type, e.g. architecture `components`/`connections`, ERD `entities`/`relationships`), not the sketch in Plan §3.5. The engine also supports Class, Tree, Timeline and Waterfall. They are available in the CLI, but the site features only the six designed types.
- The `editorial` preset exists upstream. D1 still keeps it out of the v1 site and docs; the engine accepts it as-is.
- Upstream sync: `node scripts/sync-upstream.mjs <checkout>` re-vendors and rebrands; then `pnpm viewer:build`. `UPSTREAM.json` records the commit.
- The update check, which polls a manifest on `tt-a1i.github.io`, is **off by default**. Set `VC_ARCHIFY_UPDATE_CHECK=1` to opt in.
