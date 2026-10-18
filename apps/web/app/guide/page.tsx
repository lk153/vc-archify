import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/metadata';
import Link from 'next/link';
import { CodeBlock } from '@/components/site/CodeBlock';
import { Thumbnail } from '@/components/site/Thumbnail';
import {
  AGENTS, CLI, CLI_ONLY_TYPES, DEEP_LINKS, ENGINE_CHECKS, EXPORT_FORMATS, FEATURED_TYPES, INSTALL_COMMAND,
  PRESETS, SHORTCUTS, SKILL_NAME, TYPE_INFO, type FeaturedType,
} from '@/lib/content';
import { artifactPath, findEntry, gallery, sourceText } from '@/lib/gallery';
import { formatVersions, schemaPath, schemaVersions } from '@/lib/schemas';
import { REPO_URL, SITE_URL, UPSTREAM_ORIGIN_URL, UPSTREAM_URL } from '@/lib/site';
import styles from './guide.module.css';

export const metadata: Metadata = pageMetadata({
  title: 'Guide',
  description:
    'Practical vc-archify reference: install, how authoring and validation work, the six diagram types and their IR, CLI commands, viewer controls, presets, accessibility and privacy.',
  path: '/guide',
});

const TOC = [
  { id: 'install', label: 'Install' },
  { id: 'authoring', label: 'How authoring works' },
  { id: 'types', label: 'Diagram types and IR' },
  { id: 'cli', label: 'CLI reference' },
  { id: 'viewer', label: 'Viewer controls' },
  { id: 'presets', label: 'Presets and profiles' },
  { id: 'accessibility', label: 'Accessibility' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'credits', label: 'Credits' },
];

const META_KEYS = ['title', 'visual_preset', 'quality_profile', 'engineering_profile'];

/** Compact, line-per-item rendering of a small IR object. */
function inline(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(inline).join(', ')}]`;
  if (value && typeof value === 'object') {
    const parts = Object.entries(value as Record<string, unknown>).map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`);
    return `{ ${parts.join(', ')} }`;
  }
  return JSON.stringify(value);
}

/** A short, real excerpt of a gallery source: header, meta and the first items. */
function irExcerpt(type: FeaturedType) {
  const entry = findEntry('gallery', TYPE_INFO[type].sample);
  if (!entry) return null;
  const ir = JSON.parse(sourceText(entry.source)) as Record<string, unknown>;
  const meta = Object.fromEntries(
    Object.entries((ir.meta ?? {}) as Record<string, unknown>).filter(([k]) => META_KEYS.includes(k)),
  );
  const lines = ['{', `  "schema_version": ${inline(ir.schema_version)},`, `  "diagram_type": ${inline(ir.diagram_type)},`, `  "meta": ${inline(meta)},`];
  const counts: string[] = [];
  for (const key of TYPE_INFO[type].irKeys) {
    const list = ir[key];
    if (!Array.isArray(list)) continue;
    const shown = list.slice(0, 2);
    lines.push(`  ${JSON.stringify(key)}: [`);
    shown.forEach((item, i) => lines.push(`    ${inline(item)}${i < shown.length - 1 || list.length > shown.length ? ',' : ''}`));
    if (list.length > shown.length) lines.push(`    … ${list.length - shown.length} more`);
    lines.push('  ],');
    counts.push(`${list.length} ${key}`);
  }
  lines.push('  …', '}');
  return { entry, code: lines.join('\n'), counts };
}

const CLI_COMMANDS: { cmd: string; args: string; what: string }[] = [
  { cmd: 'validate', args: '<type> <input.json> [--json] [--quality standard|showcase]', what: 'Validate the IR against its schema and semantic rules. Writes nothing; failures list diagnostics with the fixes they support.' },
  { cmd: 'render', args: '<type> <input.json> [output.html] [--quality …]', what: 'Validate, then write the self-contained HTML file.' },
  { cmd: 'finalize', args: '<type> <input.json> <output.html> [--json] [--out-dir dir] [--repo-root path]', what: 'The delivery gate the skill uses: validate, deliver, strict check and browser-check in one run. It stops at the first failing gate and writes a receipt.' },
  { cmd: 'check', args: '<output.html> [--json] [--require-provenance]', what: `Structural checks on a rendered file: ${ENGINE_CHECKS.join(', ')}.` },
  { cmd: 'browser-check', args: '<output.html> [--json|--summary]', what: 'Opens the file in a real local Chrome and collects automated evidence that it renders and responds. No screenshots.' },
  { cmd: 'guide', args: '"<scenario>" [--json]', what: 'Recommends a diagram type and a starter recipe for a situation you describe.' },
  { cmd: 'examples', args: '', what: 'Lists the example artifacts bundled with the skill.' },
  { cmd: 'doctor', args: '', what: 'Checks Node.js, the template, every renderer, schema and runtime. Run it first if something looks off.' },
];

