import Link from "next/link";
import { type TrackRow } from "@/lib/tracks";

type Props = {
  track: Pick<TrackRow, "title" | "cover_art_url">;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** When set, cover links to this href (usually `/songs/[id]`). */
  href?: string | null;
};

const SIZES = {
  sm: "h-9 w-9 text-[0.55rem]",
  md: "h-11 w-11 text-xs",
  lg: "h-14 w-14 text-sm",
} as const;

/** Cover thumb with monogram fallback when cover_art_url is missing. */
export function TrackCover({
  track,
  size = "sm",
  className = "",
  href = null,
}: Props) {
  const raw = track.title?.trim() || "Untitled";
  const label =
    raw.replace(/\s*[·•|]\s*RECT\s*$/i, "").trim().slice(0, 2).toUpperCase() ||
    "TR";
  const box = SIZES[size];

  const inner = track.cover_art_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={track.cover_art_url}
      alt=""
      className={`${box} shrink-0 rounded-lg object-cover ${className}`}
    />
  ) : (
    <span
      className={`flex ${box} shrink-0 items-center justify-center rounded-lg bg-[#1DB954]/20 font-bold text-[#1DB954] ${className}`}
      aria-hidden
    >
      {label}
    </span>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="shrink-0 transition hover:opacity-90"
        aria-label={`Open ${raw}`}
      >
        {inner}
      </Link>
    );
  }

  return inner;
}
