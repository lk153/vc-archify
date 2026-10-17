
# vc-archify — Implementation & Production Plan (Vercel)

> **Status:** v1.4 · 2026-10-17 · **implemented** (record in §10; all decisions in §9) · Owner: Principal Technical Architect
> **Usage model (confirmed by the owner 2026-10-17):** vc-archify is a **personal, non-commercial** project, deployed on the **Vercel Hobby (free) plan** for good, not as a stepping stone to a paid plan (§4.0).
> **Inputs:** [PRD.MD](PRD.MD) (functional requirements) · [design/](design/) (14 SVGs: 6 diagram types × dark/light)
> **Guiding promise (carried over):** every frame we ship is a live artifact, not a mockup. It is regenerated from versioned JSON IR, checked for structural integrity, and linked to the exact source that produced it.

---

## 0. Summary

1. **One pure TypeScript render core, used everywhere.** `IR (JSON) → validate → normalize → layout → route → SVG → self-contained HTML`. The same code runs in the CLI (agent skill), in the browser (playground) and at build time (gallery). A hosted render API is post-v1.
2. **One zero-dependency viewer runtime** (vanilla TS, inlined into every artifact) provides every interaction in PRD §4: focus passport, reach, route + journey, lens, find, radar, guide, deep links, presentation and embed modes, and the export menu.
3. **The website is a Next.js (App Router) app on the Vercel Hobby (free) plan.** Pages and artifacts are generated at build time and served from the Vercel CDN. v1 has **no public Vercel Functions**; only two pages refresh on a timer (GitHub star count, community list). GitHub Actions builds and deploys through the Vercel CLI, which fits within Hobby's limits (§4.0).
4. **Raster/video export runs in the browser**, as the PRD requires. No headless Chromium runs on Vercel, so there are no heavy functions.
5. **The design SVGs are the golden baselines.** Phase 0 extracts their tokens automatically. Every phase gate includes a pixel-diff against [design/](design/) in both themes.
6. **v1 scope decisions:** the product is named **vc-archify**; the site is **English only**; v1 ships **three presets** (`editorial` is deferred); there is **no hosted AI generation**; hosting is the **Vercel Hobby** plan for a **personal-use** project built by one developer. Whether we fork upstream Archify or build our own renderer is settled by a **2-day spike in P0** (§9, D6).

---

## 1. Scope

### In scope (v1)

| Area | Items |
| --- | --- |
| Diagram types | **architecture, workflow, sequence, dataflow, lifecycle, erd**. Each has dark and light themes. |
| Visual presets | `classic`, `signal-flow`, `blueprint`: the three that appear in the designs. |
| Output | Self-contained HTML (inline SVG + viewer, zero external requests); dual-theme SVG; PNG/JPEG/WebP up to 4×; WebM motion; clipboard (PRD §3). |
| Viewer | All of PRD §4.1–§4.13 (layout, toolbar, reading depth, passport, route/journey, lens, find, radar, guide, URL state, a11y, ERD rendering). |
| Authoring | JSON IR v2 (with v1 → v2 migration), CLI `validate`/`render`, agent skill (`SKILL.md`) for Claude Code, Codex, Cursor, OpenCode, Copilot. |
| Website | Landing, Start wizard, Gallery, Guide, Community, Playground. **English only.** |
| Branding | Public product name **vc-archify** on the site, the CLI, the skill and generated artifacts, with upstream attribution (§9). |
| Platform | Production on **Vercel Hobby** with preview-per-PR (deployed from CI), CDN static delivery, security headers, analytics, rollback. |

### Out of scope (v1), tracked for later

- Class, Tree, Timeline, Waterfall diagram types (listed in PRD §2, but they have no designs).
- Hosted collaboration and a WYSIWYG editor. The PRD states explicitly that the product is neither.
- **Hosted AI generation** ("describe → diagram" on our servers). *Decided: out of v1.* The user's own coding agent writes the IR through the skill and CLI. Notes are parked in §8.
- **`editorial` preset.** *Decided: deferred.* The design CSS defines it, but there is no reference design. It returns when a design is provided.
- **Localisation (zh-Hans or other).** *Decided: English first.* All copy lives in one messages file, so adding a locale later is additive.
- **Public `/api/validate` and `/api/render`.** Moved to post-v1 because Hobby quotas are hard caps (§4.0). The CLI and the in-browser playground cover the same needs.

---

## 2. What the designs tell us

Analysis was done directly on the files in [design/](design/). They were rendered to PNG with headless Chrome, and their CSS and `data-*` attributes were parsed.

### 2.1 Cross-cutting facts

| Finding | Evidence in design files | Implementation consequence |
| --- | --- | --- |
| **Dark and light are the same document**: only `data-theme` and one variable block differ (diff of the `*-dark.svg` and `*-light.svg` pairs ≈ 2 lines). | `:root, [data-theme="dark"] {…}` / `[data-theme="light"] {…}`, ~41 CSS custom properties | Emit the SVG once and switch themes only through CSS variables. A theme toggle never requires a re-render. |
| **Presets override tokens per theme** | `[data-preset="blueprint"][data-theme="light"] { --bg:#edf7fa … }` and shape tweaks (`rx:0`, `stroke-linecap:square`) | Tokens are a 3-level cascade: `base → preset → theme`. |
| **Seven semantic kinds** drive colour: frontend, backend, database, cloud, security, messagebus, external | `c-*` (container), `s-*` (sigil), `t-*` (text) classes; `--{kind}-fill/-stroke` | One `Kind` enum with a fixed token map. Only the legend *label* can be renamed per diagram (workflow design: "User UI", "Agent logic", "Policy"…). |
| **Lifecycle states reuse the same palette** | active→`frontend`, waiting→`cloud`, decision→`database`, success→`backend`, failure→`security`, neutral→`external` (read from node classes) | The state kind is a semantic alias over the 7 colours. No new palette is needed. |
| **Edge variants**: `default`, `emphasis` (main path, thicker, accent), `dashed` (async), `security` (dashed, rose) | `a-*` arrow classes, `m-*` markers, `t-edge-*` label classes | 4 edge variants with their own markers. Labels sit in "pill" chips with a `--mask` background. |
| **Automatic crossovers** where orthogonal edges cross | `data-graph-role="automatic-crossover"` + `…-underlay` | The router must detect crossings and draw hop or underlay masks. |
| **Font**: JetBrains Mono variable WOFF2 subsets inlined (latin, latin-ext, vietnamese, greek, cyrillic, cyrillic-ext ≈ 66 KB raw), OFL licence text embedded | `@font-face` with `base64` sources and SHA-256 per subset | **Monospace makes text measurement deterministic** (fixed advance width per glyph) on server and browser alike. This is a key enabler for server-side layout. CJK falls back to the system font, measured at 1 em per glyph. |
| **Reader contract** | `data-reader-min-text="7.5"`, `data-reader-primary-text="14"`, `data-reader-fit="intrinsic-height"` | Quality gate: no text below 7.5 px at fit zoom; primary labels at 14 px. |
| **Semantic DOM contract** | `data-node-id/-kind/-label/-sublabel/-context/-tag`, `data-edge-id/-from/-to/-label`, `data-composition-frame-kind`, `data-legend-semantic-kind` | We keep this attribute contract exactly. The viewer, the tests and the exports all rely on it. |
| Canvas sizes are 999–1376 px wide | `viewBox` 1080×588 … 1376×790 | Layout targets a ~1080 px reading width and fits to the viewport at 100 %. |

### 2.2 Per-type anatomy (reference = golden baseline)

