# Archify (archify.si) — Feature Inventory

> **Source:** <https://archify.si/> (site version **v3.1.0 · stable**, captured 2026-10-15)

---

## 1. What Archify is

Archify is an **open-source (MIT) Agent Skill** that turns a plain-language description of a system, process or plan into a **single self-contained interactive HTML diagram**. The coding agent authors **typed JSON (the "IR")**; Archify's renderers turn it into HTML with inline SVG and **validate it before delivery**.

- **Tagline:** "Describe it in plain words. Get a map you can trust."
- **Scope:** software systems — if it has steps, parts, relationships, or states…
- **Agents supported (stated):** Claude Code, Codex, Cursor, OpenCode, GitHub Copilot.
- **Repository:** `github.com/tt-a1i/archify`.
- **Lineage (footer):** "Based on Cocoon-AI/architecture-diagram-generator".
- **Not a product of this type (stated):** not a hosted collaboration service and not a WYSIWYG editor.

## 2. Diagram types

| # | Type | Question | Examples |
| --- | --- | --- | --- |
| 01 | Architecture | What is it made of? | Household accounts, team roles, microservices topology, cloud + security boundaries |
| 02 | Workflow | What happens next? | Visa application, leave plan, onboarding, approval chain, CI/CD, lane by lane |
| 03 | Sequence | Who says what, in what order? | Renting a flat, expense claim, API call chain with returns |
| 04 | Data flow | Where does it all go? | Paycheck to bills/savings, documents through review, data pipeline |
| 05 | Lifecycle | Where does it stand now? | Job applications, an order, passport renewal, a deployment (waits, retries, endings) |

**Full supported list:** Architecture, Workflow, Sequence, Dataflow, Lifecycle, ERD, Class, Tree, Timeline, Waterfall.

## 3. Output ("One file. Everything inside.")

| Feature | Details (stated on page) |
| --- | --- |
| **Dual-theme output** | Coordinated dark/light variable sets. The HTML theme toggle and the SVG `@media prefers-color-scheme` rule switch together. Includes an interactive **light/dark comparison slider**. |
| **One export menu** | PNG, JPEG, WebP, dual-theme SVG, WebM motion, Clipboard. Rendered natively in the browser. |
| **Ultra-crisp 4× export** | Raster formats rendered at up to 4× source resolution, with no upsampling. |
| **Self-contained HTML** | One file, zero dependencies, no server or runtime. Share it by email or PR comment. |
| **Route Journey** | Inspect any stop or play one reader-controlled pass over each incoming relationship ("INSPECT · PLAY · PAUSE"). |

### 4. Design system ("Color that means something.")

**Seven semantic node colours**, consistent in both themes. The legend can **rename** them for the story (e.g. "Backend" reads as "Vacation", "Security" as "Rule").

| Kind | Example node | Meaning |
| --- | --- | --- |
| Frontend | Web App · React SPA | Client apps, browsers, mobile, UI |
| Backend | API Server · Fastify :8080 | Services, APIs, workers, daemons |
| Database | Postgres primary :5432 | DBs, caches, stores, AI/ML |
| Cloud | CloudFront CDN | Managed services, infra |
| Security | Auth Provider · OAuth 2.0 | Auth, secrets, guards |
| Message Bus | Kafka events topic | Kafka, RabbitMQ, SNS |
| External | Users · browser/mobile | Users, 3rd parties, generic |

---

## 4. Core product

Observed on `gallery/artifacts/agent-tool-call.workflow` (workflow) and `gallery/artifacts/orders.erd` (ERD).

### 4.1 Layout

- **Title** (h1) + **visual preset label** (e.g. "SIGNAL FLOW").
- **Diagram** (`img` role with accessible name and description): lanes (e.g. *01 / User Interface*, *02 / Agent Runtime*, *EX / Policy & Recovery*, *04 / Tool Execution & Evidence*), phase columns (*Intake*, *Plan + route*, *Execute + report*), groups (*Planning loop*, *Human or policy stop*, *Evidence path*, *Tool work*), nodes (label + sublabel + optional tag), and labelled edges.
- **Semantic legend** toolbar: buttons per legend label with node counts (e.g. "User UI, 1 node", "Policy, 2 nodes").
- **Side panel** (complementary): authored **cards** (e.g. *Compiler Contract*, *Runtime Semantics*; for the ERD, *Keys*) and a **Node index** grouped by lane with counts. The panel can be moved beside the diagram.

### 4.2 Bottom toolbar ("Diagram view controls")

**ROUTE**, **LENS**, **Find a node**, **Open diagram guide**, **Zoom out**, **zoom level / reset** ("100% · Zoom in again to reveal tags and annotations"), **Zoom in**.
→ **Progressive disclosure by zoom ("reading depth")**: tags and annotations appear at higher zoom. Focusing a node switches to **AUTO** zoom (e.g. "AUTO 148% · Full diagram detail").

### 4.3 Node focus → "Semantic passport"

Activating a node (click/Enter) sets `#focus=<node-id>` and opens a floating **passport**:

- Label, sublabel, semantic kind, full context path (*Lane › Group › Phase*), tag, and **stable ID** (`approval`).
- **Degree:** "2 outgoing · 1 incoming".
- **Authored reach:** "Upstream 4" / "Downstream 6" buttons trace reachability.
- **Outgoing / Incoming lists:** each relationship is a button to jump to the peer.
- **Copy link** to the focused node; **MAP** opens the Semantic Radar; close (×).
- The passport is **draggable** (drag, arrow keys, `Home` resets).
- A live `status` region announces e.g. "Approval Gate. 2 outgoing, 1 incoming. 3 connections."

