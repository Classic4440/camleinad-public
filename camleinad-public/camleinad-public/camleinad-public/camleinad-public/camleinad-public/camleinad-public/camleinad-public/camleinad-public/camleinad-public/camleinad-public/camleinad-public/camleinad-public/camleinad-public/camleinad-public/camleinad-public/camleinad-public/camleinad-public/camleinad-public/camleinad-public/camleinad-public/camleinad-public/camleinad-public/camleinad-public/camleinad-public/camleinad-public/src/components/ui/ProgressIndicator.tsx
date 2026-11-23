import React from 'react';

interface ProgressIndicatorProps {
  progress?: number;
  label?: string;
  sublabel?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'bar' | 'circular';
  color?: string;
  showPercent?: boolean;
}

const clamp = (value: number) => Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));

export default function ProgressIndicator({
  progress,
  label,
  sublabel,
  size = 'md',
  variant = 'bar',
  color,
  showPercent = false,
}: ProgressIndicatorProps) {
  const resolvedColor = color || 'var(--accent)';
  const barThickness = size === 'sm' ? 4 : size === 'md' ? 6 : 8;
  const ringSize = size === 'sm' ? 40 : size === 'md' ? 60 : 80;
  const strokeWidth = 3;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const normalized = typeof progress === 'number' ? clamp(progress) : 0;
  const fill = variant === 'circular' ? circumference - (normalized / 100) * circumference : normalized;

  const hasProgress = typeof progress === 'number';

  return (
    <div className="w-full" aria-live="polite">
      {label && (
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ink-muted)]">
          {label}
        </div>
      )}
      {variant === 'bar' ? (
        <div className="flex items-center gap-2">
          <div className="relative h-full w-full overflow-hidden rounded-full" style={{ height: barThickness, background: 'rgba(0,0,0,0.08)' }}>
            <div
              className={hasProgress ? 'progress-fill' : 'progress-indeterminate'}
              style={{
                width: hasProgress ? `${normalized}%` : '100%',
                height: '100%',
                background: resolvedColor,
                borderRadius: 9999,
                transition: 'width 200ms ease-out',
              }}
            />
          </div>
          {showPercent && (
            <span className="min-w-[2.5rem] text-right font-mono text-[10px] text-[var(--ink-muted)]">
              {Math.round(normalized)}%
            </span>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <svg width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`} className="progress-ring" aria-hidden="true">
            <circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              fill="none"
              stroke="rgba(0,0,0,0.1)"
              strokeWidth={strokeWidth}
            />
            <circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              fill="none"
              stroke={resolvedColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={fill}
              transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
              style={{ transition: 'stroke-dashoffset 200ms ease-out' }}
            />
          </svg>
          {showPercent && (
            <span className="font-mono text-[10px] text-[var(--ink-muted)]">{Math.round(normalized)}%</span>
          )}
        </div>
      )}
      {sublabel && <div className="mt-1 text-[10px] text-[var(--ink-muted)]">{sublabel}</div>}
      <style>{`
        .progress-indeterminate {
          position: relative;
          background: linear-gradient(90deg, ${resolvedColor} 0%, rgba(255,255,255,0.45) 50%, ${resolvedColor} 100%);
          background-size: 200% 100%;
          animation: progress-shift 1.2s linear infinite;
          border-radius: 9999px;
        }
        .progress-ring {
          display: block;
          transform-origin: center;
          animation: progress-spin 1.1s linear infinite;
        }
        @keyframes progress-shift {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes progress-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .progress-indeterminate,
          .progress-ring {
            animation: none !important;
          }
          .progress-fill {
            transition: none !important;
          }
        }
      `}</style>
    </div>
  );
}
