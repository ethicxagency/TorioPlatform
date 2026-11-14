'use client';

import { useEffect, useId, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * The Torio Brain mark: an abstract, luminous form made of two lobes and a network of connected points. It is meant to read as
 * connected knowledge and reasoning, not as anatomy. Positions are fixed (no randomness), so the server and the browser draw
 * the same thing.
 */
const NODES: [number, number][] = [
  [262, 96],
  [210, 118],
  [160, 150],
  [118, 205],
  [138, 262],
  [186, 318],
  [236, 352],
  [196, 214],
  [236, 190],
  [168, 262],
  [226, 270],
  [250, 160],
  [120, 140],
  [100, 255],
  [316, 96],
  [358, 118],
  [404, 150],
  [444, 205],
  [424, 262],
  [378, 318],
  [324, 352],
  [366, 214],
  [326, 190],
  [394, 262],
  [334, 270],
  [310, 160],
  [440, 140],
  [462, 255],
  [260, 232],
  [262, 300],
];
const EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 6],
  [1, 8],
  [2, 7],
  [7, 8],
  [7, 9],
  [8, 10],
  [9, 10],
  [3, 9],
  [4, 9],
  [10, 28],
  [11, 8],
  [0, 11],
  [2, 12],
  [3, 13],
  [4, 13],
  [5, 9],
  [6, 29],
  [10, 29],
  [0, 14],
  [14, 15],
  [15, 16],
  [16, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [15, 22],
  [16, 21],
  [21, 22],
  [21, 23],
  [22, 24],
  [23, 24],
  [17, 23],
  [18, 23],
  [24, 28],
  [25, 22],
  [14, 25],
  [16, 26],
  [17, 27],
  [18, 27],
  [19, 23],
  [20, 29],
  [24, 29],
  [28, 29],
  [8, 28],
  [22, 28],
];
const PULSES = [3, 11, 17, 24, 30, 38, 44];

const LOBE =
  'M258 78C200 52 124 78 104 142C70 164 66 226 100 258C92 312 142 372 206 372C230 372 252 364 258 350Z';

export function BrainVisual({
  className,
  interactive = true,
  decorative = false,
}: {
  className?: string;
  /** Tilt slightly toward the pointer. */
  interactive?: boolean;
  /** Hide from assistive tech (used when it is background only). */
  decorative?: boolean;
}) {
  const uid = useId().replace(/:/g, '');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || !interactive) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const x = ((e.clientX - (r.left + r.width / 2)) / window.innerWidth) * 2;
        const y = ((e.clientY - (r.top + r.height / 2)) / window.innerHeight) * 2;
        el.style.setProperty('--bx', x.toFixed(3));
        el.style.setProperty('--by', y.toFixed(3));
      });
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => {
      window.removeEventListener('pointermove', move);
      cancelAnimationFrame(raf);
    };
  }, [interactive]);

  const layer = (k: number) => ({
    transform: `translate(calc(var(--bx, 0) * ${k}px), calc(var(--by, 0) * ${k}px))`,
    transition: 'transform 0.25s ease-out',
  });

  return (
    <div
      ref={box}
      className={cn('relative aspect-[520/450] w-full', className)}
      {...(decorative
        ? { 'aria-hidden': true }
        : {
            role: 'img',
            'aria-label': 'Torio Brain: a luminous network of connected business knowledge',
          })}
    >
      <div
        aria-hidden
        className="bl-glow absolute inset-[8%] rounded-full bg-[radial-gradient(closest-side,rgba(124,92,255,0.55),rgba(91,92,226,0.22)_55%,transparent_75%)] blur-2xl"
      />
      <svg
        viewBox="0 0 520 450"
        className="bl-float relative h-full w-full overflow-visible"
        fill="none"
      >
        <defs>
          <radialGradient id={`${uid}-body`} cx="38%" cy="30%" r="85%">
            <stop offset="0" stopColor="#8B7CFF" />
            <stop offset="0.45" stopColor="#5B5CE2" />
            <stop offset="1" stopColor="#241F6B" />
          </radialGradient>
          <radialGradient id={`${uid}-core`} cx="50%" cy="52%" r="45%">
            <stop offset="0" stopColor="#C9C2FF" stopOpacity="0.95" />
            <stop offset="1" stopColor="#7C5CFF" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${uid}-rim`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#E4E0FF" stopOpacity="0.9" />
            <stop offset="0.5" stopColor="#8B7CFF" stopOpacity="0.15" />
            <stop offset="1" stopColor="#B9A8FF" stopOpacity="0.6" />
          </linearGradient>
          <linearGradient id={`${uid}-gloss`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>

        <g style={layer(-4)}>
          <g>
            <path d={LOBE} fill={`url(#${uid}-body)`} />
            <path d={LOBE} stroke={`url(#${uid}-rim)`} strokeWidth="1.6" />
          </g>
          <g transform="translate(520 0) scale(-1 1)">
            <path d={LOBE} fill={`url(#${uid}-body)`} />
            <path d={LOBE} stroke={`url(#${uid}-rim)`} strokeWidth="1.6" />
          </g>
          <path d="M260 80V368" stroke="#1B1650" strokeOpacity="0.45" strokeWidth="2" />
          <ellipse cx="260" cy="236" rx="120" ry="104" fill={`url(#${uid}-core)`} opacity="0.7" />
          <path
            d="M150 118C196 86 248 90 258 108C226 112 176 130 150 168Z"
            fill={`url(#${uid}-gloss)`}
            opacity="0.55"
          />
          <path
            d="M370 118C324 86 272 90 262 108C294 112 344 130 370 168Z"
            fill={`url(#${uid}-gloss)`}
            opacity="0.3"
          />
        </g>

        <g style={layer(6)} stroke="#D9D4FF" strokeLinecap="round">
          {EDGES.map(([a, b], i) => (
            <line
              key={i}
              x1={NODES[a]![0]}
              y1={NODES[a]![1]}
              x2={NODES[b]![0]}
              y2={NODES[b]![1]}
              strokeOpacity="0.32"
              strokeWidth="1"
            />
          ))}
          {PULSES.map((p, i) => {
            const [a, b] = EDGES[p]!;
            return (
              <line
                key={`p${p}`}
                className="bl-flow"
                style={{ animationDelay: `${i * -0.5}s` }}
                x1={NODES[a!]![0]}
                y1={NODES[a!]![1]}
                x2={NODES[b!]![0]}
                y2={NODES[b!]![1]}
                stroke="#fff"
                strokeOpacity="0.95"
                strokeWidth="1.6"
              />
            );
          })}
        </g>
        <g style={layer(10)} fill="#fff">
          {NODES.map(([x, y], i) => (
            <circle
              key={i}
              className={i % 3 === 0 ? 'bl-node' : undefined}
              style={i % 3 === 0 ? { animationDelay: `${(i % 7) * -0.45}s` } : undefined}
              cx={x}
              cy={y}
              r={i % 5 === 0 ? 3.1 : 2.2}
              fillOpacity={i % 5 === 0 ? 1 : 0.8}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