export default function GuidePage() {
  const { engine } = gallery();
  const tool = findEntry('gallery', 'agent-tool-call.workflow');
  const toolHref = tool ? artifactPath(tool) : '/gallery';

  return (
    <div className={`container ${styles.layout}`}>
      <header className={`page-intro ${styles.intro}`}>
        <p className="eyebrow">Guide</p>
        <h1>Using vc-archify</h1>
        <p className="lead">
          A practical reference for the skill, the CLI and the viewer, engine v{engine.version}. For a guided setup, use{' '}
          <Link href="/start">Start</Link>.
        </p>
      </header>

      <nav className={styles.toc} aria-label="On this page">
        <p className={styles.tocTitle}>On this page</p>
        <ol>
          {TOC.map((item) => (
            <li key={item.id}>
              <a href={`#${item.id}`}>{item.label}</a>
            </li>
          ))}
        </ol>
      </nav>

      <div className={styles.content}>
        {/* Install ----------------------------------------------------- */}
        <section id="install" aria-labelledby="install-title" className={styles.section}>
          <h2 id="install-title">Install</h2>
          <p>
            vc-archify is an agent skill: a folder with <code>SKILL.md</code>, schemas, renderers and a CLI. It needs Node.js 18 or
            newer and nothing else. One command installs it for every supported agent:
          </p>
          <CodeBlock code={INSTALL_COMMAND} label="Terminal" />
          <p>
            For a specific agent, a single repository, or a manual copy of <code>skills/{SKILL_NAME}</code> into the agent’s skills
            folder, see <Link href="/start">Start</Link>. Supported agents: {AGENTS.map((a) => a.name).join(', ')}.
          </p>
          <CodeBlock code={`${CLI} doctor`} label="Check the installation" />
        </section>

        {/* Authoring --------------------------------------------------- */}
        <section id="authoring" aria-labelledby="authoring-title" className={styles.section}>
          <h2 id="authoring-title">How authoring works</h2>
          <p>
            You describe; the agent authors. The diagram itself is never drawn by hand: it is compiled from a typed JSON document
            (the <abbr title="intermediate representation">IR</abbr>) and nothing is delivered until it passes the engine’s gates.
          </p>
          <ol className={styles.flow}>
            <li>
              <strong>Write the IR.</strong> The agent picks the type that answers your question, reads that type’s schema and an
              example, and writes <code>candidate.json</code>: nodes or participants, relationships, lanes, stages, states or tables.
            </li>
            <li>
              <strong>Validate.</strong> Schema rules, semantic rules (unknown IDs, missing endpoints, impossible keys) and the
              quality profile run before layout. Failures come back as structured diagnostics.
            </li>
            <li>
              <strong>Render.</strong> Layout, orthogonal routing, inline SVG, the viewer, fonts and both themes are written into one
              HTML file. The same input always produces byte-identical output.
            </li>
            <li>
              <strong>Finalize and check.</strong> <code>finalize</code> reruns validation, delivers the file, runs the {ENGINE_CHECKS.length}{' '}
              structural checks and a real-browser check, and writes a receipt. A failure sends the agent back to repair the JSON,
              within a fixed number of attempts.
            </li>
          </ol>
          <p>
            Plain-language subjects work the same way. For everyday topics the agent renames legend labels for the reader and asks for
            missing personal facts rather than inventing dates, amounts or rules. Mermaid input is read for meaning and re-authored as
            vc-archify JSON.
          </p>
        </section>

        {/* Types ------------------------------------------------------- */}
        <section id="types" aria-labelledby="types-title" className={styles.section}>
          <h2 id="types-title">Diagram types and IR</h2>
          <p>
            Six types are featured here. Each excerpt is taken from the real gallery source at build time; follow the links for the
            complete file and the published JSON Schema. The CLI also renders {CLI_ONLY_TYPES.join(', ')} diagrams.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Type</th>
                  <th scope="col">Answers</th>
                  <th scope="col">IR versions</th>
                  <th scope="col">Schema</th>
                </tr>
              </thead>
              <tbody>
                {FEATURED_TYPES.map((type) => (
                  <tr key={type}>
                    <th scope="row">
                      <a href={`#type-${type}`}>{TYPE_INFO[type].label}</a>
                    </th>
                    <td>{TYPE_INFO[type].question}</td>
                    <td className="mono">{formatVersions(schemaVersions(type))}</td>
                    <td>
                      <a href={schemaPath(type)}>
                        <code>{type}.schema.json</code>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {FEATURED_TYPES.map((type) => {
            const excerpt = irExcerpt(type);
            if (!excerpt) return null;
            return (
              <article key={type} id={`type-${type}`} className={styles.typeBlock} aria-labelledby={`type-${type}-title`}>
                <h3 id={`type-${type}-title`}>
                  {TYPE_INFO[type].label} <code className={styles.typeId}>{type}</code>
                </h3>
                <p className="muted">
                  {TYPE_INFO[type].summary} Main collections:{' '}
                  {TYPE_INFO[type].irKeys.map((k, i) => (
                    <span key={k}>
                      {i > 0 && ', '}
                      <code>{k}</code>
                    </span>
                  ))}
                  .
                </p>
                <CodeBlock code={excerpt.code} label={`Excerpt · ${excerpt.entry.source}`} language="json" copy={false} />
                <p className={styles.typeLinks}>
                  <span className="muted">{excerpt.counts.join(' · ')}</span>
                  <a href={`/gallery/sources/${excerpt.entry.source}`}>Full source JSON</a>
                  <a href={artifactPath(excerpt.entry)}>Rendered artifact</a>
                  <a href={schemaPath(type)}>Schema</a>
                  <Link prefetch={false} href={`/playground?example=${encodeURIComponent(excerpt.entry.source)}`}>Edit in playground</Link>
                </p>
              </article>
            );
          })}
          <p className="muted">
            Shared definitions live in <a href="/schemas/common.schema.json"><code>common.schema.json</code></a>. Workflow v1 files can
            be upgraded with <code>vc-archify migrate workflow old.json new.json --to-schema 2</code>.
          </p>
        </section>

        {/* CLI --------------------------------------------------------- */}
        <section id="cli" aria-labelledby="cli-title" className={styles.section}>
          <h2 id="cli-title">CLI reference</h2>
          <p>
            The CLI ships inside the skill, so there is nothing else to install. Run it as <code>{CLI} &lt;command&gt;</code>, where{' '}
            <code>&lt;skill&gt;</code> is the installed folder (for example <code>~/.claude/skills/{SKILL_NAME}</code>). Types:{' '}
            {FEATURED_TYPES.join(', ')}, plus {CLI_ONLY_TYPES.join(', ')}.
          </p>
          <div className="table-wrap">
            <table className={styles.cliTable}>
              <thead>
                <tr>
                  <th scope="col">Command</th>
                  <th scope="col">What it does</th>
                </tr>
              </thead>
              <tbody>
                {CLI_COMMANDS.map((c) => (
                  <tr key={c.cmd}>
                    <th scope="row">
                      <code>
                        {SKILL_NAME} {c.cmd}
                      </code>
                      {c.args && <span className={styles.args}>{c.args}</span>}
                    </th>
                    <td>{c.what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">
            Also available: <code>deliver</code>, <code>preview</code> (a loopback-only live preview that re-renders on save),{' '}
            <code>inspect</code>, <code>migrate</code>, <code>compare</code>, <code>visual-check</code>, <code>brands</code> and{' '}
            <code>demo</code>. Run the CLI without arguments for the full usage.
          </p>
          <CodeBlock
            code={[
              `${CLI} validate workflow plan.json --json`,
              `${CLI} render workflow plan.json plan.html`,
              `${CLI} finalize workflow plan.json plan.html --quality showcase --json`,
            ].join('\n')}
            label="Example session"
          />
        </section>

        {/* Viewer ------------------------------------------------------ */}
        <section id="viewer" aria-labelledby="viewer-title" className={styles.section}>
          <h2 id="viewer-title">Viewer controls</h2>
          <p>
            Every artifact carries the same viewer. Try each control on the{' '}
            <a href={toolHref}>{tool?.title ?? 'gallery artifacts'}</a>.
          </p>

          <h3 id="viewer-toolbar">Toolbar and reading depth</h3>
          <ul className={styles.list}>
            <li>
              <strong>Route</strong>, <strong>Lens</strong>, <strong>Find a node</strong> and the <strong>diagram guide</strong> sit in the
              bottom toolbar next to zoom out, the zoom level (click to reset) and zoom in.
            </li>
            <li>
              Zoom is progressive: the diagram opens at a readable 100%, and tags and annotations appear as you zoom in. Focusing a node
              switches to automatic zoom.
            </li>
            <li>
              The legend lists each kind with its node count; clicking an entry opens the lens. The side panel holds authored cards and a
              node index grouped by lane, and can be moved beside the diagram.
            </li>
            <li>
              Live / Still controls motion. Motion is off with <code>prefers-reduced-motion</code> and never appears in exports.
            </li>
          </ul>

          <h3 id="viewer-keys">Keyboard shortcuts</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Key</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {SHORTCUTS.map((s) => (
                  <tr key={s.action}>
                    <th scope="row" className={styles.keyCell}>
                      {s.keys.map((k, i) => (
                        <span key={k}>
                          {i > 0 && ' '}
                          <kbd>{k}</kbd>
                        </span>
                      ))}
                    </th>
                    <td>{s.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 id="viewer-links">Deep links</h3>
          <p>View state lives in the URL, so a link reopens exactly what you saw. Examples open the agent tool-call workflow.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Fragment or query</th>
                  <th scope="col">Meaning</th>
                  <th scope="col">Example</th>
                </tr>
              </thead>
              <tbody>
                {DEEP_LINKS.map((d) => (
                  <tr key={d.syntax}>
                    <th scope="row">
                      <code>{d.syntax}</code>
                    </th>
                    <td>{d.meaning}</td>
                    <td>
                      <a href={`${toolHref}${d.example}`}>
                        <code>{d.example}</code>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 id="viewer-export">Export</h3>
          <p>
            Press <kbd>E</kbd>. Everything is rendered in your browser; viewer state such as focus, lens or route never leaks into a
            canonical export. After a route or reach trace, the menu also offers a share card for it.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Format</th>
                  <th scope="col">Details</th>
                </tr>
              </thead>
              <tbody>
                {EXPORT_FORMATS.map((f) => (
                  <tr key={f.format}>
                    <th scope="row">{f.format}</th>
                    <td>{f.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 id="viewer-modes">Presentation and embed modes</h3>
          <p>
            <code>?present=1</code> (or <kbd>F</kbd>) opens the presentation stage: larger framing and quieter chrome, with the same
            geometry. <code>?embed=1&amp;theme=dark|light</code> drops the viewer chrome and forces a theme, for iframes in docs and
            wikis. Artifacts work in a sandboxed frame without same-origin access:
          </p>
          <CodeBlock
            code={`<iframe src="${SITE_URL}${toolHref}?embed=1&theme=dark"\n  title="${tool?.title ?? 'Diagram'}" width="960" height="600" loading="lazy"\n  sandbox="allow-scripts allow-downloads allow-popups"></iframe>`}
            label="Embed snippet"
            language="text"
          />
        </section>

        {/* Presets ----------------------------------------------------- */}
        <section id="presets" aria-labelledby="presets-title" className={styles.section}>
          <h2 id="presets-title">Presets and profiles</h2>
          <h3>Visual presets</h3>
          <p>
            Presets change the look, never the geometry, and each has coordinated dark and light themes. Leave{' '}
            <code>meta.visual_preset</code> out for classic, and set it only when you want a specific style. Readers can switch with{' '}
            <kbd>S</kbd>.
          </p>
          <ul className={styles.presets}>
            {PRESETS.map((preset) => {
              const sample = findEntry('gallery', preset.sample);
              return (
                <li key={preset.id} className="card">
                  {sample && <Thumbnail entry={sample} alt={`${sample.title} in the ${preset.label.toLowerCase()} preset`} className={styles.presetThumb} />}
                  <div className={styles.presetBody}>
                    <h4>
                      {preset.label} <code>{preset.id}</code>
                    </h4>
                    <p className="muted">{preset.description}</p>
                  </div>
                </li>
              );
            })}
          </ul>

          <h3>Quality profiles</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">
                    <code>meta.quality_profile</code>
                  </th>
                  <th scope="col">Use it for</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">
                    <code>showcase</code>
                  </th>
                  <td>
                    The default the skill asks for. All {ENGINE_CHECKS.length} checks must pass with zero composition errors and zero
                    warnings: route rhythm, label clearance, no stray overlaps.
                  </td>
                </tr>
                <tr>
                  <th scope="row">
                    <code>standard</code>
                  </th>
                  <td>
                    Dense maps, such as a first pass over a large schema. Structural errors still fail; composition warnings are recorded
                    instead of blocking delivery.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3>Engineering profile: deployment-ownership</h3>
          <p>
            <code>meta.engineering_profile: &quot;deployment-ownership&quot;</code> is an opt-in, stricter mode for architecture
            diagrams of a production deployment: who owns each part, where the boundaries are, and how a deploy fails closed. Use it
            only when those facts are known. See{' '}
            {(() => {
              const sample = findEntry('gallery', 'production-deployment.architecture');
              return sample ? <a href={artifactPath(sample)}>{sample.title}</a> : 'the gallery';
            })()}
            .
          </p>
        </section>

        {/* Accessibility ----------------------------------------------- */}
        <section id="accessibility" aria-labelledby="a11y-title" className={styles.section}>
          <h2 id="a11y-title">Accessibility</h2>
          <ul className={styles.list}>
            <li>The diagram is an image with an accessible name and description, generated from the IR.</li>
            <li>
              Every node and relationship is a button with <code>tabindex=&quot;0&quot;</code>, <code>aria-pressed</code> and a
              descriptive label, so the whole diagram can be explored from the keyboard.
            </li>
            <li>Toolbars, menus and dialogs use their proper roles; focus, route and lens changes are announced in live status regions.</li>
            <li>Reduced-motion preferences are respected, and both themes are designed for contrast.</li>
            <li>Narrow screens get a contained, pannable diagram rather than a separate mobile layout.</li>
          </ul>
        </section>

        {/* Privacy ----------------------------------------------------- */}
        <section id="privacy" aria-labelledby="privacy-title" className={styles.section}>
          <h2 id="privacy-title">Privacy</h2>
          <ul className={styles.list}>
            <li>
              <strong>Artifacts make no network requests.</strong> Fonts, styles, scripts and data are inline, and this site serves
              them with a <code>default-src &apos;none&apos;</code> Content Security Policy. Nothing is tracked inside a diagram.
            </li>
            <li>
              <strong>The CLI is offline by default.</strong> The update check inherited from upstream is disabled; opt in with{' '}
              <code>VC_ARCHIFY_UPDATE_CHECK=1</code>. Even then it only reads a release manifest and never installs anything.
            </li>
            <li>
              <strong>No hosted generation.</strong> Your descriptions and code stay between you and your own agent. The{' '}
              <Link href="/playground">playground</Link> renders in your browser.
            </li>
            <li>
              <strong>Supported browsers: Chromium-based only</strong> (Chrome, Edge, Brave, Opera, Arc). The site, the playground and
              the artifacts are built and tested for Chromium; other browsers are not supported.
            </li>
            <li>This site loads no third-party scripts, fonts or CDNs. If the owner turns on Vercel Web Analytics, a cookie-less first-party script from <code>/_vercel/insights</code> runs on site pages, never inside artifacts. Your theme choice is kept in local storage on your device.</li>
          </ul>
        </section>

        {/* Credits ----------------------------------------------------- */}
        <section id="credits" aria-labelledby="credits-title" className={styles.section}>
          <h2 id="credits-title">Credits</h2>
          <p>
            vc-archify is a personal, non-commercial fork. It is inspired by <a href={UPSTREAM_URL}>Archify</a> (tt-a1i/archify, MIT),
            itself based on <a href={UPSTREAM_ORIGIN_URL}>Cocoon-AI/architecture-diagram-generator</a>, and vendors the upstream
            engine at commit <code>{engine.upstreamCommit.slice(0, 7)}</code> with its MIT notice kept. It is not affiliated with
            archify.si. Source, license and notices: <a href={REPO_URL}>{REPO_URL.replace('https://', '')}</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