| Type | Reference design (dark / light) | Preset | Structural elements | Legend |
| --- | --- | --- | --- | --- |
| **Architecture** | [web-app](design/architecture/dark_theme/web-app-dark.svg) · [production-deployment-ownership](design/architecture/light_theme/production-deployment-ownership-light.svg) | classic · blueprint (+ `engineering_profile: deployment-ownership`) | Grid-placed nodes (label, sublabel, tag such as "app team"); frames `region` (e.g. "AWS us-east-1 / production") and `security-group` (e.g. "sg-api :443/:8000"), which can be nested; orthogonal edges with labels; crossovers | Semantic kinds present in the diagram |
| **Workflow** | [agent-tool-call-workflow](design/workflow/dark_theme/agent-tool-call-workflow-dark.svg) | signal-flow | Horizontal **lanes** ("01 / User Interface"), one dashed **exception lane** ("EX / Policy & Recovery"), **phase** chips across the top ("Intake", "Plan + route", "Execute + report"), **groups** inside lanes ("Planning loop"), `mainPath` emphasis | Renamed semantic kinds |
| **Sequence** | [cache-miss-request-sequence](design/sequence/light_theme/cache-miss-request-sequence-light.svg) | classic | Participant header cards, dashed lifelines, **activation bars**, **segments** ("Request", "Fallback", "Response + trace"), messages: main, return (dashed), security, async, plain | Message variants |
| **Dataflow** | [order-event-stream-topology](design/dataflow/dark_theme/order-event-stream-topology-dark.svg) | signal-flow | Vertical **stage** columns ("01 / Producers" … "05 / Consumers"), two-line edge labels (label + sublabel such as "schema v1", "idempotent"), long dead-letter return paths | Flow variants + data store |
| **Lifecycle** | [deployment-release-lifecycle](design/lifecycle/light_theme/deployment-release-lifecycle-light.svg) | signal-flow (`main-path-v3`) | Initial marker (●→), numbered main-path states on the top row ("01 Queued" → "05 Live"), branch states below, **terminal** states with a double border, loops ("tests fail"), status tag line (pending / running / gate / terminal) | State kinds + initial + final |
| **ERD** | [order-management-schema](design/erd/dark_theme/order-management-schema-dark.svg) | classic (`data-erd-ui="cards"`) | **Domain bands** ("ACCOUNTS", "CHECKOUT", "CATALOG", "LINE ITEMS") with hue, table cards (accent header rule, zebra rows), columns with SQL type and **PK/FK/UK badges**, crow's-foot ends **one / many / optional**, edge label ("placed by") | PK, FK, UK, One, Many, Optional |

---

## 3. Target architecture

### 3.1 Principles

1. **Deterministic and pure.** The same IR plus the same renderer version produce byte-identical SVG. There is no randomness, no `Date.now()`, and no DOM in the render core. This enables snapshot tests, caching by content hash and reproducible gallery builds.
2. **Validated before delivery.** IR schema validation, then semantic validation, then post-layout quality checks. A failing check blocks the output in the CLI and fails the build in CI.
3. **Self-contained artifacts.** An artifact never fetches anything. CSP in the artifact HTML enforces this (`default-src 'none'`).
4. **Normalize to one graph model.** Every diagram type compiles to a common `Graph { nodes, edges, frames }` for the viewer. Route, lens, find, reach and radar are therefore written once and work for all six types.
5. **Accessible by construction.** Roles, labels and keyboard paths are emitted by the renderer, not patched on afterwards.
6. **Static first on Vercel.** Content is SSG on the CDN; functions exist only where input is dynamic.

### 3.2 System overview

```text
                ┌──────────────────────── packages (pure TS, isomorphic) ────────────────────────┐
  IR JSON  ───► │ @vca/ir        schema v1/v2 · migrate · validate (structural + semantic)        │
                │ @vca/tokens    base → preset → theme CSS vars · kinds · fonts (WOFF2 subsets)   │
                │ @vca/layout    per-type engines · text metrics · orthogonal router · crossovers │
                │ @vca/render    SVG emitter (data-* contract, a11y roles, markers, legend)       │
                │ @vca/viewer    vanilla-TS runtime → IIFE string (zoom, passport, route, lens…)  │
                │ @vca/html      assemble single-file HTML (SVG + IR + viewer + CSP hashes)       │
                └──────────┬───────────────────┬───────────────────────┬────────────────────────┘
                           │                   │                       │
                 vc-archify CLI (npx)  apps/web (Next.js on Vercel)    Vercel Functions (Node)
                 validate · render     SSG pages · gallery artifacts   v1: ISR revalidation only
                 + SKILL.md for agents  playground (client-side)        post-v1: /api/validate · /api/render
```

### 3.3 Monorepo layout (pnpm workspaces + Turborepo), as implemented

Decision D6 chose the fork ([ADR 0001](docs/adr/0001-build-vs-fork.md)), so the engine is vendored rather than written from scratch. The pipeline in §3.4–§3.8 is implemented by the vendored engine.

```text
vc-archify/
├─ skills/vc-archify/        # vendored engine + installable agent skill (SKILL.md, bin/vc-archify.mjs, renderers, schemas)
├─ packages/
│  ├─ viewer/                # viewer runtime sources (src/) + generator → skills/vc-archify/assets/template.html
│  ├─ render/                # @vca/render: Node API (render/validate/check/CSP) + engine tests (parity with design/)
│  └─ browser-engine/        # @vca/browser-engine: renderers bundled for a Web Worker (/playground)
├─ apps/web/                 # Next.js 16 site (static): pages, artifact/source route handlers, e2e, thumbnails
├─ gallery/                  # versioned IR: sources/ (12 gallery diagrams) + cases/life/ (4 "beyond code")
├─ design/                   # reference designs = golden baselines (read-only)
├─ scripts/                  # sync-upstream.mjs · smoke.mjs · check-engines.mjs
├─ docs/                     # adr/0001-build-vs-fork.md · runbook.md
├─ .github/workflows/        # ci.yml (gates) · deploy.yml (vercel pull → build → deploy --prebuilt → smoke → promote)
├─ package.json              # packageManager pnpm@12.3.4 · engines.node 24.x · devEngines.runtime node 24.22.0 (§4.1.1)
├─ pnpm-lock.yaml            # also pins the Node 24 runtime binaries (per-platform URL + sha256)
├─ turbo.json · pnpm-workspace.yaml · UPSTREAM.json · LICENSE · NOTICE
```

### 3.4 Render pipeline

| Stage | Responsibility | Output |
| --- | --- | --- |
| 1. Parse + migrate | Accept `schema_version` 1 or 2; migrate v1 → v2 | `IRv2` |
| 2. Validate | JSON Schema (Ajv, generated from Zod) plus semantic rules: unique IDs, edge endpoints exist, lane/col/stage bounds, `mainPath` is a valid walk, ERD FK targets exist, sequence message order, lifecycle initial state exists and terminal states have no outgoing edges | `Diagnostics[]` with a JSON pointer, a message and a fix hint (the agent reads these) |
| 3. Normalize | Type-specific IR → common `Graph` + type-specific `Scene` hints | `Graph`, `Scene` |
| 4. Layout | Type engine (see §3.6) places nodes and frames, using monospace text metrics | Positioned boxes |
| 5. Route | Orthogonal router with obstacle avoidance, port assignment, label placement, crossover detection | Polylines + label anchors + crossover marks |
| 6. Quality gate | No node/frame overlap, no label collisions, no edge through a node, min text ≥ 7.5 px, WCAG AA contrast for text tokens in **both** themes, canvas ≤ max size | Pass, or a blocking diagnostic |
| 7. Emit SVG | Tokens CSS, fonts, defs/markers, frames, edges, nodes, legend, `<title>/<desc>`, `data-*` contract | `string` |
| 8. Assemble HTML | Inline SVG, IR (`<script type="application/json">`), viewer IIFE, side-panel cards, CSP with script hashes | Single `.html` (target ≤ 350 KB) |

### 3.5 IR v2 (common core + per-type extensions)

> **As implemented:** after the fork (D6), the IR is **upstream's per-type JSON Schema** (`skills/vc-archify/schemas/*.schema.json`; e.g. architecture `components`/`connections`/`boundaries`, ERD `entities`/`relationships`). The sketch below was the design intent and maps onto those schemas; the published schemas are authoritative.

