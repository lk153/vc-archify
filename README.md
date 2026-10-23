# vc-archify

**Describe it in plain words. Get a map you can trust.**

vc-archify is an agent skill (Claude Code, Codex, Cursor, OpenCode, GitHub Copilot) that turns a plain-language description, or code, into a **validated, self-contained interactive HTML diagram**. The agent writes typed JSON (the IR). The engine validates it, lays it out and renders one HTML file with inline SVG, dark/light themes, a full interactive viewer and in-browser export (PNG/JPEG/WebP up to 4×, dual-theme SVG, WebM, clipboard).

Featured diagram types: **architecture · workflow · sequence · dataflow · lifecycle · erd**. The engine also renders class, tree, timeline and waterfall diagrams.

**The web app is one full-screen page.** The live, interactive diagram viewer fills the window; a resizable, collapsible configuration panel on the left holds the example picker, render controls, preview theme, diagnostics, the IR JSON editor and the HTML/JSON downloads. Rendering runs in your browser; nothing is uploaded.

> vc-archify is a personal, non-commercial fork of [Archify](https://github.com/tt-a1i/archify) (MIT), itself based on [Cocoon-AI/architecture-diagram-generator](https://github.com/Cocoon-AI/architecture-diagram-generator). It is not affiliated with archify.si. See [NOTICE](NOTICE) and [docs/adr/0001-build-vs-fork.md](docs/adr/0001-build-vs-fork.md).

## Use the skill

```bash
npx skills add lk153/vc-archify --skill vc-archify -g
```

Or copy [`skills/vc-archify/`](skills/vc-archify/) into your agent's skills folder. Then ask your agent for a diagram ("draw the architecture of this repo", "map our release workflow"). The skill tells the agent how to author the IR and run:

```bash
node skills/vc-archify/bin/vc-archify.mjs validate architecture candidate.json --json
node skills/vc-archify/bin/vc-archify.mjs render   architecture candidate.json diagram.html
node skills/vc-archify/bin/vc-archify.mjs check    diagram.html --json
```

The output is one HTML file. Open it in a Chromium-based browser or attach it to an email or PR. It makes **no network requests**.

**Supported browsers:** Chromium-based only (Chrome, Edge, Brave, Opera, Arc). The playground and the diagrams are built and tested for Chromium; other browsers are not supported.

## Repository layout

| Path | What |
| --- | --- |
| [`skills/vc-archify/`](skills/vc-archify/) | Vendored engine **and** installable skill: renderers, JSON schemas, CLI (`bin/vc-archify.mjs`), `SKILL.md`, references, examples |
| [`packages/viewer/`](packages/viewer/) | Viewer runtime sources and the generator for `skills/vc-archify/assets/template.html` |
| [`packages/render/`](packages/render/) | `@vca/render`, a Node API (`renderDiagram`, `validateDiagram`, `checkArtifact`, `artifactCsp`) plus the engine tests |
| [`packages/browser-engine/`](packages/browser-engine/) | Browser bundle of the renderers (Web Worker) used by the playground |
| [`apps/web/`](apps/web/) | The web app (Next.js 16, fully static): one page, the playground at `/`, plus `/examples/*.json` |
| [`examples/`](examples/) | IR for the playground's example picker (12 technical diagrams); every one is rendered and checked at build time |
| [`design/`](design/) | Reference designs (6 types × dark/light) and the golden baselines for the parity tests |
| [`scripts/`](scripts/) | `sync-upstream.mjs` (re-vendor + rebrand), `smoke.mjs` (deployment checks: run by CI on PR previews, by you on production), `browser-check-examples.mjs`, `check-engines.mjs` |
| [`Plan.MD`](Plan.MD), [`PRD.MD`](PRD.MD), [`docs/adr/`](docs/adr/) | Plan, requirements and decisions |

## Develop

The toolchain is **pnpm 12.3.4**, and pnpm also manages Node: the repo pins **Node 24** through `devEngines.runtime`, whatever your system Node is.

```bash
pnpm install                    # also downloads the pinned Node 24 runtime
pnpm dev                        # browser engine + examples + next dev  (http://localhost:3000)
pnpm --filter @vca/render test  # engine: every example renders + passes checks, design parity, escaping
pnpm --filter @vca/web build    # production build (fails if any example IR is invalid)
pnpm --filter @vca/web e2e      # Playwright (Chromium only) against `next start`: local Google Chrome, bundled Chromium in CI
pnpm browser-check              # engine's Chrome-based gate on every rendered example
pnpm viewer:build               # regenerate the viewer template after editing packages/viewer/src
pnpm check:engines              # Node pins agree (devEngines.runtime ↔ engines.node)
```

Run scripts through `pnpm` (or `node_modules/.bin/node`) so they use the pinned Node 24.

Before you push to `main`, run the release checklist:

```bash
make verify       # CI's gates + a smoke test of the production build + repo checks (secrets, licence, vercel.json)
make help         # every step on its own, plus the optional vercel-build and smoke-prod
```

It needs Google Chrome and free ports 3107 and 3108 (`E2E_PORT=… SMOKE_PORT=…` to change them).

### Where diagrams live

- **Built-in examples** (the "Examples · …" groups in the Diagram picker) are the JSON files in [`examples/`](examples/). They are rendered and checked at build time and served read-only at `/examples/<file>.json`.
- **My diagrams** (the first group in the picker) are kept in your browser's `localStorage`, for this browser and device only. You add them with **+ New…** (starts from a template of that type), **Import JSON** (one or more `.json` IR files, e.g. ones your agent wrote with the skill), or **Save to My diagrams** (keeps your edits to an example or draft). They save automatically as you edit; rename or delete them in the panel. Use **Download JSON** to back up or move a diagram. A downloaded `.html` can't be imported, because it doesn't contain the source IR.

### Rearrange a diagram by dragging

With **Drag to rearrange** on (the default), drag nodes in the preview and the IR JSON is updated, then re-rendered:

| Type | What you can drag | What changes in the JSON |
|---|---|---|
| Architecture | components; a boundary by its label or border (moves everything it `wraps`) | `pos` (snapped to 10 units; hold Alt to place freely), or `row`/`col` in a grid layout |
| ERD | tables | `pos`, or `row`/`col` in a grid layout (dropping on another table swaps them) |
| Workflow | nodes; a group by its border (moves its nodes) | `lane` and `col` |
| Dataflow | nodes | `stage` and `row` |

Sequence and lifecycle diagrams are laid out by the engine, so they are not draggable. Routes follow the move: hand-placed `via` points slide with the node they lead into, and hand-placed label offsets are dropped so the engine places the label again. Only the values that change are rewritten; the rest of the file keeps its formatting.

If the engine rejects the new position (overlap, a route through another node, and so on), the move is undone and the note says why; **Apply anyway** keeps it so you can fix the rest by hand. **Undo move** / **Redo** (or Ctrl/⌘ + Z / Shift + Z with the preview focused) step through moves. With a node focused, Alt/⌥ + arrow keys nudge it (Shift: 5 steps). The preview keeps your zoom across re-renders.

### Sync My diagrams (optional)

Open **Sync** in the panel. Both targets can be on at the same time.

- **Folder on this computer** (Chromium's File System Access API): **Connect folder…** and pick a folder, such as one inside a git repo or a synced Dropbox/iCloud/Drive folder. Every diagram in My diagrams is written there as `<name>.<type>.json` and updated as you edit. JSON diagrams that appear in the folder (from your agent, `git pull`, another device) are added on connect, reload or **Sync now**. Deleting a diagram deletes its file. After a browser restart, click **Reconnect** to grant access again.
- **GitHub repository**: enter `owner/name`, branch, a folder in the repo (default `diagrams`) and a **fine-grained personal access token** limited to that repository with *Contents: Read and write*. The token goes only to `api.github.com` and is kept for the tab session unless you tick "Remember the token on this device". **Pull** loads the folder's diagrams; **Commit this diagram** or **Commit all changes** makes one commit per diagram (`vc-archify: add|update <name>`); deleting a diagram can also delete it from the repo.
- **Conflicts never lose data.** If a diagram changed on both sides, the other version is kept as a separate "(folder copy)" or "(GitHub copy)" diagram.

### Add or change a playground example

1. Add or edit `examples/<name>.<type>.json`.
2. Check it: `pnpm vc-archify validate <type> examples/<name>.<type>.json --json`.
3. `pnpm --filter @vca/web examples` (renders and checks all examples), then commit the IR.

### Sync with upstream Archify

```bash
git clone https://github.com/tt-a1i/archify /tmp/archify
node scripts/sync-upstream.mjs /tmp/archify   # re-vendors, rebrands, patches and regenerates the viewer template
pnpm --filter @vca/render test
```

The sync script re-vendors the engine, re-applies the rebrand and the small vc-archify patches, and records the commit in [`UPSTREAM.json`](UPSTREAM.json).

## Deploy (Vercel Hobby)

GitHub Actions builds and deploys with the Vercel CLI. Vercel's own Git auto-deploys are off (`apps/web/vercel.json`).

One-time setup:

1. **Vercel project settings:** Framework **Next.js**, **Root Directory `apps/web`**, and "Include files outside the root directory" **on**. Node.js version: 24.x is read from `engines.node`.
2. **GitHub → Settings → Secrets and variables → Actions:** repository secret `VERCEL_TOKEN` (create it at vercel.com/account/tokens), plus `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` as secrets or variables. Get the IDs from `.vercel/project.json` after `pnpm exec vercel link`, or from the Vercel dashboard (Project → Settings → General → Project ID; your account's Settings → General → ID). Optional: `VERCEL_AUTOMATION_BYPASS_SECRET` (smoke-tests protected deployment URLs before promotion), `TURBO_TOKEN` + the `TURBO_TEAM` variable (remote cache).
3. **Vercel environment variables (optional):** `NEXT_PUBLIC_SITE_URL` if you use a custom domain (the default is `https://vc-archify.vercel.app`), and `NEXT_PUBLIC_VERCEL_ANALYTICS=1` after enabling Web Analytics.

Flow ([`.github/workflows/`](.github/workflows/)):

- **Pull request** → `ci.yml` (gates) and `deploy.yml` (preview deployment + smoke test, with the URL commented on the PR).
- **Push to `main`** → `ci.yml`. When it passes, `deploy.yml` deploys to production (`vercel deploy --prebuilt --prod`). No automated checks run against production; verify it yourself, e.g. `pnpm smoke https://<your-production-domain>`.
- **Rollback** → Instant Rollback in the Vercel dashboard or `vercel rollback <previous-deployment-url>` (Hobby can only return to the previous production deployment), or run the **Deploy** workflow manually with an older tag/commit. See [docs/runbook.md](docs/runbook.md).

Deploying by hand from your machine works the same way:

```bash
pnpm exec vercel link            # once
pnpm exec vercel pull --environment=production
pnpm exec vercel build --prod
pnpm exec vercel deploy --prebuilt --prod
```

## Licence

[MIT](LICENSE). Third-party material (JetBrains Mono, optional brand-mark vectors) is listed in [NOTICE](NOTICE) and [`skills/vc-archify/THIRD_PARTY_NOTICES.md`](skills/vc-archify/THIRD_PARTY_NOTICES.md).
