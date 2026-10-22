# vc-archify: local release checklist.
#
#   make verify    run every check that must pass before a production deploy
#   make help      list all targets
#
# `verify` runs the same gates as CI (.github/workflows/ci.yml) plus a smoke test
# of the production build and repository checks, in order, and stops at the
# first failure. Each step also runs on its own (make test, make e2e, ...); the
# steps after `build` use its output.
#
# Needs pnpm (it installs the pinned Node 24 itself), git, curl and Google
# Chrome. Works with the GNU Make 3.81 that ships with macOS.

SHELL := /bin/bash
PNPM ?= pnpm
NODE := node_modules/.bin/node
E2E_PORT ?= 3107
SMOKE_PORT ?= 3108
PROD_URL ?= https://vc-archify.vercel.app

.DEFAULT_GOAL := help
.NOTPARALLEL:
.PHONY: help verify preflight install engines repo viewer doctor test build typecheck \
	browser-check smoke e2e git-status vercel-build smoke-prod

step = @printf '\n\033[1;34m==> %s\033[0m\n' "$(1)"
# curl exits with 7 when nothing listens on the port.
require_free_port = @curl -s -o /dev/null --max-time 2 http://127.0.0.1:$(1)/; \
	if [ $$? -ne 7 ]; then echo "Port $(1) is in use. Stop that server or run with $(2)=<free port>."; exit 1; fi
require_build = @[ -f apps/web/.next/BUILD_ID ] || { echo "No production build yet: run make build first."; exit 1; }
# Git auto-deploys stay off: production deploys only come from the Deploy workflow.
VERCEL_JSON_CHECK = const c = require("./apps/web/vercel.json"); \
	if (c.git?.deploymentEnabled !== false) { console.error("apps/web/vercel.json: git.deploymentEnabled must be false (deploys run from GitHub Actions)"); process.exit(1); } \
	if (c.framework !== "nextjs") { console.error("apps/web/vercel.json: framework must be nextjs"); process.exit(1); }

help: ## List the targets
	@grep -E '^[a-z0-9-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN { FS = ":.*## " } { printf "  \033[1m%-14s\033[0m %s\n", $$1, $$2 }'

verify: preflight install engines repo viewer doctor test build typecheck browser-check smoke e2e ## Full pre-deploy checklist
	@printf '\n\033[1;32m✓ verify passed: this working tree is ready for a production deploy.\033[0m\n'
	@$(MAKE) --no-print-directory git-status

preflight: ## Required tools and free ports
	$(call step,Preflight: tools and ports)
	@command -v $(PNPM) >/dev/null || { echo "pnpm not found: https://pnpm.io/installation"; exit 1; }
	@command -v git >/dev/null || { echo "git not found"; exit 1; }
	@command -v curl >/dev/null || { echo "curl not found"; exit 1; }
	@[ -n "$$E2E_BUNDLED_BROWSERS" ] || [ -d "/Applications/Google Chrome.app" ] || command -v google-chrome >/dev/null || command -v google-chrome-stable >/dev/null || \
		{ echo "Google Chrome not found: the e2e tests and the browser check run in it (or set E2E_BUNDLED_BROWSERS=1 after 'pnpm --filter @vca/web exec playwright install chromium')."; exit 1; }
	$(call require_free_port,$(E2E_PORT),E2E_PORT)
	$(call require_free_port,$(SMOKE_PORT),SMOKE_PORT)
	@echo "pnpm $$($(PNPM) --version), $$(git --version), Chrome found, ports $(E2E_PORT) and $(SMOKE_PORT) free"

install: ## Install exactly what pnpm-lock.yaml pins (as Vercel does)
	$(call step,Install dependencies from the lockfile)
	$(PNPM) install --frozen-lockfile

engines: ## Node pins agree (devEngines.runtime and engines.node)
	$(call step,Node version pins)
	$(PNPM) check:engines

