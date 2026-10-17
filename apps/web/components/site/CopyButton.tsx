'use client';

import { useEffect, useRef, useState } from 'react';

async function writeClipboard(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  area.remove();
  if (!ok) throw new Error('copy failed');
}

/** Copies `text`; the result is announced through a polite live region. */
export function CopyButton({ text, label = 'Copy', what }: { text: string; label?: string; what?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await writeClipboard(text);
      setState('copied');
    } catch {
      setState('failed');
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2400);
  };

  return (
    <>
      <button type="button" className="copy-button" onClick={copy} aria-label={what ? `${label} ${what}` : undefined}>
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Select & copy' : label}
      </button>
      <span className="visually-hidden" role="status" aria-live="polite">
        {state === 'copied' ? 'Copied to clipboard.' : state === 'failed' ? 'Copy failed. Select the text manually.' : ''}
      </span>
    </>
  );
}
