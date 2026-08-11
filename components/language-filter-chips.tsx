import Link from "next/link";
import { CULTURAL_LANGUAGES } from "@/lib/cultural-options";
import { languageToSlug } from "@/lib/dashboard/languages";

type Chip = { slug: string; name: string };

type Props = {
  /** Active language slug (or empty for All). */
  activeSlug: string | null;
  /** Path without query, e.g. /search */
  basePath: string;
  /** Extra query params to keep (e.g. q). */
  keepParams?: Record<string, string | undefined | null>;
  /** Optional hub list; falls back to cultural catalog. */
  languages?: Chip[];
};

function hrefFor(
  basePath: string,
  keepParams: Record<string, string | undefined | null>,
  languageSlug: string | null,
) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(keepParams)) {
    if (typeof v === "string" && v.trim()) params.set(k, v.trim());
  }
  if (languageSlug) params.set("language", languageSlug);
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function LanguageFilterChips({
  activeSlug,
  basePath,
  keepParams = {},
  languages,
}: Props) {
  const chips: Chip[] =
    languages && languages.length > 0
      ? languages
      : CULTURAL_LANGUAGES.map((name) => ({
          slug: languageToSlug(name),
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
        All languages
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
