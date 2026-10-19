# vc-archify runbook

This is the one-page operating guide for the personal Vercel Hobby deployment (Plan §4, §7).

## Health check

```bash
pnpm smoke https://<your-production-domain>          # e.g. the domain in Vercel → Project → Domains
VERCEL_TOKEN=… pnpm smoke <deployment-url> --vercel-curl   # a protected deployment URL
```

It checks the playground page and its security headers, the in-browser engine bundle (`/engine/manifest.json`), an example IR, and the redirects from the former multi-page URLs.

## Roll back

| Situation | Action |
| --- | --- |
| The latest production deploy is bad | Vercel dashboard → Deployments → the previous production deployment → **Instant Rollback**, or `pnpm exec vercel rollback <previous-deployment-url> --yes --token "$VERCEL_TOKEN"`. Hobby can only return to the **immediately previous** production deployment. |
| You need an older release | GitHub → Actions → **Deploy** → *Run workflow* with the tag or commit SHA. It rebuilds that ref and deploys it to production; then check it yourself with `pnpm smoke`. |

After a rollback, Vercel stops auto-assigning the production domain to new deployments until you promote one again. When the fix is deployed, open it in Vercel → Deployments and choose **Promote** once; later deploys go live automatically again.

## Fix a broken playground example

1. Reproduce it: `pnpm vc-archify validate <type> examples/<file>.json --json`. The diagnostics include a JSON pointer and suggested fixes.
2. Fix the IR, then run `pnpm --filter @vca/web examples`.
3. Open a PR. CI renders every example and fails on any invalid IR. Merge, and production deploys after CI passes.

## A Hobby quota is near its limit

Check Vercel → Usage. Hobby caps are hard: if one is exceeded, the project can be paused until the next cycle.

1. Find the traffic source: Vercel → Observability / Web Analytics (look for hot-linked artifact URLs or scrapers).
2. Add or tighten a WAF rate-limit rule on `/engine/*`, the heaviest download (Vercel → Firewall). The suggested rule is 300 requests/min per IP with a 60 s block.
3. Reduce page weight: the engine loads per diagram type on demand, and re-renders download nothing.
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
