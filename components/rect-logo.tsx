type RectMarkProps = {
  className?: string;
  size?: number;
};

/** Architectural R mark — dark fill for use on green (#1DB954). */
export function RectMark({ className, size = 28 }: RectMarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={Math.round((size * 41) / 34)}
      viewBox="0 0 34 41"
      fill="none"
      aria-hidden
    >
      <rect x="0" y="0" width="7" height="41" fill="#080808" />
      <rect x="7" y="0" width="19" height="7" fill="#080808" />
      <rect x="26" y="0" width="8" height="7" fill="#080808" />
      <rect x="26" y="7" width="8" height="12" fill="#080808" />
      <rect x="7" y="15" width="19" height="7" fill="#080808" />
      <rect x="14" y="22" width="7" height="7" fill="#080808" />
      <rect x="21" y="29" width="8" height="12" fill="#080808" />
    </svg>
  );
}

type RectLogoProps = {
  size?: number;
  showWordmark?: boolean;
};

export function RectLogo({ size = 40, showWordmark = true }: RectLogoProps) {
  const radius = Math.max(8, Math.round(size * 0.22));
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex shrink-0 items-center justify-center bg-[#1DB954]"
        style={{
          width: size,
          height: size,
          borderRadius: radius,
        }}
        aria-label="RECT"
      >
        <RectMark size={Math.round(size * 0.55)} />
      </div>
      {showWordmark ? (
        <span className="text-xl font-bold tracking-[0.2em] text-[#1DB954]">
          RECT
        </span>
      ) : null}
    </div>
  );
}
