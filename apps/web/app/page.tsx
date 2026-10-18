import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/metadata';
import Link from 'next/link';
import { CodeBlock } from '@/components/site/CodeBlock';
import { LiveEmbed } from '@/components/site/LiveEmbed';
import { ThemeCompare } from '@/components/site/ThemeCompare';
import { Thumbnail } from '@/components/site/Thumbnail';
import {
  ENGINE_CHECKS, EXPORT_FORMATS, FEATURED_TYPES, INSTALL_COMMAND, KINDS, TYPE_INFO, viewBoxSize,
} from '@/lib/content';
import { artifactPath, findEntry, gallery, galleryEntries, TYPE_LABELS, type GalleryEntry } from '@/lib/gallery';
import { DESCRIPTION, REPO_URL, SITE_NAME, TAGLINE } from '@/lib/site';
import styles from './home.module.css';

export const metadata: Metadata = {
  ...pageMetadata({ title: 'Validated, interactive diagrams from plain words', description: DESCRIPTION, path: '/' }),
  title: { absolute: `${SITE_NAME} — validated, interactive diagrams from plain words` },
};

const HERO_SLUG = 'agent-tool-call.workflow';
const HERO_HASH = 'focus=planner&reach=downstream';
const LIFE_ORDER = ['leave-plan.workflow', 'renting.sequence', 'monthly-money.dataflow', 'job-search.lifecycle'];

function entry(slug: string): GalleryEntry {
  const found = findEntry('gallery', slug);
  if (!found) throw new Error(`landing: gallery entry ${slug} is missing`);
  return found;
}

const EXPLORE = [
  {
    keys: ['Enter'],
    title: 'Semantic passport',
    body: 'Click a node, or press Enter on it, to see its kind, lane › group › phase, stable ID, degree, and every incoming and outgoing relationship as a jump link. Drag the passport aside or copy a link to it.',
    hash: 'focus=approval',
  },
  {
    keys: [],
    title: 'Authored reach',
    body: 'Upstream and Downstream trace everything a node depends on or feeds, following only the relationships the author wrote down.',
    hash: 'focus=planner&reach=downstream',
  },
  {
    keys: ['R'],
    title: 'Route + journey',
    body: 'Pick a start, then an end; only nodes you can reach light up. The shortest path is listed stop by stop, and Journey plays one pass you control.',
    hash: 'route=user~external',
  },
  {
    keys: ['L'],
    title: 'Semantic lens',
    body: 'Choose up to two kinds. One kind reveals its real traffic; two compare only their direct relationships. Clicking a legend entry opens the same lens.',
    hash: 'lens=security',
  },
  {
    keys: ['M'],
    title: 'Semantic radar',
    body: 'A minimap of every node. Click one to focus it, or pan the viewport with the arrow keys.',
    hash: '',
  },
  {
    keys: ['/'],
    title: 'Find a node',
    body: 'Search labels, responsibilities, kinds and stable IDs, then jump straight to the result.',
    hash: '',
  },
  {
    keys: [],
    title: 'Deep links',
    body: 'Focus, reach, relationship, route and lens all live in the URL. Paste one into a PR and your reviewer lands on the same view.',
    hash: 'relation=approval-denied',
  },
];

const OUTPUT = [
  {
    title: 'Dual-theme output',
    body: 'Coordinated dark and light variable sets. The viewer’s theme toggle and the SVG’s prefers-color-scheme rule switch together.',
    chip: 'dark · light',
  },
  {
    title: 'One export menu',
    body: 'PNG, JPEG, WebP, dual-theme SVG, WebM motion and clipboard copy, all rendered natively in the browser.',
    chip: `${EXPORT_FORMATS.length} formats`,
  },
  {
    title: 'Ultra-crisp 4× export',
    body: 'Raster formats are drawn at up to four times the source resolution, with no upsampling. Sharp on slides and retina screens.',
    chip: 'up to 4×',
  },
  {
    title: 'Self-contained HTML',
    body: 'One file with zero dependencies: no server, no runtime and no network requests. Attach it to an email or a PR comment.',
    chip: '0 requests',
  },
  {
    title: 'Route journey',
    body: 'Inspect any stop on a traced route, or play one reader-controlled pass over each incoming relationship.',
    chip: 'inspect · play · pause',
  },
];

