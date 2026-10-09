interface CamLogoProps {
  className?: string;
}

export default function CamLogo({ className }: CamLogoProps) {
  return (
    <svg
      className={['cam-logo-3', className].filter(Boolean).join(' ')}
      viewBox="0 0 42 16"
      fill="none"
      role="img"
      aria-label="CAM"
      focusable="false"
    >
      <path
        d="M12 4 C3 4, 3 14, 12 14 L19 4 L26 14 L26 4 L33 11 L40 4 L40 14"
        stroke="var(--accent, #C97B4A)"
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