### 4.6 Route tracing + Route Journey

1. **ROUTE** (`R`) → prompt "Click where the path starts", with **Find start** and **Clear**. "Next, pick the end. Only nodes you can reach will light up."
2. After picking start and end, it shows the path, e.g. **"User to External API · 7 nodes · 6 steps · shortest path"**, with each stop as a button ("Route position 1 of 7: User" …).
3. **Journey controls:** Previous ←, **Journey** (play), Next →, **Overview**. *Journey and Overview were disabled in the reduced-motion capture.*
4. **Copy link to traced route**. URL: `#route=user~external`.

### 4.7 Semantic lens ("Compare system roles")

- Opened from **LENS** (`L`) or by clicking a legend entry.
- "Choose up to two semantic kinds. **One reveals its real traffic; two compare only direct authored relationships.**" Kind buttons show counts (Backend 3, Database 2, Message bus 2, Security 2, Cloud 1, External 1, Frontend 1).
- Result line, e.g. "2 Security nodes · 4 touching relationships · connected peers remain visible"; **Copy link**, **Clear**. URL: `#lens=security`.
- **Legend renaming is real:** clicking the legend entry **"Policy"** opened the lens with **Security** selected (observed).

### 4.8 Find a node

Dialog with a **search box** ("Search labels, responsibilities, kinds, and stable IDs") and a list of every node showing **link count**, kind, stable ID and sublabels (e.g. "Approval Gate · 3 links · Security · approval · scope + consent · block risky ops"). Selecting an entry focuses that node. Also opened with `/`.

### 4.9 Semantic radar (minimap)

`M` or the passport's MAP button opens a **"Semantic radar"** region ("12 nodes · full map"). It is a minimap of all nodes: click a node to focus it, or use the arrow keys to pan the viewport.

### 4.10 Diagram guide dialog ("Explore this system")

`?` or the guide button. Shows "12 semantic nodes · 11 relationships" and shortcut cards: **Find any node**, **Trace a route**, **See the whole system** (radar), **Compare semantic kinds**, **Enter Presentation Stage**. It also shows a key strip (E Export, T Theme, S Style, 0 Reset, +/− Zoom, Esc Close) and a **GitHub star prompt**.

### 4.11 Deep-linkable state (URL)

| Fragment / query | Meaning |
| --- | --- |
| `#focus=<node-id>` | Focused node |
| `#reach=downstream` | Reach tracing direction (used with focus) |
| `#relation=<edge-id>` | Pinned relationship |
| `#route=<from>~<to>` | Traced route |
| `#lens=<kind>` | Active semantic lens |
| `?present=1` | Presentation stage |
| `?embed=1&theme=dark` | Embedded mode with a forced theme |

### 4.12 Accessibility

Every node and edge is `role="button"` with `tabindex="0"`, `aria-pressed` and a descriptive `aria-label`. There are toolbars, menus (`menuitem`/`menuitemradio`) and dialogs with proper roles; live `status` regions; and reduced-motion support. The whole diagram can be operated from the keyboard.

### 4.13 ERD-specific rendering (`orders.erd`)

- Domain groups (*accounts, checkout, line items, catalog*).
- Each table lists **every column with its SQL type** and **PK / FK / UK** markers (e.g. `order PK id bigint FK customer_id bigint status varchar(32) …`).
- Legend: **PK, FK, UK** plus crow's-foot cardinality glyphs **One / Many / Optional**.
- The same toolbars, lens, route, find and export are available.

### 4.14 Self-contained delivery

Loading a standalone artifact requested **only its own HTML document** (plus the hosting site's Cloudflare analytics beacon). There were no scripts, styles, fonts or data from other origins, which is consistent with the "zero runtime dependencies" claim. *Inference: the beacon is injected by the archify.si host, not by Archify's renderer.*

---

## 5. Data model — JSON IR (observed: `gallery/sources/agent-tool-call.workflow.json`)

```text
schema_version: 2
diagram_type:   "workflow"            # architecture | workflow | sequence | dataflow | lifecycle | erd | …
meta:
  title, animation ("trace" | static), visual_preset ("signal-flow" | classic | blueprint | editorial),
  quality_profile ("showcase"), output (rendered HTML path)
  [engineering_profile]               # e.g. "deployment-ownership" (opt-in, per Guide)
lanes[]:    { id, label }
phases[]:   { id, label, fromCol, toCol }
groups[]:   { id, label, lane, fromCol, toCol, variant }
mainPath[]: [node ids]               # the primary/happy path
nodes[]:    { id, lane, col, type (semantic kind), label, sublabel, width, … }
edges[]:    { id, from, to, variant, [label], [via: [[x,y]…]] }
cards[]:    { dot (colour), title, items[] }
```

- Community packages list compatibility with **IR v1 · v2**.
- The rendered HTML carries `data-quality-profile="showcase"` and per-node `data-node-id / -label / -kind / -sublabel / -context` attributes.

---

## 6. Site implementation notes (observed)

- A static site with relative links (`guide`, `gallery`, …). Artifact `.html` URLs redirect (308) to extension-less paths (observed for every gallery embed).
- The Proof Lab loaded only part of its 12 previews during the capture window (in both `theme=light` and `theme=dark` embed variants), which suggests lazy-loaded iframes *(inference)*.
- Embedded artifact iframes use `sandbox` with both `allow-scripts` and `allow-same-origin` (Chrome console warning observed).
- The demo video is an MP4 served from GitHub user-assets (signed, short-lived S3 URL).
- No first-party API calls were observed besides static assets. External calls: the GitHub REST API (star count) and Cloudflare Web Analytics.
