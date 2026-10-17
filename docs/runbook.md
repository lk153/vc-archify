# vc-archify runbook

This is the one-page operating guide for the personal Vercel Hobby deployment (Plan §4, §7).

## Health check

```bash
pnpm smoke https://vc-archify.vercel.app
```

It checks every page, the artifact CSP, the `.html` → extension-less redirect, the sitemap and the IR JSON.

## Roll back

| Situation | Action |
| --- | --- |
| The latest production deploy is bad | Vercel dashboard → Deployments → the previous production deployment → **Instant Rollback**, or `pnpm exec vercel rollback <previous-deployment-url> --yes --token "$VERCEL_TOKEN"`. Hobby can only return to the **immediately previous** production deployment. |
| You need an older release | GitHub → Actions → **Deploy** → *Run workflow* with the tag or commit SHA. It rebuilds that ref, smoke-tests it and promotes it. |
| A production smoke test failed in CI | If it failed on the staged URL, the deployment was never promoted. If it failed on the production domain after promotion, `deploy.yml` already rolled back to the previous production deployment. Either way, production serves the previous release. Fix the cause and merge again. |

After a rollback, Vercel stops auto-assigning the production domain to new deployments until you promote one again. The next successful `main` deploy calls `vercel promote`, which restores this.

## Fix a broken gallery diagram

1. Reproduce it: `pnpm vc-archify validate <type> gallery/sources/<file>.json --json`. The diagnostics include a JSON pointer and suggested fixes.
2. Fix the IR, then run `pnpm --filter @vca/web gallery && pnpm --filter @vca/web thumbnails`.
3. Open a PR. CI renders every artifact and fails on any invalid IR. Merge, and production deploys after CI passes.

## A Hobby quota is near its limit

Check Vercel → Usage. Hobby caps are hard: if one is exceeded, the project can be paused until the next cycle.

1. Find the traffic source: Vercel → Observability / Web Analytics (look for hot-linked artifact URLs or scrapers).
2. Tighten the WAF rate-limit rule on `/gallery/artifacts/*` (Vercel → Firewall). The suggested rule is 300 requests/min per IP with a 60 s block.
3. Reduce page weight: thumbnails are already static, and live artifacts load only on click.
4. If it is sustained and legitimate, see Plan §4.0 (moving to Pro is a settings change).

## Rotate the Vercel token

1. Vercel → Account Settings → Tokens: create a new token scoped to the project's team and delete the old one.
2. GitHub → Settings → Secrets and variables → Actions: update `VERCEL_TOKEN`.
3. Re-run the latest **Deploy** workflow to confirm it works.

## Upgrade Node within 24.x

```bash
pnpm runtime set node 24      # bumps the patch, updates devEngines.runtime + pnpm-lock.yaml
pnpm check:engines
```

Do this in its own PR. Moving to a new major version requires Vercel to support it first; update `engines.node` in `package.json` and `apps/web/package.json` together.

## Sync the engine with upstream

See [README → Sync with upstream Archify](../README.md#sync-with-upstream-archify). Always run `pnpm --filter @vca/render test` afterwards. The design-parity tests show whether upstream changed the rendering of the reference diagrams.
