import { CopyButton } from './CopyButton';

/**
 * A command or code sample with a copy button. `wrap` (default for shell
 * commands) wraps long lines so nothing scrolls sideways on a phone; JSON
 * excerpts keep their layout and scroll inside the block instead.
 */
export function CodeBlock({
  code,
  label,
  language = 'shell',
  wrap = language === 'shell',
  copy = true,
  className,
}: {
  code: string;
  label?: string;
  language?: 'shell' | 'json' | 'text';
  wrap?: boolean;
  copy?: boolean;
  className?: string;
}) {
  return (
    <figure className={`code-block${wrap ? ' wrap' : ''}${className ? ` ${className}` : ''}`}>
      {(label || copy) && (
        <figcaption className="code-block-bar">
          <span className="code-block-label">{label ?? language}</span>
          {copy && <CopyButton text={code} what={label ? label.toLowerCase() : language === 'shell' ? 'command' : 'code'} />}
        </figcaption>
      )}
      <pre tabIndex={wrap ? undefined : 0}>
        <code>{code}</code>
      </pre>
    </figure>
  );
}
