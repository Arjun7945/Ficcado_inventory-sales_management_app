'use client';

/**
 * components/LoadingGecko.tsx
 *
 * Ficcado Branded Gecko Loading Component.
 * Faithfully matches the dual-blue lizard logo from the official design system:
 *  - Underneath light-blue silhouette (#B4D1EF): head/snout, top-left arm, tail.
 *  - Top royal-blue silhouette (#2B62C6): stylized "F" body, top-right arm, middle-right leg, bottom-left leg.
 *  - 5-toed pad clusters on each foot.
 *  - Real quadruped walking motion (alternating leg gait + body undulation + tail wave).
 */



interface LoadingGeckoProps {
  size?: 'full' | 'inline';
  label?: string;
}

/**
 * 5-digit Padded Gecko Paw Component.
 * Renders a palm base with 5 fan-like circular toe pads.
 */
function GeckoPaw({ cx, cy, fill, angle = 0, scale = 1 }: { cx: number; cy: number; fill: string; angle?: number; scale?: number }) {
  // 5 toe offsets relative to paw center (fan pattern)
  const toes = [
    { dx: -9, dy: -6, r: 2.4 },
    { dx: -4, dy: -10, r: 2.6 },
    { dx: 2, dy: -11, r: 2.7 },
    { dx: 8, dy: -8, r: 2.5 },
    { dx: 11, dy: -2, r: 2.3 },
  ];

  return (
    <g transform={`translate(${cx}, ${cy}) rotate(${angle}) scale(${scale})`}>
      {/* Palm center */}
      <circle cx="0" cy="0" r="3.8" fill={fill} />
      {/* Toe stems & pads */}
      {toes.map((toe, i) => (
        <g key={i}>
          <line x1="0" y1="0" x2={toe.dx} y2={toe.dy} stroke={fill} strokeWidth="2.2" strokeLinecap="round" />
          <circle cx={toe.dx} cy={toe.dy} r={toe.r} fill={fill} />
        </g>
      ))}
    </g>
  );
}

/**
 * The official Ficcado Gecko Logo rendered as an animated SVG.
 * Separated into moving body segments:
 *  - Base body & head (light blue)
 *  - Front royal blue body ("F" torso)
 *  - 4 limbs (animated with alternating gait keyframes)
 *  - Tail (animated with wave keyframes)
 */
export function GeckoLogoSVG({ width = 120, height = 150, isWalking = true }: { width?: number; height?: number; isWalking?: boolean }) {
  const animClass = isWalking ? 'gecko-walking' : '';

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 160 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={animClass}
    >
      <defs>
        {/* Shadow for soft depth under the body */}
        <filter id="gecko-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="#2B62C6" floodOpacity="0.15" />
        </filter>
      </defs>

      <g filter="url(#gecko-glow)">
        {/* ========================================================================= */}
        {/* 1. UNDERNEATH LIGHT BLUE SILHOUETTE (#B4D1EF)                            */}
        {/* ========================================================================= */}

        {/* Tail (curves gracefully downwards to the right) */}
        <path
          className="gecko-limb-tail"
          d="M75 130 C75 150, 95 165, 90 190 C85 198, 72 175, 78 150 Z"
          fill="#B4D1EF"
        />

        {/* Light Blue Body Base & Head (snout facing top-right) */}
        <path
          className="gecko-spine-light"
          d="M76 115 C60 100, 62 70, 72 50 C80 34, 98 28, 104 38 C108 46, 92 58, 84 72 C80 85, 82 105, 76 115 Z"
          fill="#B4D1EF"
        />

        {/* Top-Left Arm (Light Blue) - Extends up and left */}
        <g className="gecko-limb-tl">
          <path d="M72 56 C60 48, 52 42, 54 30 C56 22, 60 24, 64 34 Z" fill="#B4D1EF" />
          <GeckoPaw cx={54} cy={26} fill="#B4D1EF" angle={-30} scale={1.05} />
        </g>

        {/* Bottom-Left Leg (Light Blue) - Extends down and left */}
        <g className="gecko-limb-bl-light">
          <path d="M76 120 C64 128, 50 138, 48 148 C46 156, 52 152, 62 138 Z" fill="#B4D1EF" />
          <GeckoPaw cx={44} cy={154} fill="#B4D1EF" angle={-110} scale={1.1} />
        </g>

        {/* ========================================================================= */}
        {/* 2. TOP ROYAL BLUE SILHOUETTE (#2B62C6) - THE "F" SHAPE BODY               */}
        {/* ========================================================================= */}

        {/* Royal Blue Central Body / Spine */}
        <path
          className="gecko-spine-royal"
          d="M75 58 C85 64, 88 80, 80 100 C74 116, 78 135, 76 142 C70 148, 65 125, 72 105 C78 90, 74 70, 75 58 Z"
          fill="#2B62C6"
        />

        {/* Top-Right Arm (Royal Blue) - Upper bar of the "F" */}
        <g className="gecko-limb-tr">
          <path d="M82 66 C98 62, 114 65, 122 55 C126 50, 122 46, 110 56 Z" fill="#2B62C6" />
          <GeckoPaw cx={126} cy={52} fill="#2B62C6" angle={45} scale={1.1} />
        </g>

        {/* Middle-Right Leg (Royal Blue) - Lower bar of the "F" */}
        <g className="gecko-limb-mr">
          <path d="M78 98 C94 96, 112 102, 120 94 C124 90, 120 86, 108 94 Z" fill="#2B62C6" />
          <GeckoPaw cx={124} cy={92} fill="#2B62C6" angle={25} scale={1.05} />
        </g>

        {/* Bottom-Left Leg (Royal Blue) - Foot stem of the "F" */}
        <g className="gecko-limb-bl-royal">
          <path d="M76 130 C64 140, 52 152, 50 164 C48 172, 54 168, 62 152 Z" fill="#2B62C6" />
          <GeckoPaw cx={46} cy={168} fill="#2B62C6" angle={-135} scale={1.15} />
        </g>
      </g>
    </svg>
  );
}

export default function LoadingGecko({ size = 'inline', label = 'Loading…' }: LoadingGeckoProps) {
  if (size === 'full') {
    return (
      <div className="gecko-loading-full" role="status">
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.22em',
            color: 'var(--color-brand-primary)',
            textTransform: 'uppercase',
            marginBottom: 16,
          }}
        >
          WWW.FICCADO.STORE
        </div>

        {/* Walking Gecko Container */}
        <div className="gecko-walk-track-full">
          <GeckoLogoSVG width={120} height={150} isWalking={true} />
        </div>

        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13.5,
            color: 'var(--color-ink-muted)',
            marginTop: 20,
            fontWeight: 500,
          }}
          aria-live="polite"
        >
          {label}
        </p>
        <span className="sr-only">{label}</span>
      </div>
    );
  }

  // Inline loader for buttons/panels
  return (
    <span className="gecko-loading-inline" role="status" aria-label={label}>
      <span className="gecko-walk-track-inline">
        <GeckoLogoSVG width={32} height={40} isWalking={true} />
      </span>
      <span style={{ fontSize: 13, color: 'var(--color-ink-muted)', fontFamily: 'var(--font-body)' }} aria-live="polite">
        {label}
      </span>
    </span>
  );
}
