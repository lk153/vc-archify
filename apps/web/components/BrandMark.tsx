// vc-archify's own mark (not the upstream Archify logo).
export function BrandMark({ size = 28, title }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <rect width="64" height="64" rx="14" fill="#0b1220" />
      <path d="M18 22h14M32 22v20M32 42h14" fill="none" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round" />
      <rect x="9" y="15" width="18" height="14" rx="4" fill="#083344" stroke="#22d3ee" strokeWidth="2.5" />
      <rect x="37" y="35" width="18" height="14" rx="4" fill="#064e3b" stroke="#34d399" strokeWidth="2.5" />
      <circle cx="32" cy="32" r="4" fill="#a78bfa" />
    </svg>
  );
}