```ts
// common
interface IRBase {
  schema_version: 2;
  diagram_type: 'architecture'|'workflow'|'sequence'|'dataflow'|'lifecycle'|'erd';
  meta: { title: string; description?: string; animation?: 'trace'|'static';
          visual_preset?: 'classic'|'signal-flow'|'blueprint'|'editorial'; // editorial: accepted, renders as classic in v1
          quality_profile?: 'showcase'|'draft'; engineering_profile?: 'deployment-ownership';
          legend?: Partial<Record<Kind, string>> };            // legend renaming (PRD §4)
  cards?: { dot: Kind; title: string; items: string[] }[];     // side panel
}
type Kind = 'frontend'|'backend'|'database'|'cloud'|'security'|'messagebus'|'external';
type EdgeVariant = 'default'|'emphasis'|'dashed'|'security';
interface Node { id: string; type: Kind; label: string; sublabel?: string; tag?: string; width?: number }
interface Edge { id: string; from: string; to: string; label?: string; sublabel?: string;
                 variant?: EdgeVariant; via?: [number, number][] }
```

| Type | Extension fields |
| --- | --- |
| architecture | `nodes[].{col,row}`; `frames[]: {id, kind:'region'\|'security-group', label, members[] \| parent}` |
| workflow | `lanes[]: {id,label,variant?:'exception'}`, `phases[]: {id,label,fromCol,toCol}`, `groups[]: {id,label,lane,fromCol,toCol,variant}`, `nodes[].{lane,col}`, `mainPath[]` |
| sequence | `participants[]: Node`, `segments[]: {id,label,from,to}` (step indices), `messages[]: {id,from,to,label,variant:'main'\|'return'\|'security'\|'async'\|'message', activate?:boolean}` |
| dataflow | `stages[]: {id,label}`, `nodes[].{stage,row}`, `edges[].sublabel` |
| lifecycle | `states[]: {id,label,sublabel?,kind:'active'\|'waiting'\|'decision'\|'success'\|'failure'\|'neutral', status?, terminal?:boolean}`, `initial`, `mainPath[]`, `transitions[]: Edge` |
| erd | `domains[]: {id,label,hue:Kind}`, `tables[]: {id,domain,columns[]:{name,type,key?:'pk'\|'fk'\|'uk'}}`, `relations[]: {id,from:{table,column},to:{table,column},card:{from:'one'\|'many',to:'one'\|'many'},optional?:boolean,label?}` |

An IR that asks for `visual_preset: "editorial"` gets a non-blocking diagnostic ("preset not available yet") and renders with `classic`. IR written for upstream Archify therefore still renders.

The schema is published at `/schema/ir-v2.json`. The guide, the skill and the playground editor (JSON autocompletion) all use it.

### 3.6 Layout engines

| Type | Placement | Routing specifics |
| --- | --- | --- |
| architecture | Authored grid (`col,row`) → pixel grid. Frames are computed as padded hulls of their members; nested frames are supported. | Orthogonal A* on a sparse visibility grid; ports on box sides; crossover hops; label pills placed at the midpoint of the longest segment. |
| workflow | Lane bands × phase columns; groups are sub-rects in a lane; the exception lane uses dashed styling | Cross-lane edges are routed through lane gutters; `mainPath` edges are emphasised |
| sequence | Participant columns spread evenly (`data-sequence-column-fit="spread"`); a vertical timeline is derived from message order | No router needed: straight horizontal messages, self-messages as loops, activation bars from call/return pairing, segments as background bands |
| dataflow | Stage columns × rows; column widths from content | Long back-edges (DLQ, replay) are routed around the outside and through gutters; two-line labels |
| lifecycle | `main-path-v3`: `mainPath` on the top row, numbered; off-path states placed in rows below their source; terminal states in the bottom rows | Loop edges routed above the row ("tests fail"); dashed variant for exception transitions |
| erd | Domain bands as packed rects; tables inside a band in authored order; row height is fixed | Column-anchored ports (edges attach at the exact FK/PK row); crow's-foot glyph markers; shared trunks (`data-er-trunk`) |

Fallback: if a placement field is missing, `elkjs` (layered, orthogonal) proposes positions. The output is still validated, and the agent receives a diagnostic suggesting explicit placement.

### 3.7 Viewer runtime (`@vca/viewer`)

Vanilla TypeScript with a tiny state store, bundled by esbuild as an IIFE string and inlined into every artifact. **Budget: ≤ 45 KB min+gzip.**

| Module | PRD ref | Notes |
| --- | --- | --- |
| `zoom` | §4.2 | Pan/zoom; **reading depth**: tags and annotations appear above a zoom threshold; AUTO zoom when a node is focused; `0` resets, `+/−` zoom |
| `passport` | §4.3 | Floating card (kind, context path, tag, stable ID, degree, reach buttons, in/out lists, copy link, MAP). Draggable; arrow keys move it, `Home` resets its position. |
| `reach` | §4.3 | BFS upstream/downstream over authored edges; `#reach=` |
| `route` + `journey` | §4.6 | `R`; BFS shortest path; only reachable nodes light up; step through or play; disabled under `prefers-reduced-motion`; `#route=a~b` |
| `lens` | §4.7 | `L` or legend click; one kind shows all incident traffic, two kinds show only direct edges between them; `#lens=` |
| `find` | §4.8 | `/`; fuzzy search over label, sublabel, kind and ID, with link counts |
| `radar` | §4.9 | `M`; minimap; click to focus; arrow keys pan |
| `guide` | §4.10 | `?`; shortcut cards and key strip (E, T, S, 0, ±, Esc); the star prompt points to the vc-archify repo |
| `url-state` | §4.11 | Hash serialization (`focus`, `reach`, `relation`, `route`, `lens`) and query flags (`present`, `embed`, `theme`) |
| `panel` | §4.1 | Cards and node index grouped by lane; can be moved beside the diagram |
| `theme` / `preset` | §3 | `T` toggles `data-theme`; `S` cycles the three v1 presets; the default follows `prefers-color-scheme` |
| `a11y` | §4.12 | Roving tabindex, `aria-pressed`, live status announcements, focus trap in dialogs |
| `export` | §3 | Described in §3.8 |

Storage: viewer preferences use `localStorage` only inside `try/catch`, because sandboxed and opaque-origin iframes throw on access.

### 3.8 Export (in-browser, no server)

| Format | Method | Notes / risk |
| --- | --- | --- |
| Dual-theme SVG | Serialize the live SVG with both variable blocks + `@media (prefers-color-scheme)` + embedded fonts | Same format as the files in `design/` |
| PNG / JPEG / WebP | SVG → Blob URL → `Image` → `canvas` at scale ≤ 4 → `toBlob` | **Clamp the scale to the browser's canvas-area limit.** Safari caps a canvas at ~16.7 M px, and 1376×790 at 4× is 17.4 M px. Show the effective scale in the menu. |
| WebM motion | Step the trace animation deterministically (Web Animations API `currentTime`) → draw each frame to canvas → `captureStream` + `MediaRecorder` | Safari WebM support varies. Feature-detect, offer MP4 if `isTypeSupported`, and otherwise disable the option with a tooltip. |
| Clipboard | `navigator.clipboard.write([ClipboardItem{'image/png'}])` | Inside a sandboxed embed iframe, fall back to download |

### 3.9 Website routes (`apps/web`)

