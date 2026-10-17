import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/metadata';
import Link from 'next/link';
import { CLI, FEATURED_TYPES, SKILL_NAME, TYPE_INFO } from '@/lib/content';
import { gallery } from '@/lib/gallery';
import { formatVersions, schemaPath, schemaVersions } from '@/lib/schemas';
import { REPO_URL, UPSTREAM_URL } from '@/lib/site';
import styles from './community.module.css';

export const metadata: Metadata = pageMetadata({
  title: 'Community',
  description:
    'vc-archify is a personal open-source project. What IR compatibility means, how to share artifacts, how to report issues or contribute, and where the wider Archify ecosystem lives.',
  path: '/community',
});

export default function CommunityPage() {
  const { engine } = gallery();
  return (
    <div className="container">
      <section className="page-intro" aria-labelledby="community-title">
        <p className="eyebrow">Community</p>
        <h1 id="community-title">A personal project, built in the open.</h1>
        <p className="lead">
          vc-archify is maintained by one person for their own use and shared under the MIT License. There is no company, no support
          contract and no roadmap promise, but issues and pull requests are read and welcome.
        </p>
      </section>

      <div className={styles.grid}>
        <section className={`card ${styles.block} ${styles.wide}`} aria-labelledby="compat-title">
          <h2 id="compat-title">What IR compatibility means</h2>
          <p>
            Every diagram source declares a <code>diagram_type</code> and a <code>schema_version</code>. Compatibility is stated per
            type: a tool that “supports workflow v1 and v2” reads or writes files with those versions. vc-archify keeps the IR of the
            engine it vendors (v{engine.version}) unchanged, so a source written for that engine renders here as well.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Type</th>
                  <th scope="col">Accepted versions</th>
                  <th scope="col">Schema</th>
                </tr>
              </thead>
              <tbody>
                {FEATURED_TYPES.map((type) => (
                  <tr key={type}>
                    <th scope="row">{TYPE_INFO[type].label}</th>
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
          <p className="muted">
            Older workflow files can be upgraded with <code>{SKILL_NAME} migrate workflow old.json new.json --to-schema 2</code>.
          </p>
        </section>

        <section className={`card ${styles.block}`} aria-labelledby="share-title">
          <h2 id="share-title">Sharing an artifact</h2>
          <ul className={styles.list}>
            <li>
              <strong>Send the file.</strong> A diagram is one self-contained HTML file. Attach it to an email, a chat message or a PR;
              the recipient opens it in any browser, offline.
            </li>
            <li>
              <strong>Link to a view.</strong> Focus, route and lens state live in the URL fragment, so <code>diagram.html#route=user~api</code>{' '}
              opens on the same path you were looking at.
            </li>
            <li>
              <strong>Use an export.</strong> A dual-theme SVG follows the reader’s color scheme in a README; PNG or clipboard copies
              suit chats and slides.
            </li>
            <li>
              <strong>Keep the source.</strong> Commit the JSON next to the HTML. Anyone can re-render it with{' '}
              <code>{CLI} render</code>, or open it in the <Link href="/playground">playground</Link>.
            </li>
          </ul>
        </section>

        <section className={`card ${styles.block}`} aria-labelledby="contribute-title">
          <h2 id="contribute-title">Report an issue or contribute</h2>
          <p>Everything happens on GitHub.</p>
          <ul className={styles.list}>
            <li>
              <a href={`${REPO_URL}/issues`}>Open an issue</a> with the IR JSON (or a minimal version of it), the command you ran with{' '}
              <code>--json</code> output, your agent and your OS. Remove anything private first.
            </li>
            <li>
              <a href={`${REPO_URL}/pulls`}>Pull requests</a> are welcome for the site, docs and wrapper code. Engine changes are best
              proposed upstream, since the engine is synced from there.
            </li>
            <li>
              Gallery additions are JSON files under <code>gallery/sources/</code>; the site build renders and checks each one, and fails
              if any check does not pass.
            </li>
          </ul>
          <p>
            <a className="button" href={REPO_URL}>
              View the repository
            </a>
          </p>
        </section>

        <section className={`card ${styles.block} ${styles.wide}`} aria-labelledby="ecosystem-title">
          <h2 id="ecosystem-title">The wider ecosystem</h2>
          <p>
            vc-archify is a fork of <a href={UPSTREAM_URL}>Archify</a>, which has its own community: skill packs for specific domains,
            recipe libraries, locale packs and tools that emit its IR. Those packages target upstream Archify; check the IR versions
            they list before using them here.
          </p>
          <p>
            <a className="text-link" href={`${UPSTREAM_URL}/tree/main/community`}>
              Browse upstream community packages ↗
            </a>
          </p>
          <p className="muted">vc-archify is not affiliated with Archify’s maintainers or with archify.si.</p>
        </section>
      </div>
    </div>
  );
}
