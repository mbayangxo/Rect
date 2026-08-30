import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PageFrame } from "@/components/page-frame";
import { getArtists } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Artist",
};

export default async function ArtistsPage() {
  const artists = await getArtists();

  return (
    <PageFrame tone="lime">
      <h1 className="font-display text-6xl tracking-[0.12em] uppercase sm:text-8xl">
        Artist
      </h1>
      {artists.length === 0 ? (
        <p className="mt-10 max-w-lg text-lg">No artists are listed yet.</p>
      ) : (
        <ul className="mt-10 grid gap-8 sm:max-w-md">
          {artists.map((artist) => (
            <li key={artist.slug}>
              <Link
                href={`/artists/${artist.slug}`}
                className="block border-[10px] border-ink bg-ink text-white shadow-xl outline-offset-4"
              >
                <Image
                  src={artist.portrait}
                  alt={artist.portraitAlt}
                  width={800}
                  height={1000}
                  className="aspect-[4/5] w-full object-cover"
                />
                <span className="block px-4 py-3 text-center font-display text-3xl tracking-[0.16em] text-lime uppercase">
                  {artist.displayName}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageFrame>
  );
}