| Route (English only) | Content | Rendering on Vercel |
| --- | --- | --- |
| `/` | Landing: types, output, design system, "beyond code" cases, quickstart | SSG |
| `/start?agent=&type=` | Install wizard per agent (Claude Code, Codex, Cursor, OpenCode, Copilot) + starter prompt per type | SSG shell; params are read on the client |
| `/gallery` | Artifact grid + Proof Lab (lazy `loading="lazy"` iframes, `?embed=1&theme=`) | SSG |
| `/gallery/artifacts/[slug]` | **The artifact itself** (self-contained HTML) | Route handler, `dynamic='force-static'`, `generateStaticParams` from `gallery/sources` |
| `/gallery/sources/[slug].json` | The IR that produced the artifact ("linked to the exact source") | force-static route handler |
| `/cases/life/[slug]` | Non-code examples (leave plan, renting, budget, job search) | force-static |
| `/guide` | IR reference, skill usage, presets, profiles (MDX) | SSG |
| `/community` | Packages and compatibility (IR v1/v2) | SSG + ISR (`revalidate: 86400`) |
| `/playground` | JSON editor (Monaco + IR schema) → live preview in a `srcdoc` sandbox iframe → download HTML/exports | Static shell; rendering is 100 % client-side |
| `/schema/ir-v2.json` | Published JSON Schema | Static |
| `sitemap.xml`, `robots.txt`, OG images | Next metadata routes, `next/og` | Generated at build time |

The GitHub star count is fetched server-side with ISR (`revalidate: 3600`) using a `GITHUB_TOKEN`. This avoids the client-side GitHub REST calls seen in PRD §6 and their rate limits. It costs at most ~24 function invocations a day, a negligible share of the Hobby quota.

Public `/api/validate` and `/api/render` are **not part of v1** (§1, §8).

---

## 4. Production deployment on Vercel

### 4.0 Hobby (free) plan: constraints and how the plan adapts

Decision D5 puts vc-archify on Vercel's **Hobby** plan. The owner confirmed on 2026-10-17 that it is a **personal, non-commercial** project, which is exactly what Hobby is for. The plan is therefore designed to **stay on Hobby permanently**.

Hobby has hard limits and no paid overage, so the deployment design is shaped around them. The limits below were checked against Vercel docs and community answers on 2026-10-17. Vercel changes them over time, so P0 re-checks each one in the dashboard.

| Hobby constraint | Impact on vc-archify | Adaptation in this plan |
| --- | --- | --- |
| **Personal, non-commercial use only** | ✅ **Fits: confirmed personal use.** | Keep it that way: no ads, paid features, sponsor-gated features or client work. Commercial use would require Pro (§8). |
| **Single-owner account**: no team members. You cannot deploy from a **private** repo owned by a GitHub organisation, and for private repos only commits authored by the owner deploy. | ✅ **Fits a solo personal project**: the owner is the only operator and the only commit author | The repo lives under the owner's **personal GitHub account**, not an org; public or private both deploy on Hobby (see "Still open" in §9). **Deploys run from GitHub Actions** with the owner's `VERCEL_TOKEN` (`vercel pull` → `vercel build` → `vercel deploy --prebuilt`), and Git-integration auto-deploys are off. CI deploys are chosen for an **exact toolchain** (pnpm 12.3.4 + Node 24, §4.1.1) and **gates before deploy**. |
| **No Rolling Releases** (Pro/Enterprise only) | No canary of 10 % → 50 % → 100 % | Gate before production instead: full e2e on the CI build, smoke test on the preview URL, then a production deploy and a post-deploy smoke test (§4.5) |
| **Instant Rollback only to the immediately previous production deployment** | You cannot jump back several releases in one click | Every production deploy is tagged. One-step rollback uses `vercel rollback`; anything older re-runs `deploy.yml` on an earlier tag (`workflow_dispatch`). |
| **No Skew Protection** (a Pro/Enterprise feature per Vercel docs; verify in P0) | A browser tab open across a deploy can request a JS chunk that no longer exists | Artifacts are self-contained and unaffected. The site adds a global chunk-load-error handler that forces one full reload. Pages are static, so the impact is low. |
| **Limited WAF**: few custom rules and roughly one rate-limit rule per project | You cannot protect many paths separately | With no public API, the single rate-limit rule protects the heaviest objects: `/gallery/artifacts/*` (e.g. 300 req/min/IP, against scraping and hot-linking that would drain the transfer quota) |
| **Monthly quotas are hard caps**: about 100 GB Fast Data Transfer, about 1 M function invocations, 4 CPU-hours Active CPU, about 1 M edge requests | Exceeding a cap can pause the project until the next cycle; you cannot buy more on Hobby | **No public functions in v1**; static-first. Image Optimization is off (`images.unoptimized: true`, WebP generated at build time). The **Proof Lab shows static WebP thumbnails** and loads a live artifact iframe only on click (1 artifact per visit instead of 12). Page-weight budgets in §5. Personal traffic should stay far below these caps; the safeguards are cheap insurance against scraping or a link going viral. Check the Usage page weekly in the launch month and monthly after that; act at 50 % of any quota. |
| **One concurrent build; deployments per day are capped** | A busy PR day could queue or block deploys | Builds run in GitHub Actions (`vercel build`), so Vercel only uploads. Docs-only changes don't deploy (`paths-ignore`). |
| **Limited observability**: no log drains, short runtime-log retention, capped Web Analytics/Speed Insights data | Thin production telemetry | With almost no runtime code there is little to log. CI annotations carry build and size telemetry. Web Analytics and Speed Insights are used within the included quotas (§4.6). |
| **Free GitHub Actions** (not Vercel, but part of the free-tier toolchain): unlimited minutes on standard runners for public repos; a monthly minute allowance for private repos on GitHub Free | A heavy CI suite on a private repo could use up the minutes | Lean CI: PRs run unit + golden + Chromium e2e; the full Chromium/WebKit/Firefox matrix runs on `main` and before tagging. Cache the pnpm store, the Playwright browsers and Turborepo. `concurrency` cancels superseded runs. |

**Rough capacity on 100 GB/month** (estimate; confirm with real page weights in P7). This is orders of magnitude above expected personal-use traffic:

| Visit type | Transfer per visit (compressed) | Visits/month within quota |
| --- | --- | --- |
| Landing page (JS ≤ 120 KB + images ≤ 900 KB) | ≈ 1 MB | ≈ 100 k |
| Gallery with static thumbnails + 1 live artifact | ≈ 1.3 MB | ≈ 75 k |
| Direct artifact link (≈ 350 KB raw → ≈ 130 KB brotli) | ≈ 0.13 MB | ≈ 750 k |

**Leaving Hobby is not planned.** If the usage model ever changed, moving to Pro would be a settings change, not a re-architecture. The changes that would require it are commercial use, a second person needing Vercel access, or sustained use above 70 % of a quota. After switching you could optionally:

- enable Rolling Releases and Skew Protection;
- add more WAF rules and log drains;
- invite collaborators and use Git-integration deploys;
- bring back `/api/*` from the backlog.

### 4.1 Project setup

| Setting | Value |
| --- | --- |
| Framework preset | **Next.js** (pin the current stable major at Phase 0; App Router) |
| Root directory | `apps/web` ("Include files outside root directory" **on**, which monorepo packages need) |
| Build location | **GitHub Actions**, not Vercel's build servers: `vercel pull --environment=<preview\|production>` → `vercel build [--prod]` → `vercel deploy --prebuilt [--prod]`. The install and build commands in `vercel.json` are what `vercel build` runs in CI. |
| Install / build | `pnpm install --frozen-lockfile` / `turbo run build --filter=@vca/web` |
| Git integration | Auto-deploys **off** (`"git": { "deploymentEnabled": false }`), so pushes cannot trigger blocked or duplicate builds (§4.0) |
| Skipped builds | Docs-only changes are skipped by `paths-ignore` in `deploy.yml`. There is no `turbo-ignore`, because gallery IR and the engine live outside the `@vca/web` package graph (§4.3). |
| Node.js | **24.x**, Vercel's current default and supported LTS line. **pnpm manages the Node version** (`devEngines.runtime`), and `engines.node: "24.x"` tells Vercel which runtime to use. Details in §4.1.1. |
| Package manager | `packageManager: "pnpm@12.3.4"`. It runs in CI, so Vercel never has to install pnpm 12 itself. Details in §4.1.1. |
| Vercel CLI | Pinned as a root devDependency (`vercel@<exact>`) and run through `pnpm exec vercel …`, so it uses the pinned Node 24 |
| Remote cache | Turborepo remote cache linked to the owner's Hobby account (free on all plans); CI uses `TURBO_TOKEN` + `TURBO_TEAM` |
| Functions | v1 has only ISR revalidation (star count, community), on the Node.js runtime with Fluid compute defaults. Hobby allows up to 300 s; we need under 5 s. |
| Function region | One region near the primary audience. Static assets are served globally from the CDN anyway. |
| Domain | `vc-archify.vercel.app` (if available) until a custom domain is chosen. Hobby supports custom domains. |
| Plan tier | **Hobby (free)**: decision D5; constraints and upgrade path in §4.0 |

