import { ImageResponse } from 'next/og';
import { SITE_NAME, TAGLINE } from '@/lib/site';

// Static social preview, rendered once at build time with next/og's bundled
// font (no external fonts or images). Uses vc-archify's own mark and palette.
export const alt = `${SITE_NAME}: ${TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const KINDS = ['#22d3ee', '#34d399', '#a78bfa', '#fbbf24', '#fb7185', '#fb923c', '#94a3b8'];

function Node({ x, y, color, w = 190 }: { x: number; y: number; color: string; w?: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: 64,
        borderRadius: 14,
        border: `3px solid ${color}`,
        background: '#0b1220',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '0 18px',
        gap: 8,
      }}
    >
      <div style={{ width: w * 0.5, height: 10, borderRadius: 5, background: '#e2e8f0' }} />
      <div style={{ width: w * 0.32, height: 8, borderRadius: 4, background: '#475569' }} />
    </div>
  );
}

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#050912',
          backgroundImage:
            'linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          color: '#f1f5f9',
          padding: 72,
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', width: 640, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
            <svg width="76" height="76" viewBox="0 0 64 64">
              <rect width="64" height="64" rx="14" fill="#0b1220" stroke="#334155" strokeWidth="1.5" />
              <path d="M18 22h14M32 22v20M32 42h14" fill="none" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round" />
              <rect x="9" y="15" width="18" height="14" rx="4" fill="#083344" stroke="#22d3ee" strokeWidth="2.5" />
              <rect x="37" y="35" width="18" height="14" rx="4" fill="#064e3b" stroke="#34d399" strokeWidth="2.5" />
              <circle cx="32" cy="32" r="4" fill="#a78bfa" />
            </svg>
            <div style={{ fontSize: 46, fontWeight: 700, letterSpacing: -1 }}>{SITE_NAME}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div style={{ fontSize: 58, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2 }}>{TAGLINE}</div>
            <div style={{ fontSize: 26, color: '#94a3b8', lineHeight: 1.35 }}>
              An agent skill that turns plain words or code into validated, self-contained interactive HTML diagrams.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {KINDS.map((c) => (
              <div key={c} style={{ width: 44, height: 12, borderRadius: 6, background: c }} />
            ))}
          </div>
        </div>
        <div style={{ position: 'absolute', right: 56, top: 120, width: 420, height: 400, display: 'flex' }}>
          <div style={{ position: 'absolute', left: 95, top: 64, width: 3, height: 120, background: '#34d399' }} />
          <div style={{ position: 'absolute', left: 95, top: 184, width: 150, height: 3, background: '#34d399' }} />
          <div style={{ position: 'absolute', left: 300, top: 214, width: 3, height: 110, background: '#64748b' }} />
          <Node x={0} y={0} color="#22d3ee" />
          <Node x={200} y={152} color="#34d399" w={210} />
          <Node x={20} y={300} color="#fb7185" w={170} />
          <Node x={230} y={320} color="#a78bfa" w={180} />
        </div>
      </div>
    ),
    size,
  );
}
