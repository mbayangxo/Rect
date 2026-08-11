import Link from "next/link";
import { CULTURAL_PLACES } from "@/lib/cultural-options";
import { placeToSlug } from "@/lib/dashboard/places";

type Chip = { slug: string; name: string };

type Props = {
  /** Active place slug (or empty for All). */
  activeSlug: string | null;
  /** Path without query, e.g. /search */
  basePath: string;
  /** Extra query params to keep (e.g. q, genre, language). */
  keepParams?: Record<string, string | undefined | null>;
  /** Optional hub list; falls back to cultural catalog. */
  places?: Chip[];
};

function hrefFor(
  basePath: string,
  keepParams: Record<string, string | undefined | null>,
  placeSlug: string | null,
) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(keepParams)) {
    if (typeof v === "string" && v.trim()) params.set(k, v.trim());
  }
  if (placeSlug) params.set("place", placeSlug);
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function PlaceFilterChips({
  activeSlug,
  basePath,
  keepParams = {},
  places,
}: Props) {
  const chips: Chip[] =
    places && places.length > 0
      ? places
      : CULTURAL_PLACES.map((name) => ({
          slug: placeToSlug(name),
          name,
        }));

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      <Link
        href={hrefFor(basePath, keepParams, null)}
        className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${
          !activeSlug
            ? "border-[#1DB954]/50 bg-[#1DB954]/15 text-[#1DB954]"
            : "border-white/10 text-white/50 hover:border-white/25 hover:text-white/80"
        }`}
      >
        All places
      </Link>
      {chips.map((c) => {
        const on = activeSlug === c.slug;
        return (
          <Link
            key={c.slug}
            href={hrefFor(basePath, keepParams, c.slug)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${
              on
                ? "border-[#1DB954]/50 bg-[#1DB954]/15 text-[#1DB954]"
                : "border-white/10 text-white/50 hover:border-white/25 hover:text-white/80"
            }`}
          >
            {c.name}
          </Link>
        );
      })}
    </div>
  );
}