repo: ## No secrets tracked; licence notices and Vercel config in place
	$(call step,Repository checks)
	@tracked=$$(git ls-files | grep -E '(^|/)(\.env($$|\.)|\.vercel/)' | grep -v '\.example$$' || true); \
	if [ -n "$$tracked" ]; then echo "Local secrets or Vercel files are tracked by git (git rm --cached them):"; echo "$$tracked"; exit 1; fi
	@for f in LICENSE NOTICE UPSTREAM.json apps/web/vercel.json; do [ -f $$f ] || { echo "Missing $$f"; exit 1; }; done
	@$(NODE) -e '$(VERCEL_JSON_CHECK)'
	@echo "No secrets tracked, LICENSE and NOTICE present, vercel.json leaves deploys to GitHub Actions"

viewer: ## Viewer template is up to date with packages/viewer/src
	$(call step,Viewer template is up to date)
	$(PNPM) viewer:check

doctor: ## Engine self-check
	$(call step,Engine self-check)
	$(PNPM) vc-archify doctor

test: ## Engine render, design parity and contract tests
	$(call step,Engine tests)
	$(PNPM) --filter @vca/render test

build: ## Production build (browser engine, examples, next build)
	$(call step,Production build)
	$(PNPM) --filter @vca/web build

typecheck: ## TypeScript (after build)
	$(call step,Typecheck)
	$(PNPM) --filter @vca/web exec tsc --noEmit

browser-check: ## Engine's Chrome gate on every rendered example (after build)
	$(call step,Engine browser check)
	$(PNPM) browser-check

smoke: ## Post-deploy smoke test, run against the local production build (after build)
	$(call step,Smoke test of the production build on http://127.0.0.1:$(SMOKE_PORT))
	$(require_build)
	$(call require_free_port,$(SMOKE_PORT),SMOKE_PORT)
	@set -e; \
	( cd apps/web && exec ../../$(NODE) node_modules/next/dist/bin/next start -p $(SMOKE_PORT) ) > apps/web/.next/smoke-server.log 2>&1 & \
	server=$$!; \
	trap 'kill $$server 2>/dev/null || true' EXIT; \
	for i in $$(seq 1 60); do \
		curl -s -o /dev/null http://127.0.0.1:$(SMOKE_PORT)/ && break; \
		kill -0 $$server 2>/dev/null || { echo "next start exited:"; cat apps/web/.next/smoke-server.log; exit 1; }; \
		sleep 1; \
	done; \
	$(PNPM) smoke http://127.0.0.1:$(SMOKE_PORT)

e2e: ## Playwright end-to-end tests in Chrome (after build)
	$(call step,End-to-end tests)
	$(require_build)
	$(call require_free_port,$(E2E_PORT),E2E_PORT)
	E2E_PORT=$(E2E_PORT) $(PNPM) --filter @vca/web e2e

git-status: ## What still stands between this tree and production
	@branch=$$(git rev-parse --abbrev-ref HEAD); \
	changes=$$(git status --porcelain | wc -l | tr -d ' '); \
	ahead=$$(git rev-list --count '@{u}..HEAD' 2>/dev/null || echo 0); \
	[ "$$branch" = main ] || echo "! On branch $$branch: production deploys from main."; \
	[ "$$changes" = 0 ] || echo "! $$changes uncommitted change(s): verify checked them, but only commits pushed to main are deployed."; \
	[ "$$ahead" = 0 ] || echo "! $$ahead commit(s) on $$branch not pushed yet."; \
	echo "To deploy: git push origin main. CI runs again, then the Deploy workflow ships it to production."

vercel-build: ## Optional: build with the Vercel CLI as the deploy workflow does (needs vercel link + login)
	$(call step,Vercel build for production)
	@[ -f .vercel/project.json ] || { echo "Link the project first: pnpm exec vercel link"; exit 1; }
	$(PNPM) exec vercel pull --yes --environment=production
	$(PNPM) exec vercel build --prod

smoke-prod: ## Optional: smoke test the live site (PROD_URL=...)
	$(call step,Smoke test of $(PROD_URL))
	$(PNPM) smoke $(PROD_URL)
