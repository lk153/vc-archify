# vc-archify

**Describe it in plain words. Get a map you can trust.**

vc-archify is an agent skill (Claude Code, Codex, Cursor, OpenCode, GitHub Copilot) that turns a plain-language description, or code, into a **validated, self-contained interactive HTML diagram**. The agent writes typed JSON (the IR). The engine validates it, lays it out and renders one HTML file with inline SVG, dark/light themes, a full interactive viewer and in-browser export (PNG/JPEG/WebP up to 4×, dual-theme SVG, WebM, clipboard).

Featured diagram types: **architecture · workflow · sequence · dataflow · lifecycle · erd**. The engine also renders class, tree, timeline and waterfall diagrams.

**The web app is one page: a playground.** Pick an example or paste IR JSON, see engine diagnostics, preview the interactive diagram (dark/light), and download the HTML or JSON. Rendering runs in your browser; nothing is uploaded.

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
| [`scripts/`](scripts/) | `sync-upstream.mjs` (re-vendor + rebrand), `smoke.mjs` (post-deploy checks), `browser-check-examples.mjs`, `check-engines.mjs` |
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
2. **GitHub → Settings → Secrets and variables → Actions:** repository secret `VERCEL_TOKEN` (create it at vercel.com/account/tokens), plus `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` as secrets or variables. Get the IDs from `.vercel/project.json` after `pnpm exec vercel link`, or from the Vercel dashboard (Project → Settings → General → Project ID; your account's Settings → General → ID). Optional: `VERCEL_AUTOMATION_BYPASS_SECRET` (smoke-tests protected deployment URLs before promotion), `TURBO_TOKEN` + the `TURBO_TEAM` variable (remote cache). Set the repository **variable** `PRODUCTION_HOST` to your production domain (Vercel → Project → Domains) so each deploy also smoke-tests it after promotion, with auto-rollback on failure.
3. **Vercel environment variables (optional):** `NEXT_PUBLIC_SITE_URL` if you use a custom domain (the default is `https://vc-archify.vercel.app`), and `NEXT_PUBLIC_VERCEL_ANALYTICS=1` after enabling Web Analytics.

Flow ([`.github/workflows/`](.github/workflows/)):

- **Pull request** → `ci.yml` (gates) and `deploy.yml` (preview deployment + smoke test, with the URL commented on the PR).
- **Push to `main`** → `ci.yml`. When it passes, `deploy.yml` builds a staged production deployment, smoke-tests it (`scripts/smoke.mjs`, reaching the protected deployment URL through `vercel curl`), promotes it, then smoke-tests the production domain if `PRODUCTION_HOST` is set. If that fails, it rolls back automatically to the previous production deployment.
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