### 4.1.1 Toolchain pinning: pnpm manages Node 24.x

**pnpm is the single source of truth for the Node version.** There is no `.nvmrc`, nvm, Volta or `actions/setup-node`. Developers keep whatever system Node they have (currently 26.x); every project command runs on the Node 24 that pnpm pins.

**Setup (once, at the repo root):**

```bash
pnpm runtime set node 24      # resolves the latest 24.x, writes devEngines.runtime, pins it in pnpm-lock.yaml
pnpm shim add node            # optional, per developer: a bare `node` inside the repo resolves to the pinned runtime
pnpm approve-builds           # pnpm ≥ 11 blocks dependency build scripts by default; commit the allow-list (esbuild, …)
```

Root `package.json` (the runtime version is written by `pnpm runtime set`):

```json
{
  "name": "vc-archify",
  "private": true,
  "packageManager": "pnpm@12.3.4",
  "engines": { "node": "24.x" },
  "devEngines": {
    "runtime": { "name": "node", "version": "24.22.0", "onFail": "download" }
  }
}
```

`apps/web/package.json` repeats `"engines": { "node": "24.x" }`. Vercel reads the `package.json` in the project's Root Directory (`apps/web`).

**Who reads what:**

| Consumer | Reads | Result |
| --- | --- | --- |
| Local dev (`pnpm dev`, `pnpm test`, `pnpm exec …`) | `devEngines.runtime` + lockfile | pnpm downloads Node **24.22.0**, checks it against the lockfile's sha256, and runs every script on it, whatever the system Node is |
| CI (GitHub Actions), including `vercel build` | Same as local | Standalone pnpm (`pnpm/action-setup`, `standalone: true`) → `pnpm install --frozen-lockfile` fetches the pinned Node 24. No separate Node setup step. The production build is therefore made with exactly pnpm 12.3.4 + Node 24.22.0. |
| Vercel Functions runtime (ISR) | `engines.node: "24.x"` | Deployed functions run on Vercel's latest 24.x. Pin the **major only**: exact patch pins such as `24.14.0` have caused engine-mismatch failures on Vercel. |
| Vercel install step | Not used in v1 (builds run in CI) | Only if Git-integration builds are re-enabled after a move to Pro: set `ENABLE_EXPERIMENTAL_COREPACK=1` so Corepack installs pnpm 12.3.4, because Vercel's built-in detection lists pnpm only up to v10 |

**Rules:**

- Only the patch version may differ: local/CI use 24.22.0, Vercel uses its current 24.x. Majors must never diverge. A CI check fails if `engines.node` and `devEngines.runtime.version` disagree on the major.
- To upgrade Node, run `pnpm runtime set node 24`, which bumps the patch and updates the lockfile, in its own PR. Moving to a new major (e.g. 26.x) happens only after Vercel lists it as supported. The change touches `engines.node` and `devEngines.runtime` together.
- **Phase 0 verification:** the first `deploy.yml` run must log pnpm 12.3.4 and Node 24.22.0 for `vercel build`, and the deployed functions must report Node 24.x. Because the build runs in CI, the risk that Vercel's own install step can't handle pnpm 12 does not apply in v1.

Verified locally on this machine (system Node v26.8.2, pnpm 12.3.4) in a scratch project: `pnpm runtime set node 24` wrote the `devEngines.runtime` block above, the lockfile pinned per-platform Node 24.22.0 tarballs with sha256 integrity, and `pnpm exec node --version` printed `v24.22.0`.

### 4.2 Rendering strategy

