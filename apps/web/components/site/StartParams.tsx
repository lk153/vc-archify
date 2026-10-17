'use client';

import { useEffect } from 'react';

const NAMES = ['agent', 'type'] as const;

/**
 * Progressive enhancement for the Start wizard. The pickers are plain radio
 * inputs and CSS shows the matching panels, so the page works without
 * JavaScript. This component only applies `?agent=&type=` on load and keeps
 * the URL in sync, so a configured page can be shared.
 */
export function StartParams({ rootId }: { rootId: string }) {
  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root) return;
    const radios = (name: string) => Array.from(root.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${name}"]`));

    const params = new URLSearchParams(window.location.search);
    for (const name of NAMES) {
      const value = params.get(name);
      const match = value ? radios(name).find((input) => input.value === value) : undefined;
      if (match) match.checked = true;
    }

    const onChange = (event: Event) => {
      const target = event.target as HTMLInputElement | null;
      if (!target || target.type !== 'radio' || !(NAMES as readonly string[]).includes(target.name)) return;
      const url = new URL(window.location.href);
      for (const name of NAMES) {
        const checked = radios(name).find((input) => input.checked);
        if (checked) url.searchParams.set(name, checked.value);
      }
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    };
    root.addEventListener('change', onChange);
    return () => root.removeEventListener('change', onChange);
  }, [rootId]);

  return null;
}
