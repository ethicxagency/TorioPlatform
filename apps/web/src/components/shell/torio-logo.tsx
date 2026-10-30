/** Placeholder wordmark. Replace with the official asset in /public when available. */
export function TorioLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 40" className={className} role="img" aria-label="Torio" height={40}>
      <rect x="2" y="6" width="28" height="28" rx="8" fill="#5B5CE2" />
      <path d="M10 14h12M16 14v13" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <text
        x="38"
        y="28"
        fontFamily="Inter Variable, Inter, system-ui, sans-serif"
        fontSize="22"
        fontWeight="700"
        letterSpacing="-0.5"
        fill="#17181C"
      >
        Torio
      </text>
    </svg>
  );
}
