// Site copy and reference data shared by the landing, Start, Gallery and Guide
// pages. English only (Plan D3); keeping it in one module makes a later locale
// additive. Facts describe the vendored engine (skills/vc-archify).

import { REPO_NAME, REPO_OWNER, REPO_URL } from './site';

export const SKILL_NAME = 'vc-archify';
export const REPO_SLUG = `${REPO_OWNER}/${REPO_NAME}`;
export const INSTALL_COMMAND = `npx skills add ${REPO_SLUG} --skill ${SKILL_NAME} -g`;
export const CLI = `node <skill>/bin/${SKILL_NAME}.mjs`;
export const RERENDER_COMMAND = `${CLI} render <type> <input.json> <output.html>`;

export const FEATURED_TYPES = ['architecture', 'workflow', 'sequence', 'dataflow', 'lifecycle', 'erd'] as const;
export type FeaturedType = (typeof FEATURED_TYPES)[number];

/** Engine-only types: available in the CLI, not featured on the site. */
export const CLI_ONLY_TYPES = ['class', 'tree', 'timeline', 'waterfall'] as const;

export const isFeaturedType = (value: string | null | undefined): value is FeaturedType =>
  !!value && (FEATURED_TYPES as readonly string[]).includes(value);

export interface TypeInfo {
  number: string;
  label: string;
  question: string;
  summary: string;
  examples: string[];
  /** Gallery slug used as this type's example artifact. */
  sample: string;
  /** Collections shown in the guide's IR excerpt, in reading order. */
  irKeys: string[];
}

export const TYPE_INFO: Record<FeaturedType, TypeInfo> = {
  architecture: {
    number: '01',
    label: 'Architecture',
    question: 'What is it made of?',
    summary: 'Components, owners and boundaries, and how they connect.',
    examples: ['Household accounts', 'Team roles', 'Microservices topology', 'Cloud + security boundaries'],
    sample: 'web-app.architecture',
    irKeys: ['components', 'connections'],
  },
  workflow: {
    number: '02',
    label: 'Workflow',
    question: 'What happens next?',
    summary: 'Steps lane by lane, with gates, branches and recovery paths.',
    examples: ['Visa application', 'Leave plan', 'Onboarding', 'Approval chain', 'CI/CD'],
    sample: 'agent-tool-call.workflow',
    irKeys: ['lanes', 'nodes', 'edges'],
  },
  sequence: {
    number: '03',
    label: 'Sequence',
    question: 'Who says what, in what order?',
    summary: 'Participants and messages in time order, returns included.',
    examples: ['Renting a flat', 'Expense claim', 'API call chain with returns'],
    sample: 'cache-miss.sequence',
    irKeys: ['participants', 'messages'],
  },
  dataflow: {
    number: '04',
    label: 'Data flow',
    question: 'Where does it all go?',
    summary: 'Sources, transforms, stores and consumers, stage by stage.',
    examples: ['Paycheck to bills and savings', 'Documents through review', 'Data pipeline'],
    sample: 'product-analytics.dataflow',
    irKeys: ['stages', 'nodes', 'flows'],
  },
  lifecycle: {
    number: '05',
    label: 'Lifecycle',
    question: 'Where does it stand now?',
    summary: 'States and the events between them: waits, retries and every ending.',
    examples: ['Job applications', 'An order', 'Passport renewal', 'A deployment'],
    sample: 'deployment-release.lifecycle',
    irKeys: ['states', 'transitions'],
  },
  erd: {
    number: '06',
    label: 'Entity-relationship',
    question: 'What is stored, and how does it relate?',
    summary: 'Tables with every column, PK/FK/UK keys and crow’s-foot cardinality.',
    examples: ['Order schema', 'Accounts and payments', 'Migration planning'],
    sample: 'orders.erd',
    irKeys: ['entities', 'relationships'],
  },
};

// ---------------------------------------------------------------------------
// Start wizard

export interface AgentInfo {
  id: string;
  name: string;
  /** Skill folders the agent scans (global, project). */
  globalDir: string;
  projectDir: string;
  note: string;
}

