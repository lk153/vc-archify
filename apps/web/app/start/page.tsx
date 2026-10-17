import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/metadata';
import Link from 'next/link';
import { CodeBlock } from '@/components/site/CodeBlock';
import { StartParams } from '@/components/site/StartParams';
import {
  AGENTS, agentInstallCommand, CLI, DEFAULT_AGENT, DEFAULT_TYPE, FEATURED_TYPES, manualInstallCommand, REPO_SLUG,
  SKILL_NAME, STARTER, TYPE_INFO,
} from '@/lib/content';
import { artifactPath, findEntry } from '@/lib/gallery';
import { REPO_URL } from '@/lib/site';
import styles from './start.module.css';

export const metadata: Metadata = pageMetadata({
  title: 'Start',
  description:
    'Install the vc-archify skill for Claude Code, Codex, Cursor, OpenCode or GitHub Copilot, then copy a starter prompt for the diagram type you need.',
  path: '/start',
});

const ROOT_ID = 'start-wizard';

export default function StartPage() {
  return (
    <>
      <section className="container page-intro" aria-labelledby="start-title">
        <p className="eyebrow">Start</p>
        <h1 id="start-title">
          Describe it. <span className="nowrap">vc-archify</span> maps it.
        </h1>
        <p className="lead">
          No repository is required: a plain description in a normal agent chat is enough for a first diagram. Pick your agent
          and the question you want answered, then copy two things: the install command and a starter prompt.
        </p>
      </section>

      <div id={ROOT_ID} className={`container ${styles.wizard}`}>
        {/* Step 1 ---------------------------------------------------- */}
        <section className={styles.step} aria-labelledby="step-install">
          <h2 id="step-install">
            <span className={styles.stepNumber}>1</span> Install the skill
          </h2>
          <fieldset className={styles.picker}>
            <legend>Your coding agent</legend>
            <div className={styles.agentOptions}>
              {AGENTS.map((agent) => (
                <label key={agent.id} className={styles.agentOption}>
                  <input type="radio" name="agent" value={agent.id} defaultChecked={agent.id === DEFAULT_AGENT} />
                  <span>{agent.name}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {AGENTS.map((agent) => (
            <div key={agent.id} className={styles.agentPanel} data-agent={agent.id}>
              <p className={styles.panelLead}>
                <strong>{agent.name}</strong> · the same skill for every agent, no vendor-specific fork. Needs Node.js 18 or newer.
              </p>
              <div className={styles.commands}>
                <CodeBlock code={agentInstallCommand(agent.id, 'global')} label={`Install for ${agent.name} · all projects`} />
                <CodeBlock code={agentInstallCommand(agent.id, 'project')} label="Or this repository only" />
              </div>
              <details className={styles.manual}>
                <summary>Manual install, without npx</summary>
                <p>
                  Copy the <code>skills/{SKILL_NAME}</code> folder from the{' '}
                  <a href={REPO_URL}>{REPO_SLUG}</a> repository into {agent.name}’s skills folder:{' '}
                  <code>{agent.globalDir}</code> for every project, or <code>{agent.projectDir}</code> inside one repository.
                </p>
                <CodeBlock code={manualInstallCommand(agent.globalDir)} label="Terminal" />
              </details>
              <p className={styles.note}>{agent.note}</p>
            </div>
          ))}
        </section>

        {/* Step 2 ---------------------------------------------------- */}
        <section className={styles.step} aria-labelledby="step-ask">
          <h2 id="step-ask">
            <span className={styles.stepNumber}>2</span> Ask one bounded question
          </h2>
          <fieldset className={styles.picker}>
            <legend>What should the diagram explain?</legend>
            <div className={styles.typeOptions}>
              {FEATURED_TYPES.map((type) => (
                <label key={type} className={styles.typeOption}>
                  <input type="radio" name="type" value={type} defaultChecked={type === DEFAULT_TYPE} />
                  <span>
                    <strong>{TYPE_INFO[type].label}</strong>
                    <small>{TYPE_INFO[type].question}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {FEATURED_TYPES.map((type) => {
            const recipe = STARTER[type];
            const sample = findEntry('gallery', TYPE_INFO[type].sample);
            return (
              <div key={type} className={styles.typePanel} data-type={type}>
                <h3>{recipe.title}</h3>
                <p className={styles.question}>{recipe.question}</p>
                <div className={styles.recipe}>
                  <div className={styles.recipeMain}>
                    <CodeBlock code={recipe.descriptionPrompt} label="Starter prompt" language="text" wrap className="prose" />
                    <details className={styles.manual}>
                      <summary>Starting from a repository instead?</summary>
                      <CodeBlock code={recipe.repositoryPrompt} label="Repository prompt" language="text" wrap className="prose" />
                    </details>
                  </div>
                  <aside className={styles.recipeSide} aria-label={`${TYPE_INFO[type].label} checklist`}>
                    <p className={styles.sideTitle}>A good answer includes</p>
                    <ul>
                      {recipe.include.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                    {sample && (
                      <p className={styles.sideLinks}>
                        <a className="text-link" href={artifactPath(sample)}>
                          See an example: {sample.title} ↗
                        </a>
                        <Link prefetch={false} className="text-link" href={`/playground?example=${encodeURIComponent(sample.source)}`}>
                          Try its JSON in the playground
                        </Link>
                      </p>
                    )}
                  </aside>
                </div>
                <CodeBlock code={`${CLI} render ${type} diagram.json diagram.html`} label={`Re-render by hand · ${type}`} />
              </div>
            );
          })}
        </section>

        {/* Step 3 ---------------------------------------------------- */}
        <section className={styles.step} aria-labelledby="step-next">
          <h2 id="step-next">
            <span className={styles.stepNumber}>3</span> What happens next
          </h2>
          <ol className={styles.next}>
            <li>
              <strong>The agent writes typed JSON.</strong> It reads the schema for the chosen type and saves{' '}
              <code>candidate.json</code> in a fresh <code>.vc-archify/&lt;type&gt;-&lt;slug&gt;-&lt;time&gt;/</code> folder, so earlier
              versions stay intact.
            </li>
            <li>
              <strong>It runs the delivery gate.</strong> <code>finalize</code> validates, renders, runs the strict structural checks and
              a real-browser check. If a gate fails, the agent repairs the JSON and runs it again, within a fixed repair limit.
            </li>
            <li>
              <strong>You get one HTML file.</strong> Open it in any browser, explore it, export images, or ask for changes in plain
              words: “move auth to the left”, “add the retry path”.
            </li>
          </ol>
          <p className="muted">
            Want to change something yourself? Edit the JSON and re-render it with the CLI that ships inside the skill.{' '}
            <code>&lt;skill&gt;</code> is the folder it was installed to, for example <code>~/.claude/skills/{SKILL_NAME}</code>.
          </p>
          <CodeBlock
            code={[
              `# Re-render after editing the JSON`,
              `${CLI} render <type> <input.json> <output.html>`,
              ``,
              `# Full gate: validate, render, check and browser-check`,
              `${CLI} finalize <type> <input.json> <output.html> --quality showcase --json`,
            ].join('\n')}
            label="CLI"
          />
          <p className={styles.more}>
            More in the <Link href="/guide#cli">CLI reference</Link>, or skip the install and{' '}
            <Link href="/playground">try the playground</Link>.
          </p>
        </section>

        <StartParams rootId={ROOT_ID} />
      </div>

      <section className="section" aria-labelledby="agents-table">
        <div className="container">
          <h2 id="agents-table">Every agent at a glance</h2>
          <p className="muted">
            The installer takes <code>--agent &lt;id&gt;</code>; a manual install is a plain folder copy.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Agent</th>
                  <th scope="col">Installer id</th>
                  <th scope="col">Global skills folder</th>
                  <th scope="col">Project skills folder</th>
                </tr>
              </thead>
              <tbody>
                {AGENTS.map((agent) => (
                  <tr key={agent.id}>
                    <th scope="row">{agent.name}</th>
                    <td>
                      <code>{agent.id}</code>
                    </td>
                    <td>
                      <code>{agent.globalDir}</code>
                    </td>
                    <td>
                      <code>{agent.projectDir}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}
