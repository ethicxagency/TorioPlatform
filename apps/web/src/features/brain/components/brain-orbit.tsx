'use client';

import { useId, useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';

const subscribe = (cb: () => void) => {
  const m = window.matchMedia('(prefers-reduced-motion: reduce)');
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
};
/** True when the person asked for reduced motion. The server render assumes the safe answer (reduced) until the browser says otherwise. */
export const usePrefersReducedMotion = () =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => true,
  );

/** One hemisphere, drawn for the left side; the right is its mirror image. */
const HEMI =
  'M258 112 C236 84 192 86 170 112 C142 118 120 146 126 178 C102 196 100 236 122 256 C114 286 136 322 170 326 C188 350 234 356 258 330 Z';
/** Folds (gyri) on the left hemisphere. */
const FOLDS = [
  'M152 152 C172 140 192 160 178 178',
  'M138 216 C160 202 192 216 202 240',
  'M178 278 C198 264 226 278 234 302',
  'M216 132 C230 152 216 172 234 188',
  'M204 200 C218 208 230 198 244 212',
  'M156 250 C170 244 182 252 186 264',
];
const NODES: { x: number; y: number; to: [number, number]; r: number; d: string }[] = [
  { x: 60, y: 120, to: [150, 170], r: 7, d: '0s' },
  { x: 40, y: 250, to: [128, 236], r: 5, d: '0.8s' },
  { x: 96, y: 372, to: [178, 306], r: 6, d: '1.6s' },
  { x: 500, y: 100, to: [412, 160], r: 6, d: '0.4s' },
  { x: 520, y: 236, to: [430, 232], r: 7, d: '1.2s' },
  { x: 470, y: 372, to: [386, 308], r: 5, d: '2s' },
  { x: 280, y: 28, to: [280, 96], r: 5, d: '1s' },
];

/**
 * The large Brain visual: a layered brain with a soft glow, neural connections and light moving along two orbits. It floats and
 * pulses slowly. With reduced motion it is a still picture (no animation classes, no moving particles). Decorative only.
 */
