/**
 * Logo de COMPETE: una «C» abierta que persigue un punto volt —la ventaja que se busca sobre la competencia—,
 * sobre una tesela tinta noche. El símbolo funciona solo (favicon) o con el logotipo en minúsculas.
 */
export function LogoMark({ size = 28, className = '', tile = '#0b1220' }: { size?: number; className?: string; tile?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill={tile} />
      <path d="M20.6 10.4 A8 8 0 1 0 20.6 21.6" fill="none" stroke="#ffffff" strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="23.4" cy="16" r="2.8" fill="#c8f23c" />
    </svg>
  );
}

export function Logo({ size = 28, tone = 'dark' }: { size?: number; tone?: 'dark' | 'light' }) {
  return (
    <span className="inline-flex items-center gap-2.5" aria-label="COMPETE">
      <LogoMark size={size} tile={tone === 'dark' ? '#1d2840' : '#0b1220'} />
      <span
        className={`font-semibold tracking-[-0.03em] ${tone === 'dark' ? 'text-white' : 'text-ink'}`}
        style={{ fontSize: size * 0.68 }}
      >
        compete
      </span>
    </span>
  );
}