export default function HomePage() {
  const { engine } = gallery();
  const hero = entry(HERO_SLUG);
  const heroSize = viewBoxSize(hero.viewBox);
  const heroHref = artifactPath(hero);
  const compare = entry('web-app.architecture');
  const life = LIFE_ORDER.map((slug) => findEntry('life', slug)).filter((e): e is GalleryEntry => !!e);
  const extraLife = galleryEntries('life').filter((e) => !LIFE_ORDER.includes(e.slug));
  const leavePlan = findEntry('life', 'leave-plan.workflow');

  return (
    <>
      {/* Hero ------------------------------------------------------------ */}
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className="container">
          <div className={styles.heroText}>
          <p className="eyebrow">Agent skill · MIT · engine v{engine.version}</p>
          <h1 id="hero-title">{TAGLINE}</h1>
          <p className="lead">
            Tell your coding agent what you want to explain. It writes typed JSON, {SITE_NAME} validates it, and you get one
            self-contained, interactive HTML diagram to explore, export and share.
          </p>
          <div className={styles.heroInstall}>
            <CodeBlock code={INSTALL_COMMAND} label="Install the skill" />
          </div>
          <ul className="actions">
            <li>
              <Link className="button primary" href="/start">
                Start with your agent
              </Link>
            </li>
            <li>
              <Link className="button" href="/gallery">
                Browse the gallery
              </Link>
            </li>
          </ul>
          <p className={styles.agents}>Works with Claude Code, Codex, Cursor, OpenCode and GitHub Copilot.</p>
          </div>
        </div>

        <div className="container">
          <figure className={styles.heroFigure}>
            <div className={styles.window}>
              <div className={styles.windowBar} aria-hidden="true">
                <span className={styles.windowDots}>
                  <i />
                  <i />
                  <i />
                </span>
                <span className={styles.windowTitle}>{hero.slug}.html</span>
                <span className="chip">{hero.preset}</span>
              </div>
              <LiveEmbed
                href={heroHref}
                hash={HERO_HASH}
                title={`${hero.title}: live interactive diagram, focused on the Agent Planner with its downstream reach`}
                width={heroSize.width}
                height={heroSize.height}
              >
                <Thumbnail
                  entry={hero}
                  priority
                  alt={`${hero.title}: lanes for user interface, agent runtime, policy and recovery, and tool execution, with ${hero.nodeCount} nodes and ${hero.edgeCount} relationships`}
                />
              </LiveEmbed>
            </div>
            <figcaption className={styles.heroCaption}>
              <span>
                <strong>{hero.title}</strong> · {TYPE_LABELS[hero.type]} · {hero.nodeCount} nodes · {hero.edgeCount} relationships · passed{' '}
                {hero.checks} engine checks
              </span>
              <a className="text-link" href={`${heroHref}#${HERO_HASH}`}>
                Open the full viewer ↗
              </a>
            </figcaption>
          </figure>
        </div>
      </section>

      {/* Diagram types --------------------------------------------------- */}
      <section className="section" id="types" aria-labelledby="types-title">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Diagram types</p>
            <h2 id="types-title">Six questions, six kinds of map.</h2>
            <p>Start from the question your reader is asking. Each type has its own typed schema, layout rules and checks.</p>
          </div>
          <ul className={styles.typeGrid}>
            {FEATURED_TYPES.map((type) => {
              const info = TYPE_INFO[type];
              const sample = entry(info.sample);
              const href = artifactPath(sample);
              return (
                <li key={type}>
                  <article className={`card ${styles.typeCard}`} aria-labelledby={`type-${type}`}>
                    <a href={href} className={styles.typeThumb} tabIndex={-1} aria-hidden="true">
                      <Thumbnail entry={sample} alt="" />
                    </a>
                    <div className={styles.typeBody}>
                      <p className={styles.typeNumber}>
                        <span>{info.number}</span>
                        <span>{sample.preset}</span>
                      </p>
                      <h3 id={`type-${type}`}>{info.label}</h3>
                      <p className={styles.question}>{info.question}</p>
                      <p className={styles.typeSummary}>{info.summary}</p>
                      <ul className={styles.examples} aria-label={`${info.label} examples`}>
                        {info.examples.map((example) => (
                          <li key={example}>{example}</li>
                        ))}
                      </ul>
                      <p className={styles.typeLinks}>
                        <a className="text-link" href={href}>
                          Open “{sample.title}”
                        </a>
                        <Link prefetch={false} className="text-link" href={`/start?type=${type}`}>
                          Starter prompt
                        </Link>
                      </p>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
          <p className={styles.footnote}>
            The CLI also renders class, tree, timeline and waterfall diagrams. The site features the six types above.
          </p>
        </div>
      </section>

      {/* Not just for code ----------------------------------------------- */}
      <section className="section" id="beyond-code" aria-labelledby="life-title">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Not just for code</p>
            <h2 id="life-title">If it has steps, parts, relationships or states, it can be a map.</h2>
            <p>
              The same types work for everyday plans. Describe your situation in plain words; the skill asks for missing facts
              instead of inventing dates, amounts or rules. Each example opens in presentation mode.
            </p>
          </div>
          <ul className={styles.lifeGrid}>
            {[...life, ...extraLife].map((item) => (
              <li key={item.slug}>
                <a className={`card ${styles.lifeCard}`} href={`${artifactPath(item)}?present=1`}>
                  <Thumbnail entry={item} alt="" className={styles.lifeThumb} />
                  <span className={styles.lifeBody}>
                    <span className="chip">{TYPE_LABELS[item.type]}</span>
                    <span className={styles.lifeTitle}>{item.title}</span>
                    <span className={styles.lifeCta}>Present it ↗</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Output ---------------------------------------------------------- */}
      <section className="section" id="output" aria-labelledby="output-title">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Output</p>
            <h2 id="output-title">One file. Everything inside.</h2>
            <p>Every diagram is a single HTML file with inline SVG, the viewer and its fonts. Open it in Chrome or any Chromium-based browser, even offline.</p>
          </div>
          <div className={styles.outputLayout}>
            <div className={styles.outputMain}>
              <div className={`card ${styles.compareCard}`}>
                <ThemeCompare slug={compare.slug} title={compare.title} viewBox={compare.viewBox} />
                <p className={styles.compareCaption}>
                  {compare.title}: the same file in both themes. Drag the handle to compare.
                </p>
              </div>
              <ul className={styles.formats} aria-label="Export formats">
                {EXPORT_FORMATS.map((f) => (
                  <li key={f.format}>
                    <strong>{f.format}</strong>
                    <span>{f.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
            <ul className={styles.outputGrid}>
              {OUTPUT.map((item) => (
                <li key={item.title} className={`card feature-card ${styles.outputCard}`}>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                  <span className="chip">{item.chip}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Explore --------------------------------------------------------- */}
      <section className="section" id="explore" aria-labelledby="explore-title">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Viewer</p>
            <h2 id="explore-title">Explore, don’t just look.</h2>
            <p>
              Every artifact ships the same keyboard-friendly viewer. The “Try it” links open the {hero.title} with that exact
              view already applied.
            </p>
          </div>
          <ul className={`card-grid ${styles.exploreGrid}`}>
            {EXPLORE.map((item) => (
              <li key={item.title}>
                <article className={`card feature-card ${styles.exploreCard}`}>
                  <h3>
                    {item.keys.length > 0 && (
                      <span className={styles.keys}>
                        {item.keys.map((k) => (
                          <kbd key={k}>{k}</kbd>
                        ))}
                      </span>
                    )}
                    {item.title}
                  </h3>
                  <p>{item.body}</p>
                  {item.hash && (
                    <p className={styles.tryIt}>
                      <code>#{item.hash}</code>
                      <a className="text-link" href={`${heroHref}#${item.hash}`} aria-label={`Try ${item.title.toLowerCase()} on the ${hero.title}`}>
                        Try it ↗
                      </a>
                    </p>
                  )}
                </article>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Colour ---------------------------------------------------------- */}
      <section className="section" id="colour" aria-labelledby="colour-title">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Design system</p>
            <h2 id="colour-title">Color that means something.</h2>
            <p>
              Seven semantic kinds, each with coordinated dark and light variants. The legend can rename them for the story
              {leavePlan ? <> — in “{leavePlan.title}”, Backend reads as “Time off” and Security as “Rule reminder”</> : null}.
            </p>
          </div>
          <div className="table-wrap">
            <table className={styles.kindTable}>
              <caption className="visually-hidden">Semantic node kinds, an example node and what each kind is for</caption>
              <thead>
                <tr>
                  <th scope="col">Kind</th>
                  <th scope="col">Example node</th>
                  <th scope="col">Meaning</th>
                </tr>
              </thead>
              <tbody>
                {KINDS.map((kind) => (
                  <tr key={kind.id} style={{ ['--kind' as string]: `var(--kind-${kind.id})` }}>
                    <th scope="row">
                      <span className={styles.kindName}>
                        <span className="kind-dot" style={{ background: 'var(--kind)' }} aria-hidden="true" />
                        {kind.label}
                      </span>
                    </th>
                    <td>
                      <span className={styles.nodeChip}>
                        <strong>{kind.example[0]}</strong>
                        <span>{kind.example[1]}</span>
                      </span>
                    </td>
                    <td className="muted">{kind.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* How it works ---------------------------------------------------- */}
      <section className="section" id="how" aria-labelledby="how-title">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">How it works</p>
            <h2 id="how-title">Validated before you ever see it.</h2>
            <p>No hosted service and no editor: the agent you already use does the writing, and the engine refuses anything that does not check out.</p>
          </div>
          <ol className={styles.pipeline}>
            <li>
              <span className={styles.step}>1</span>
              <h3>Your agent writes typed JSON</h3>
              <p>The skill picks the diagram type for the question and gives the agent its exact schema: nodes, relationships, lanes, states or tables.</p>
            </li>
            <li>
              <span className={styles.step}>2</span>
              <h3>The engine validates it</h3>
              <p>Schema and semantic rules run first. Problems come back as precise diagnostics the agent can fix, not as a broken picture.</p>
            </li>
            <li>
              <span className={styles.step}>3</span>
              <h3>It renders one HTML file</h3>
              <p>
                Layout, routing, SVG and viewer go into a single file, which then has to pass {ENGINE_CHECKS.length} structural checks and a
                real-browser check.
              </p>
            </li>
            <li>
              <span className={styles.step}>4</span>
              <h3>You open it and share it</h3>
              <p>Explore it in a Chromium-based browser, export images or attach the file to an email or a PR. Refine it by asking in chat.</p>
            </li>
          </ol>
        </div>
      </section>

      {/* Quickstart ------------------------------------------------------ */}
      <section className="section" id="quickstart" aria-labelledby="quickstart-title">
        <div className="container">
          <div className={`card ${styles.quickstart}`}>
            <div className="section-head">
              <p className="eyebrow">Quickstart</p>
              <h2 id="quickstart-title">Up and running in three steps.</h2>
            </div>
            <ol className={styles.quickSteps}>
              <li>
                <h3>Install the skill</h3>
                <CodeBlock code={INSTALL_COMMAND} label="Terminal" />
                <p className="muted">
                  Or get the exact command for your agent on <Link href="/start">Start</Link>.
                </p>
              </li>
              <li>
                <h3>Describe what you want to explain</h3>
                <p className="muted">In a new chat, describe the system, process or plan in your own words, or ask the agent to read a repository first.</p>
              </li>
              <li>
                <h3>Ask for a vc-archify diagram</h3>
                <p className="muted">The agent writes the JSON, runs the checks and hands you a link to one HTML file. Ask for changes in plain words.</p>
              </li>
            </ol>
            <ul className="actions">
              <li>
                <Link className="button primary" href="/guide">
                  Read the guide
                </Link>
              </li>
              <li>
                <Link className="button" href="/playground">
                  Try the playground
                </Link>
              </li>
              <li>
                <a className="button" href={REPO_URL}>
                  View the source
                </a>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