export function BrainOrbit({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  const still = usePrefersReducedMotion();
  const u = (n: string) => `${n}-${id}`;
  const orbitA = 'M30 230 a250 78 0 1 0 500 0 a250 78 0 1 0 -500 0';
  const orbitB = 'M70 230 a210 60 0 1 0 420 0 a210 60 0 1 0 -420 0';
  return (
    <svg
      viewBox="0 0 560 440"
      role="img"
      aria-label="An illustration of Torio Brain: a glowing brain linked to points of knowledge"
      className={cn('h-auto w-full', className)}
    >
      <defs>
        <radialGradient id={u('halo')} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#7C7DF0" stopOpacity="0.32" />
          <stop offset="60%" stopColor="#B9A8F5" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#B9A8F5" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={u('main')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8F90F4" />
          <stop offset="55%" stopColor="#5B5CE2" />
          <stop offset="100%" stopColor="#7C4DE8" />
        </linearGradient>
        <linearGradient id={u('back')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#D4D2FB" />
          <stop offset="100%" stopColor="#B7A4F3" />
        </linearGradient>
        <linearGradient id={u('hi')} x1="0" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={u('stem')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7C4DE8" />
          <stop offset="100%" stopColor="#5B5CE2" />
        </linearGradient>
        <filter id={u('blur')} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
        <clipPath id={u('clip')}>
          <path d={HEMI} />
          <path d={HEMI} transform="translate(520 0) scale(-1 1)" />
        </clipPath>
      </defs>

      {/* soft glow */}
      <circle cx="280" cy="222" r="200" fill={`url(#${u('halo')})`} />
      <ellipse
        cx="280"
        cy="236"
        rx="120"
        ry="104"
        fill="#7C7DF0"
        opacity="0.28"
        filter={`url(#${u('blur')})`}
        className={still ? undefined : 'brain-glow'}
      />

      {/* orbits and the light that travels them */}
      <g transform="rotate(-16 280 230)" fill="none">
        <path
          d={orbitA}
          stroke="#B9B7F6"
          strokeWidth="1.4"
          strokeDasharray="2 8"
          strokeLinecap="round"
          opacity="0.8"
        />
      </g>
      <g transform="rotate(20 280 230)" fill="none">
        <path
          d={orbitB}
          stroke="#CDBDF7"
          strokeWidth="1.2"
          strokeDasharray="1 9"
          strokeLinecap="round"
          opacity="0.8"
        />
      </g>
      {!still && (
        <>
          <g transform="rotate(-16 280 230)">
            <circle r="5" fill="#7C4DE8">
              <animateMotion dur="22s" repeatCount="indefinite" path={orbitA} />
            </circle>
            <circle r="3" fill="#2B8FD9" opacity="0.85">
              <animateMotion dur="22s" begin="-11s" repeatCount="indefinite" path={orbitA} />
            </circle>
          </g>
          <g transform="rotate(20 280 230)">
            <circle r="4" fill="#5B5CE2">
              <animateMotion
                dur="30s"
                repeatCount="indefinite"
                path={orbitB}
                keyPoints="1;0"
                keyTimes="0;1"
                calcMode="linear"
              />
            </circle>
          </g>
        </>
      )}
      {still && (
        <>
          <circle cx="470" cy="190" r="5" fill="#7C4DE8" />
          <circle cx="92" cy="268" r="3" fill="#2B8FD9" opacity="0.85" />
          <circle cx="150" cy="298" r="4" fill="#5B5CE2" />
        </>
      )}

      {/* neural connections */}
      <g fill="none" stroke="#8F90F4" strokeWidth="1.4" strokeLinecap="round" opacity="0.75">
        {NODES.map((n) => (
          <path
            key={`${n.x}-${n.y}`}
            d={`M${n.x} ${n.y} Q${(n.x + n.to[0]) / 2} ${(n.y + n.to[1]) / 2 - 18} ${n.to[0]} ${n.to[1]}`}
            className={still ? undefined : 'brain-flow'}
            style={still ? { strokeDasharray: '3 6' } : { animationDelay: n.d }}
          />
        ))}
      </g>

      {/* the brain, floating */}
      <g className={still ? undefined : 'brain-float'}>
        <g transform="translate(20 8)">
          {/* depth */}
          <g transform="translate(7 12)" fill={`url(#${u('back')})`} opacity="0.6">
            <path d={HEMI} />
            <path d={HEMI} transform="translate(520 0) scale(-1 1)" />
          </g>
          <path d="M236 330 C240 372 280 372 284 330 Z" fill={`url(#${u('stem')})`} />
          <g fill={`url(#${u('main')})`} stroke="#fff" strokeOpacity="0.4" strokeWidth="1.6">
            <path d={HEMI} />
            <path d={HEMI} transform="translate(520 0) scale(-1 1)" />
          </g>
          <g clipPath={`url(#${u('clip')})`}>
            <rect x="100" y="84" width="320" height="140" fill={`url(#${u('hi')})`} />
          </g>
          <g fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="5" strokeLinecap="round">
            {FOLDS.map((d) => (
              <g key={d}>
                <path d={d} />
                <path d={d} transform="translate(520 0) scale(-1 1)" />
              </g>
            ))}
          </g>
          <path
            d="M260 106 C254 160 266 214 258 332"
            fill="none"
            stroke="#3E3FB8"
            strokeOpacity="0.45"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
      </g>

      {/* nodes of knowledge */}
      {NODES.map((n) => (
        <g key={`n-${n.x}-${n.y}`}>
          <circle cx={n.x} cy={n.y} r={n.r + 7} fill="#7C7DF0" opacity="0.14" />
          <circle
            cx={n.x}
            cy={n.y}
            r={n.r}
            fill="#fff"
            stroke="#5B5CE2"
            strokeWidth="2"
            className={still ? undefined : 'brain-node'}
            style={still ? undefined : { animationDelay: n.d }}
          />
        </g>
      ))}
      <g opacity="0.7">
        <rect
          x="118"
          y="46"
          width="14"
          height="14"
          rx="4"
          fill="#C9C6FA"
          transform="rotate(18 125 53)"
        />
        <rect
          x="430"
          y="52"
          width="10"
          height="10"
          rx="3"
          fill="#BCD7F5"
          transform="rotate(-14 435 57)"
        />
        <rect
          x="500"
          y="318"
          width="12"
          height="12"
          rx="4"
          fill="#D9C8F6"
          transform="rotate(24 506 324)"
        />
        <rect
          x="38"
          y="326"
          width="10"
          height="10"
          rx="3"
          fill="#BCD7F5"
          transform="rotate(-20 43 331)"
        />
      </g>
    </svg>
  );
}
