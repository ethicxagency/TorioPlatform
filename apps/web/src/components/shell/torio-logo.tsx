/* eslint-disable @next/next/no-img-element -- static brand asset, fixed size */
export function TorioLogo({ className }: { className?: string }) {
  return <img src="/torio-logo.png" alt="Torio" width={99} height={40} className={className} />;
}