- **Essentially 100 % of traffic is static.** Pages and gallery artifacts are prerendered at build time from `gallery/sources/*.json` through the same `@vca/html` package. Nothing generated is committed, so there is a single source of truth.
- The build fails if any gallery IR fails validation or the quality gate.
- **Content-hash caching:** artifact responses carry an `ETag` equal to `sha256(IR + renderer version)`. Static assets under `/_next/static` are immutable.
- **Functions:** v1 has only ISR revalidation (`/` star count hourly, `/community` daily), about 25 invocations a day. When the post-v1 `/api/*` returns, it stays stateless, takes a JSON body ≤ 1 MB (well under Vercel's 4.5 MB request limit) and has no database.
- **Images:** `images.unoptimized: true`. WebP thumbnails and OG images are generated at build time, so Hobby's Image Optimization quota is never used.

### 4.3 Configuration (as implemented)

The sketches that used to be here are now real files; read those rather than a copy here:

| File | What it does |
| --- | --- |
| [`apps/web/next.config.ts`](apps/web/next.config.ts) | Security headers on every page; `X-Frame-Options: SAMEORIGIN` on site pages; on artifacts, a strict CSP built from the viewer's inline-script hashes (`default-src 'none'; script-src 'sha256-…' …; frame-ancestors *`, read from `.generated/gallery.json`); `.html` → extension-less 308 redirects; `images.unoptimized`; monorepo tracing root |
| [`apps/web/vercel.json`](apps/web/vercel.json) | `framework: nextjs`, `pnpm install --frozen-lockfile`, `pnpm run build`, `git.deploymentEnabled: false` |
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | Gates (§5): engines check, viewer template freshness, engine doctor, engine render/parity/contract tests, site build, typecheck, Playwright (Chromium on PRs, full matrix on `main`) |
| [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) | `vercel pull` → `vercel build` → `vercel deploy --prebuilt`. PR → preview. Production runs **only after CI passed on `main`** (`workflow_run`) as a **staged** deployment (`--prod --skip-domain`), followed by `pnpm smoke`, then `vercel promote`. `workflow_dispatch(ref)` redeploys an older ref. |
| [`scripts/smoke.mjs`](scripts/smoke.mjs) | Post-deploy checks: pages, headers, artifact CSP, redirect, sitemap, IR JSON |

Changes from the earlier sketch:

- There is **no `turbo-ignore` step**. Gallery IR and the engine live outside the `@vca/web` package graph, so `turbo-ignore` could wrongly skip a deploy. Docs-only changes are skipped with `paths-ignore` instead, and Hobby's deployment cap is ample for one developer.
- **Staged-then-promote** replaces "deploy, then roll back on failure". A failed smoke test never reaches the production domain.

### 4.4 Security

| Threat | Control |
| --- | --- |
| XSS through IR strings (labels, sublabels, cards) | The emitter escapes every text node and attribute. IR never accepts raw HTML or SVG. URL-like fields are allow-listed (`https:` only). Fuzz tests run on the emitter. |
| Untrusted IR in the Playground | Rendered in `iframe srcdoc` with `sandbox="allow-scripts allow-downloads"` (**no** `allow-same-origin`), so it runs in an opaque origin. This also fixes the Chrome warning noted in PRD §6. |
| Artifact data exfiltration | Artifact CSP `default-src 'none'`: the artifact cannot make network requests even if the content were compromised. |
| Quota exhaustion (scraping, hot-linking) | No public API in v1. Hobby's single WAF rate-limit rule covers `/gallery/artifacts/*` (§4.0). Weekly usage review. When the post-v1 API returns, it gets body-size, Ajv depth and size limits and a render timeout guard. |
| Supply chain | `pnpm` lockfile, `--frozen-lockfile`, Renovate with weekly batches, `pnpm audit` in CI, no runtime CDN scripts |
| Secrets | Vercel environment variables: only `GITHUB_TOKEN` (star count). GitHub Actions secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `TURBO_TOKEN`. Deploy jobs never run for PRs from forks, so a fork can't read `VERCEL_TOKEN`. Nothing is exposed through `NEXT_PUBLIC_`. |
| Preview leakage | Previews can show unreleased work, which matters if the repo is private. Keep Vercel Authentication (Standard Deployment Protection) on previews. Full e2e runs in CI against the built app (`next start`), so it doesn't need preview access. The preview smoke test uses Protection Bypass for Automation if Hobby offers it (check in P0); otherwise only the production smoke test runs. |

### 4.5 Environments and release flow

```text
feature branch ──PR──► ci.yml: lint · typecheck · unit · golden-diff · budgets · Playwright e2e + axe (next start)
                  └──► deploy.yml: vercel build → deploy --prebuilt (Preview URL)
                         └──► smoke test + Lighthouse CI on the preview URL · URL commented on the PR
main (merge) ─────────► ci.yml passes ──workflow_run──► deploy.yml: vercel build --prod → deploy --prebuilt --prod --skip-domain (staged)
                         └──► smoke test on the staged URL ──pass──► vercel promote (100 % at once; no rolling release on Hobby)
                                                            └─fail──► not promoted; production keeps the previous release
tag v1.x.y ───────────► SKILL.md release · (optional) publish the vc-archify CLI to npm
```

- **No Skew Protection on Hobby.** A global chunk-load-error handler forces a full reload (§4.0); artifacts are unaffected.
- **Rollback:** `vercel rollback` returns to the previous production deployment in seconds. Anything older runs `deploy.yml` through `workflow_dispatch` with the older tag, which costs one CI build (≈ 5–10 min, estimate).
- **Release tags** (`v1.x.y`) update `SKILL.md`. Publishing the `vc-archify` CLI to npm is optional for personal use: the skill can run the CLI straight from the repo (`pnpm --dir <repo> exec vc-archify …`). The site reads its displayed version from the same tag, as in PRD "v3.1.0 · stable".
- **Domains:** `vc-archify.vercel.app` at launch. If a custom domain is added: apex + `www` (redirect to apex), then HSTS `preload`. If public share links ship after v1 (§8), user content gets a separate `artifacts.<domain>`.

### 4.6 Observability and analytics

- **Vercel Web Analytics + Speed Insights** run on site pages only, within the quotas included in Hobby. They are **never injected into artifact HTML**, which keeps the zero-external-request guarantee (PRD §4.14).
- **Usage dashboard** (Fast Data Transfer, edge requests, invocations) is reviewed by the owner weekly in the launch month and monthly after that. At 50 % of any quota we cut page weight or tighten the rate limit; at 70 % sustained we consider Pro (§4.0).
- Runtime logs are minimal (ISR only) and Hobby has no log drains. Post-deploy smoke tests are the production health signal.
- Build telemetry tracks artifact size per gallery item, render time per type, and quality-gate failures. These run as CI annotations so regressions are visible in the PR.

---

## 5. Quality gates and testing

| Layer | Tooling | Gate |
| --- | --- | --- |
| IR | Vitest + fixtures (valid/invalid per rule) | 100 % of the semantic rules have a failing fixture |
| Layout/route | Vitest property tests (random graphs → no overlaps, no edge-through-node, determinism) | Two consecutive renders of the same IR are byte-identical |
| SVG snapshots | Vitest snapshot per gallery source | A snapshot change requires an explicit update in the PR |
| **Golden visual** | Playwright screenshots of re-created designs × {dark, light} vs `design/*.svg` rendered PNGs; `pixelmatch` | ≤ 0.5 % differing pixels per image (tune in Phase 1) |
| Viewer e2e | Playwright: every shortcut (`R L / M ? E T S 0 + − Esc`), deep links, passport drag, journey, reduced motion | Green on Chromium for every PR; green on Chromium, WebKit and Firefox on `main` and before every tag (saves Actions minutes, §4.0) |
| Accessibility | `@axe-core/playwright`, keyboard-only scripts, contrast check on tokens | 0 serious/critical violations; AA contrast in both themes |
| Budgets | Page weights measured with Playwright on `next start` (§10) | Landing total ≤ 1 MB; gallery initial load ≤ 1.3 MB (static thumbnails); landing JS ≤ 140 KB gz (revised from 120 KB: the Next 16 / React 19 runtime alone is ≈ 130 KB gz). Artifact size follows ADR 0001 (≈ 824 KB raw / 207 KB gz, an accepted F6 deviation). |
| Site performance | Lighthouse CI on the preview URL | Performance ≥ 95, a11y = 100, SEO ≥ 95 |
| Exports | Playwright download assertions (dimensions, MIME, 4× clamp) | Matrix green; known Safari gaps documented |

---

## 6. Delivery phases

**Assumed:** one developer (the owner of the personal project and the Vercel account), working with AI coding agents. Effort is in focused full-time-equivalent weeks (FTE-weeks). These are estimates, re-baselined after P1 and after the D6 spike. For one person the phases run mostly in sequence, so the calendar time is roughly the sum. That is about **18 FTE-weeks** (≈ 4–5 months full-time; longer part-time).

**Ship early, then add to it.** The production site goes live at milestone **M1** and grows with each phase. This suits a personal project better than one big launch.

| Phase | Effort (FTE-weeks) | Deliverables | Exit criteria |
| --- | --- | --- | --- |
| **P0 Foundations** | 1 | GitHub repo under the personal account; monorepo; pnpm-managed Node 24 toolchain (§4.1.1); Vercel Hobby project with Git auto-deploys off; `ci.yml` + `deploy.yml` (CLI prebuilt deploys); Turborepo remote cache; Hobby limits re-checked (§4.0); **token extractor** that parses the 14 design SVGs into `@vca/tokens` (base/preset/theme); IR v2 Zod schema + validator skeleton; **2-day build-vs-fork spike** with a go/no-go memo (§9, D6) | "Hello artifact" deployed to a preview **and** production by `deploy.yml`; token parity test green (extracted vars = design vars); D6 decided |
| **P1 Core + Architecture** | 2.5 | Text metrics, grid placement, orthogonal router with crossovers, frames, SVG emitter, HTML assembler, CLI `validate`/`render` | `web-app` and `production-deployment-ownership` re-created from IR within the visual threshold in both themes |
| **P4a Viewer core** | 1.5 | Zoom/reading depth, focus passport, reach, find, theme toggle, URL state, a11y basics | e2e + axe green on the architecture type |
| **M1: first production release** | (0.5, part of P6) | A minimal gallery page + the architecture artifacts, deployed to production by `deploy.yml` | The site is live on `vc-archify.vercel.app`; the CLI and skill are usable for architecture diagrams |
| **P2 Workflow + Dataflow** | 2 | Lanes, phases, groups, exception lane, `mainPath`; stages, two-line labels, outer back-edges | `agent-tool-call-workflow` and `order-event-stream-topology` pass the golden diff; shipped to production |
| **P3 Sequence, Lifecycle, ERD** | 3 | Lifelines/activations/segments; `main-path-v3`, terminal and initial markers; domain bands, column ports, crow's-foot | `cache-miss-request-sequence`, `deployment-release-lifecycle` and `order-management-schema` pass the golden diff; shipped to production |
| **P4b Viewer complete** | 2.5 | Route + journey, lens, radar, guide, panel, presentation/embed modes | e2e + axe gates green on all six types; viewer budget met |
| **P5 Export** | 1.5 | SVG, PNG/JPEG/WebP (4× with clamp), WebM, clipboard | Export matrix green on Chromium/WebKit/Firefox |
| **P6 Website** | 2.5 | Landing, Start wizard, Gallery + Proof Lab (static thumbnails), Guide (MDX), Community, Playground (English only), vc-archify branding and attribution, SEO (sitemap, OG) | Every sitemap route renders; Lighthouse gates; English copy reviewed |
| **P7 Hardening & v1** | 1 | CSP hashes, WAF rate-limit rule, page-weight and quota review against §4.0, one-page runbook, rollback drill, `SKILL.md` for the agents you use, optional npm publish | Go-live checklist (§7) signed off |
| **Post-v1** | — | Backlog in §8 | Each item is decided separately |

Dropping zh localisation saved about 1 FTE-week, which is already reflected above.

**If the D6 spike chooses the fork,** P1–P5 change from "build" to "wrap, rebrand, close gaps and pass the golden diff". The expected saving is about 5–7 FTE-weeks (an estimate, re-baselined right after the spike). P0, P6 and P7 are unchanged.

---

## 7. Go-live checklist

Status as of 2026-10-17 (see §10). ✅ = verified in this repo, 🔲 = owner action at or after the first deploy.

- ✅ All 6 types × 2 themes × the 3 designed presets match the reference designs (viewBox, node and edge sets: 14/14 parity tests), and every gallery artifact passes the engine's checks
- ✅ Gallery build fails on any invalid IR (verified with a deliberately broken fixture: duplicate component id → build exits 1 with diagnostics)
- ✅ Artifact HTML makes zero network requests (Playwright: the only request is the document itself, with no CSP violations)
- ✅ CSP and security headers verified locally (`next start`, `vercel build` output); 🔲 re-check on production with `pnpm smoke <url>` (securityheaders.com optional)
- ✅ Playground iframe uses `sandbox="allow-scripts allow-downloads"` (no `allow-same-origin`); the injection probe is escaped (engine test)
- 🔲 WAF rate-limit rule on `/gallery/artifacts/*` (Vercel → Firewall; suggested in docs/runbook.md). ✅ `VERCEL_TOKEN` is used only in `deploy.yml`, whose jobs skip fork PRs
- ✅ Hobby eligibility: personal, non-commercial use (confirmed 2026-10-17); repo under the owner's personal GitHub account (lk153/vc-archify); no ads or paid features
- ✅ Page-weight budgets met (landing 345 KB first load / 603 KB fully scrolled, gallery ≈ 660 KB, landing JS 138 KB gz against the revised 140 KB budget)
- 🔲 Web Analytics + Speed Insights: opt-in (enable in Vercel, then set `NEXT_PUBLIC_VERCEL_ANALYTICS=1`); they load on site pages only, never in artifacts
- 🔲 Rollback drill after the first two production deploys: `vercel rollback`, plus one `workflow_dispatch` redeploy of an older ref
- 🔲 `SKILL.md` install verified in the coding agent(s) you use (`npx skills add lk153/vc-archify --skill vc-archify -g` once the repo is pushed). npm publish of the CLI is optional.
- ✅ No user-visible "Archify" branding apart from the attribution lines; the artifact `<desc>` reads "generated by vc-archify" (engine test and built-page audit)
- ✅ One-page personal runbook: [docs/runbook.md](docs/runbook.md)

---

## 8. Post-v1 backlog

Nothing here is planned for v1. Each item needs its own go/no-go decision.

| Item | Prerequisite | Notes |
| --- | --- | --- |
| `editorial` preset | A dark + light reference design | Tokens slot into the existing `base → preset → theme` cascade; the golden-diff gate applies as for the other presets |
| zh-Hans (or other) localisation | Translated copy | Introduce a `[locale]` segment with English at the root, hreflang alternates and `messages/<locale>.json`. Artifacts are unaffected because their copy comes from the IR. |
| Hosted AI generation | Product decision + budget | `POST /api/generate` (streaming Vercel Function); LLM output constrained to the IR JSON Schema; validate → repair loop (≤ 3 rounds, `Diagnostics[]` fed back to the model); latest Claude models via the Vercel AI SDK; per-user quota, prompt-size cap and cost alerts |
| Public share links | Abuse and moderation policy | Content-hash IDs; served from a separate `artifacts.<domain>` origin |
| Public `/api/validate` + `/api/render` | Usage evidence, and preferably Pro (Hobby quotas are hard caps) | Node.js Vercel Functions; body ≤ 1 MB; dedicated WAF rate-limit rule; render timeout guard |
| Move to Vercel Pro | **Not expected.** Only if use becomes commercial or multi-person (§4.0) | Settings change only: rolling releases, skew protection, more WAF rules, log drains, collaborator access, Git-integration deploys |
| Class, Tree, Timeline, Waterfall types | Designs | Same pipeline: new IR extension + layout engine + golden baselines |
| Artifact size reduction (ADR 0001, F6) | — | Minify the inlined viewer JS/CSS in `packages/viewer/scripts/generate-viewer.mjs` and drop unused locales from the i18n island; keep the design-parity and e2e tests green |
| Automated axe + Lighthouse gates | — | Add `@axe-core/playwright` to the e2e suite and Lighthouse CI on the preview URL (Plan §5); today a11y is covered by role/name/heading assertions only |
| Playground byte-identity beyond Chromium | Firefox/WebKit in CI (`main` matrix) | Verify the browser engine's output equals the Node render outside Chromium; text segmentation can differ for exotic scripts |
| Make the browser-check gate blocking | One green run on Linux runners | Remove `continue-on-error` from the `ci.yml` step |

---

## 9. Risks and open decisions

### Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Orthogonal routing quality (crossovers, label collisions) is the hardest part | Visual parity slips | Start with architecture in P1 (densest routing); use authored `via` points as an escape hatch; the quality gate catches regressions |
| Pixel parity depends on font rasterisation differences between OSes | Flaky golden tests | Run golden tests only in the CI Linux container with pinned Chromium; compare against PNGs rendered in that same container |
| Safari canvas, WebM and clipboard limits | Export gaps | Feature detection, clamped scale, documented fallbacks (§3.8) |
| Artifact size creep (fonts ≈ 88 KB base64 + viewer + SVG) | Slow email/PR sharing | `size-limit` budgets; subset fonts to the glyphs actually used (keep the vietnamese subset when needed) |
| Next.js / Vercel config details change between versions | Build breaks on upgrade | Pin versions; Renovate PRs go through preview + the full gate suite |
| Vercel's install step doesn't honour pnpm 12 | Builds fail at install | **Avoided in v1**: builds run in CI (`vercel build`); Corepack is needed only if Git-integration builds are re-enabled (§4.1.1) |
| Hobby quota exhausted (scraping, a link going viral) | Project paused until the next cycle; site down | Unlikely at personal-use traffic. Static-only v1, static Proof Lab thumbnails, page-weight budgets, rate-limit rule, periodic usage review (§4.0) |
| GitHub Actions minutes run out (private repo) | CI and deploys stop until the next month | Lean CI (§4.0): full browser matrix only on `main` and before tags; caching; cancel superseded runs. A public repo removes the limit. |
| Use drifts beyond personal (commercial, or a second operator) | Hobby terms no longer fit | Revisit before it happens; moving to Pro is a settings change (§4.0, §8) |

### Decisions recorded (2026-10-17)

| # | Topic | Decision | Applied in |
| --- | --- | --- | --- |
| D1 | `editorial` preset | **Deferred** until a design exists. v1 ships `classic`, `signal-flow` and `blueprint`. | §1, §3.5, §3.7, §8 |
| D2 | Hosted AI generation | **Out of v1.** Authoring goes through the user's agent, the skill and the CLI. | §0, §1, §3.2, §8 |
| D3 | Localisation | **English only** at launch; copy is centralised so a later locale is additive | §1, §3.3, §3.9, §6, §8 |
| D4 | Product name | **vc-archify** | See the branding rules below |
| D5 | Vercel plan | **Hobby (free), permanently.** vc-archify is a **personal, non-commercial** project (confirmed 2026-10-17), built and operated by one developer. v1 is static-only and deployed from CI. | §0, §1, §4.0–§4.6, §5, §6, §7, §8 |
| D6 | Build vs fork | **2-day spike in P0** against the criteria below. **Outcome (2026-10-17): fork.** F1–F5 and F7 pass, F2 with exact viewBox/node/edge parity on all 7 references. F6 (size) is a documented deviation: 824 KB raw / 207 KB gzip per artifact, still within the Hobby budget. See [ADR 0001](docs/adr/0001-build-vs-fork.md). | §0, §3.3, §6, below |

**Branding rules (D4):**

- **User-visible name** is "vc-archify" in page titles, header and footer, OG images, the CLI (bin `vc-archify`, and the npm package of the same name if published), the skill name, and the artifact `<title>`/`<desc>` ("… generated by vc-archify").
- **Attribution** goes in the site footer, `README`, `LICENSE`/`NOTICE` and the guide: "Inspired by Archify (github.com/tt-a1i/archify, MIT), itself based on Cocoon-AI/architecture-diagram-generator". If the build-vs-fork spike ends in a fork, the upstream MIT copyright notice must also be kept verbatim in `LICENSE`.
- **No confusion with archify.si:** use our own logo mark (not the upstream lockup), our own domain, and no "Archify" alone as a product name.
- **Internal identifiers stay as they are.** The `data-*` contract, CSS class and keyframe names, and element IDs match the design files so the golden tests stay comparable. They are not user-visible.
- **Phase 0 checks:** the GitHub repo `vc-archify` is created under the personal account. The npm name `vc-archify` is checked only if you decide to publish the CLI.

**Build-vs-fork spike (D6): the bar.** Upstream Archify (`github.com/tt-a1i/archify`, MIT) is evaluated in 2 days. **Every** criterion must pass to fork.

| # | Criterion | Pass if |
| --- | --- | --- |
| F1 | Licence | The code is MIT, the bundled fonts are OFL, and nothing is unlicensed; the attribution and NOTICE requirements are understood |
| F2 | Fidelity | From IR, it renders all six reference designs in both themes and in `classic` / `signal-flow` / `blueprint` within the golden threshold (≤ 0.5 % pixel diff, §5) |
| F3 | Architecture fit | Rendering runs headless in Node without a browser DOM (or behind a thin shim) and is deterministic, so the same engine serves the CLI, the gallery build and the playground |
| F4 | Viewer coverage | It covers the PRD §4 interactions, or closing the gaps is ≤ 2 engineer-weeks |
| F5 | Security | It escapes IR text and attributes, and has no `eval` and no remote fetches in artifacts (compatible with the artifact CSP in §4.3) |
| F6 | Size | Artifact HTML ≤ 350 KB raw and viewer ≤ 45 KB gz, or reachable with straightforward trimming |
| F7 | Maintainability | Modular code with tests; TypeScript types or `.d.ts` can be added; rebranding to vc-archify needs no deep surgery; a usable IR v1/v2 contract |

- **Go (fork), the chosen path:** `scripts/sync-upstream.mjs` vendors upstream into `skills/vc-archify/` (engine + skill) and `packages/viewer/src/`, re-applies the rebrand and patches, and records the commit in `UPSTREAM.json`. This replaces the planned `git subtree` into `packages/engine`, because it is repeatable and makes the rebrand explicit. The upstream `LICENSE` is kept verbatim, with a root `NOTICE`. `@vca/render` (Node) and `@vca/browser-engine` (Web Worker) wrap the engine; the website, CLI, CI/CD and Vercel setup in this plan are unchanged.
- **No-go (build):** follow P1–P5 as written. Upstream becomes a behavioural reference (an oracle in the golden tests), with no code reuse beyond what MIT allows with attribution.
- **Deliverable:** `docs/adr/0001-build-vs-fork.md`, recording the per-criterion evidence, the decision and the revised timeline.

### Still open

Neither item blocks P0; the defaults apply until you decide.

1. **Custom domain** (optional; Hobby supports it). The default is `vc-archify.vercel.app` until a domain is chosen.
2. **Repo visibility** (both work on Hobby when the repo is under a personal account). **Public** (recommended) gives unlimited GitHub Actions minutes on standard runners and matches the MIT licence. **Private** keeps work-in-progress hidden and runs within GitHub Free's monthly minutes, which the lean CI in §4.0 is designed for.

---

## 10. Implementation record (2026-10-17)

All of P0–P7 is implemented in this repository. Production deployment is left to the owner, using the existing Vercel project and GitHub secrets.

| Phase | Delivered | Evidence |
| --- | --- | --- |
| P0 Foundations | pnpm 12.3.4 + pnpm-pinned Node 24.22.0 (`devEngines.runtime`, `engines.node 24.x`, `pnpm check:engines`); workspace + Turborepo; build-vs-fork spike and **ADR 0001 (fork)**; `scripts/sync-upstream.mjs` (vendor + rebrand + patches; idempotent) | ADR 0001 evidence table; `UPSTREAM.json` (upstream `88d1ae4`, v3.1.0) |
| P1–P3 Six diagram types | Vendored engine in `skills/vc-archify/` (renderers, schemas, CLI `bin/vc-archify.mjs`, `SKILL.md`), wrapped by `@vca/render` | `pnpm --filter @vca/render test`: **35/35**. All 16 gallery/life sources validate, render and pass engine checks; **14/14 design-parity tests** (7 references × dark/light: viewBox, node set, edge set, preset); determinism; branding; self-containment; CSP; escaping |
| P4 Viewer | Vendored viewer (`packages/viewer/src`), regenerated into the skill template (`pnpm viewer:check`) | `e2e/viewer.spec.ts`: zero network requests, passport, route + journey, finder/guide/theme shortcuts, legend → lens mapping, presentation/embed, ERD keys, redirect, CSP |
| P5 Export | Upstream export menu (PNG/JPEG/WebP up to 4×, SVG auto/light/dark, WebM, clipboard) | e2e downloads a dual-theme SVG and a valid PNG |
| P6 Website | Next.js 16.4.2 static site: `/`, `/gallery` (static thumbnails + click-to-load Proof Lab), `/start` (5 agents × 6 types; works without JS), `/guide`, `/community`, `/playground` (in-browser engine in a Web Worker, sandboxed preview), `/schemas/*`, sitemap/robots/OG, artifacts at `/gallery/artifacts/*` and `/cases/life/*` | `e2e/site.spec.ts` and `e2e/playground.spec.ts` (playground output **byte-identical** to the Node render for all 16 sources); full suite **56/56** (Chromium) |
| P7 Hardening | Strict artifact CSP (hash-based), security headers, `.html` → 308, chunk-reload guard (no Skew Protection on Hobby), opt-in Vercel Analytics, `ci.yml`, `deploy.yml` (CLI prebuilt; staged → smoke → promote → smoke production → auto-rollback), `scripts/smoke.mjs`, `docs/runbook.md`, LICENSE/NOTICE | `vercel build` verified locally (Build Output API, functions on `nodejs24.x`, CSP and redirects in `config.json`); `pnpm browser-check`: 12 pass, 4 known upstream deviations (baselined), 0 new |

**Measured page weight** (`next start`, gzip): landing 345 KB first load (603 KB fully scrolled); gallery ≈ 660 KB; start/guide/community 233–249 KB; landing JS 138 KB. Playground first render ≈ 410 KB extra, after which re-renders transfer nothing.

**Owner actions before and at the first deploy:**
1. Vercel project: **Root Directory `apps/web`**, "Include files outside the root directory" on, framework Next.js.
2. GitHub: the secrets `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` are already set. Optionally add `VERCEL_AUTOMATION_BYPASS_SECRET` and the variable `PRODUCTION_HOST` (if the domain isn't `vc-archify.vercel.app`).
3. Commit and push. CI runs, then `deploy.yml` deploys production after CI passes on `main`.
4. After go-live: the WAF rate-limit rule, opt-in analytics, the rollback drill and skill-install checks (§7 🔲 items).

