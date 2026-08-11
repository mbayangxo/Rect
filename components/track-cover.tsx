import { type TrackRow } from "@/lib/tracks";

type Props = {
  track: Pick<TrackRow, "title" | "cover_art_url">;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZES = {
  sm: "h-9 w-9 text-[0.55rem]",
  md: "h-11 w-11 text-xs",
  lg: "h-14 w-14 text-sm",
} as const;

/** Cover thumb with monogram fallback when cover_art_url is missing. */
export function TrackCover({ track, size = "sm", className = "" }: Props) {
  const raw = track.title?.trim() || "Untitled";
  const label = raw.replace(/\s*[·•|]\s*RECT\s*$/i, "").trim().slice(0, 2).toUpperCase() || "TR";
  const box = SIZES[size];

  if (track.cover_art_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={track.cover_art_url}
        alt=""
        className={`${box} shrink-0 rounded-lg object-cover ${className}`}
      />
    );
  }

  return (
    <span
      className={`flex ${box} shrink-0 items-center justify-center rounded-lg bg-[#1DB954]/20 font-bold text-[#1DB954] ${className}`}
      aria-hidden
    >
      {label}
    </span>
  );
}
