import { SearchClient } from "@/app/search/search-client";
import { searchCatalog } from "@/lib/dashboard/search";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export default async function SearchPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const supabase = await createClient();
  const result = await searchCatalog(supabase, q);

  return (
    <SearchClient
      initialQuery={q}
      initialTracks={result.tracks}
      initialArtists={result.artists}
      initialError={result.error}
    />
  );
}