export const AGENTS: AgentInfo[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    globalDir: '~/.claude/skills',
    projectDir: '.claude/skills',
    note: 'Start a new session after installing so Claude Code loads the skill.',
  },
  {
    id: 'codex',
    name: 'Codex',
    globalDir: '~/.agents/skills',
    projectDir: '.agents/skills',
    note: 'Codex reads skills from the shared .agents folder; restart the CLI after installing.',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    globalDir: '~/.cursor/skills',
    projectDir: '.cursor/skills',
    note: 'Cursor also scans .agents/skills, which is where the installer may place it.',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    globalDir: '~/.config/opencode/skills',
    projectDir: '.opencode/skills',
    note: 'OpenCode also accepts .agents/skills inside a project.',
  },
  {
    id: 'github-copilot',
    name: 'GitHub Copilot',
    globalDir: '~/.copilot/skills',
    projectDir: '.github/skills',
    note: 'Use Copilot’s agent mode; project skills live under .github/skills.',
  },
];

export const DEFAULT_AGENT = AGENTS[0].id;
export const DEFAULT_TYPE: FeaturedType = 'architecture';

export const agentInstallCommand = (agent: string, scope: 'global' | 'project') =>
  `npx -y skills add ${REPO_SLUG} --skill ${SKILL_NAME} --agent ${agent}${scope === 'global' ? ' --global' : ''} --copy --yes`;

export const manualInstallCommand = (dir: string) =>
  [`git clone --depth 1 ${REPO_URL}.git`, `mkdir -p ${dir}`, `cp -R ${REPO_NAME}/skills/${SKILL_NAME} ${dir}/`].join('\n');

export interface StarterRecipe {
  title: string;
  question: string;
  include: string[];
  descriptionPrompt: string;
  repositoryPrompt: string;
}

