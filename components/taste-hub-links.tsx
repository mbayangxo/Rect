import Link from "next/link";
import { genreToSlug } from "@/lib/dashboard/genres";
import { languageToSlug } from "@/lib/dashboard/languages";
import { placeToSlug } from "@/lib/dashboard/places";

type Props = {
  genres?: string[];
  countries?: string[];
  languages?: string[];
  className?: string;
};

export function TasteHubLinks({
  genres = [],
  countries = [],
  languages = [],
  className = "",
}: Props) {
  const genreLinks = genres
    .map((name) => {
      const slug = genreToSlug(name);
      return slug ? { name, href: `/genres/${slug}` } : null;
    })
    .filter(Boolean) as { name: string; href: string }[];

  const placeLinks = countries
    .map((name) => {
      const slug = placeToSlug(name);
      return slug ? { name, href: `/places/${slug}` } : null;
    })
    .filter(Boolean) as { name: string; href: string }[];

  const languageLinks = languages
    .map((name) => {
      const slug = languageToSlug(name);
      return slug ? { name, href: `/languages/${slug}` } : null;
    })
    .filter(Boolean) as { name: string; href: string }[];

  if (
    genreLinks.length === 0 &&
    placeLinks.length === 0 &&
    languageLinks.length === 0
  ) {
    return null;
  }

  return (
    <section className={className}>
      <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
        Explore your taste
      </p>
      <p className="mt-2 text-sm text-white/45">
        Jump into hubs matched to what you picked.
      </p>
      {genreLinks.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {genreLinks.map((g) => (
            <Link
              key={g.href}
              href={g.href}
              className="rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-sm text-white/80 hover:border-[#1DB954]/40 hover:text-[#1DB954]"
            >
              {g.name} →
            </Link>
          ))}
        </div>
      ) : null}
      {placeLinks.length > 0 ? (
        <div
          className={`${genreLinks.length > 0 ? "mt-3" : "mt-4"} flex flex-wrap gap-2`}
        >
          {placeLinks.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className="rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-sm text-white/80 hover:border-[#1DB954]/40 hover:text-[#1DB954]"
            >
              {p.name} →
            </Link>
          ))}
        </div>
      ) : null}
      {languageLinks.length > 0 ? (
        <div
          className={`${
            genreLinks.length > 0 || placeLinks.length > 0 ? "mt-3" : "mt-4"
          } flex flex-wrap gap-2`}
        >
          {languageLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-sm text-white/80 hover:border-[#1DB954]/40 hover:text-[#1DB954]"
            >
              {l.name} →
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}