// Adapted from the upstream Start recipes (MIT), rebranded for vc-archify.
export const STARTER: Record<FeaturedType, StarterRecipe> = {
  architecture: {
    title: 'System overview',
    question: 'What exists, who owns it, and how is it connected?',
    include: ['8–12 core components', 'one primary path', 'external dependencies', 'trust boundaries'],
    descriptionPrompt:
      'Use vc-archify to turn this plain-language system description into a high-level architecture diagram: [describe the users, core components, primary path, external dependencies, and boundaries]. No repository is required. Ask only for missing facts that would materially change the diagram, mark any remaining unknowns instead of inventing them, and keep one obvious primary path across 8–12 core components.',
    repositoryPrompt:
      'Analyze this repository, then use vc-archify to create a high-level architecture diagram. Show 8–12 core runtime components, one primary request or data path, external dependencies, ownership or trust boundaries, and put supporting detail in cards instead of adding more edges.',
  },
  workflow: {
    title: 'Process with owners and gates',
    question: 'Who does what next, where does it wait, and how does it recover?',
    include: ['one lane per owner', 'one unmistakable happy path', 'approval or policy gates', 'exception and retry paths'],
    descriptionPrompt:
      'Use vc-archify workflow mode to turn this description into a diagram: [paste the actors, main steps, decisions, approvals, and exception paths]. Use lanes for distinct owners, keep one unmistakable happy path, and mark missing ownership or unresolved branches instead of inventing them.',
    repositoryPrompt:
      'Inspect this repository for evidence, then use vc-archify workflow mode to explain this process. Separate each owner into its own lane, make the successful path primary, and show approval, retry, blocked, and evidence paths explicitly. Do not invent behavior that the code does not support.',
  },
  sequence: {
    title: 'Request chain',
    question: 'Who calls whom, in what order, and what returns?',
    include: ['callers and callees', 'request and return messages', 'fallback or error path', 'async side effects'],
    descriptionPrompt:
      'Use vc-archify sequence mode to draw this interaction: [paste the participants, calls, returns, fallback, and asynchronous side effects]. Keep message order unambiguous, labels short, and unknown behavior explicit. No repository is required.',
    repositoryPrompt:
      'Inspect this repository for evidence, then use vc-archify sequence mode to show this request from caller to final response. Include authentication, cache hit or miss, persistence fallback, return messages, and asynchronous trace or event emission. Keep message labels short and order unambiguous. Do not invent behavior that the code does not support.',
  },
  dataflow: {
    title: 'Data journey',
    question: 'Where does each piece of data come from, change, and end up?',
    include: ['sources and consumers', 'labelled flows', 'stores and transforms', 'boundaries and ownership'],
    descriptionPrompt:
      'Use vc-archify dataflow mode to map this data journey: [paste the sources, data assets, transforms, stores, boundaries, and consumers]. Label every flow, distinguish streaming from batch where relevant, and mark unknown classifications or ownership instead of inventing them.',
    repositoryPrompt:
      'Inspect this repository for evidence, then use vc-archify dataflow mode to draw how data moves through it. Name sources, transforms, stores, consumers, replay paths and failure paths. Show ownership and delivery semantics only when supported by evidence. Do not invent behavior that the code does not support.',
  },
  lifecycle: {
    title: 'Object lifecycle',
    question: 'Which states exist, what events move between them, and how does it end?',
    include: ['start and active states', 'event-labelled transitions', 'wait and retry states', 'all terminal outcomes'],
    descriptionPrompt:
      'Use vc-archify lifecycle mode to model this object: [paste its states, transition events, waits, retries, cancellation, and terminal outcomes]. Separate active, waiting, recoverable-failure, and terminal states, and never hide an ending. No repository is required.',
    repositoryPrompt:
      'Inspect this repository for evidence, then use vc-archify lifecycle mode to model this object. Separate main progress, waiting or interruption states, and terminal outcomes. Label transitions with events, include retry, cancellation, timeout, success, and failure where real, and never hide an ending. Do not invent behavior that the code does not support.',
  },
  erd: {
    title: 'Database schema',
    question: 'Which tables exist, what columns and keys do they carry, and how do they relate?',
    include: ['tables with their complete column lists', 'primary, foreign and unique keys', 'cardinality at both ends', 'cards for supplementary notes only'],
    descriptionPrompt:
      'Use vc-archify to model this data model as an entity-relationship diagram: [paste the schema DDL, or describe the tables, their key columns, and how they relate]. No repository is required. Include every column the reader needs rather than a summary, mark primary, foreign, and unique keys, and draw each foreign-key relationship with the cardinality and optionality of both ends.',
    repositoryPrompt:
      'Inspect this repository for evidence, then use vc-archify ERD mode to model this schema. Show every physical column inside its table, mark primary, foreign, and unique keys, draw every foreign-key relationship with its cardinality and optionality at both ends, and group related tables into contiguous domain blocks. Do not invent behavior that the code does not support.',
  },
};

// ---------------------------------------------------------------------------
// Design system

export interface KindInfo {
  id: 'frontend' | 'backend' | 'database' | 'cloud' | 'security' | 'messagebus' | 'external';
  label: string;
  example: [string, string];
  meaning: string;
}

export const KINDS: KindInfo[] = [
  { id: 'frontend', label: 'Frontend', example: ['Web App', 'React SPA'], meaning: 'Client apps, browsers, mobile, UI' },
  { id: 'backend', label: 'Backend', example: ['API Server', 'Fastify :8080'], meaning: 'Services, APIs, workers, daemons' },
  { id: 'database', label: 'Database', example: ['Postgres', 'primary :5432'], meaning: 'Databases, caches, stores, AI/ML' },
  { id: 'cloud', label: 'Cloud', example: ['CloudFront', 'CDN'], meaning: 'Managed services, infrastructure' },
  { id: 'security', label: 'Security', example: ['Auth Provider', 'OAuth 2.0'], meaning: 'Auth, secrets, guards' },
  { id: 'messagebus', label: 'Message bus', example: ['Kafka', 'events topic'], meaning: 'Kafka, RabbitMQ, SNS' },
  { id: 'external', label: 'External', example: ['Users', 'browser · mobile'], meaning: 'Users, third parties, generic' },
];

// ---------------------------------------------------------------------------
// Viewer reference

export const SHORTCUTS: { keys: string[]; action: string }[] = [
  { keys: ['R'], action: 'Trace a route between two nodes, then play its journey' },
  { keys: ['L'], action: 'Open the semantic lens (compare one or two kinds)' },
  { keys: ['/'], action: 'Find a node by label, responsibility, kind or stable ID' },
  { keys: ['M'], action: 'Open the semantic radar (minimap)' },
  { keys: ['?'], action: 'Open the diagram guide' },
  { keys: ['E'], action: 'Open the export menu' },
  { keys: ['T'], action: 'Toggle dark / light theme' },
  { keys: ['S'], action: 'Cycle the visual style' },
  { keys: ['F'], action: 'Enter or leave the presentation stage' },
  { keys: ['Enter'], action: 'Focus the selected node and open its passport' },
  { keys: ['0'], action: 'Reset zoom' },
  { keys: ['+', '−'], action: 'Zoom in / out (more zoom reveals tags and annotations)' },
  { keys: ['Esc'], action: 'Close the open panel, menu or dialog' },
];

export interface DeepLink {
  syntax: string;
  meaning: string;
  /** A working example on the agent-tool-call workflow artifact. */
  example: string;
}

export const DEEP_LINKS: DeepLink[] = [
  { syntax: '#focus=<node-id>', meaning: 'Focus a node and open its passport', example: '#focus=approval' },
  { syntax: '#focus=<id>&reach=upstream|downstream', meaning: 'Trace what a node depends on or feeds', example: '#focus=planner&reach=downstream' },
  { syntax: '#relation=<edge-id>', meaning: 'Pin one relationship', example: '#relation=approval-denied' },
  { syntax: '#route=<from>~<to>', meaning: 'Show the traced route between two nodes', example: '#route=user~external' },
  { syntax: '#lens=<kind>', meaning: 'Open the semantic lens on a kind', example: '#lens=security' },
  { syntax: '?present=1', meaning: 'Open in the presentation stage', example: '?present=1' },
  { syntax: '?embed=1&theme=dark|light', meaning: 'Embed without the viewer controls, with a forced theme', example: '?embed=1&theme=light' },
];

export const EXPORT_FORMATS: { format: string; detail: string }[] = [
  { format: 'PNG', detail: 'Transparent background, up to 4× native resolution' },
  { format: 'JPEG', detail: 'Theme background, up to 4×' },
  { format: 'WebP', detail: 'Small files, up to 4×' },
  { format: 'SVG', detail: 'Vector with both themes and a prefers-color-scheme rule' },
  { format: 'WebM', detail: 'Motion recording of the trace, encoded in the browser' },
  { format: 'Clipboard', detail: 'Copy a PNG and paste it into chat, docs or an issue' },
];

export const PRESETS: { id: string; label: string; description: string; sample: string }[] = [
  { id: 'classic', label: 'Classic', description: 'The default. Calm surfaces and rounded nodes for everyday reading.', sample: 'web-app.architecture' },
  { id: 'signal-flow', label: 'Signal flow', description: 'Brighter, flow-forward styling for processes, pipelines and event streams.', sample: 'agent-tool-call.workflow' },
  { id: 'blueprint', label: 'Blueprint', description: 'Square corners and drafting-table colors for infrastructure and deployment maps.', sample: 'production-deployment.architecture' },
];

export const ENGINE_CHECKS = [
  'single SVG',
  'finite geometry',
  'orthogonal arrows',
  'label and route clearance',
  'relationship crossings',
  'relationship corridors',
  'container border runs',
  'route rhythm',
  'legend clearance',
];

export const formatKB = (bytes: number) => `${Math.round(bytes / 1024).toLocaleString('en-US')} KB`;

/** Intrinsic size of a thumbnail from the artifact's viewBox ("x y w h"). */
export function viewBoxSize(viewBox: string | null): { width: number; height: number } {
  const parts = (viewBox ?? '').trim().split(/[\s,]+/).map(Number);
  const [width, height] = parts.length === 4 ? [parts[2], parts[3]] : [1200, 750];
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? { width: Math.round(width), height: Math.round(height) }
    : { width: 1200, height: 750 };
}
