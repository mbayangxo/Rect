import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageFrame } from "@/components/page-frame";
import { getArtist, getNewsForArtist, getSettings } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/artists/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const artist = await getArtist(slug);
  return { title: artist?.displayName ?? "Artist" };
}

export default async function ArtistPage({
  params,
}: PageProps<"/artists/[slug]">) {
  const { slug } = await params;
  const artist = await getArtist(slug);
  if (!artist) {
    notFound();
  }

  const [posts, settings] = await Promise.all([
    getNewsForArtist(artist.id),
    getSettings(),
  ]);

  return (
    <PageFrame tone="lime">
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)]">
        <figure className="border-[10px] border-ink bg-ink">
          <Image
            src={artist.portrait}
            alt={artist.portraitAlt}
            width={800}
            height={1000}
            priority
            className="aspect-[4/5] w-full object-cover"
          />
        </figure>
        <div>
          <p className="font-display text-lg tracking-[0.2em] uppercase">
            K-Direction artist
          </p>
          <h1 className="mt-2 font-display text-6xl tracking-[0.08em] uppercase sm:text-8xl">
            {artist.displayName}
          </h1>
          <p className="mt-6 max-w-md text-lg">{artist.debut}</p>
          {artist.bio ? <p className="mt-4 max-w-md whitespace-pre-wrap">{artist.bio}</p> : null}
          {artist.kebuUrl ? (
            <p className="mt-4">
              <a className="font-display text-xl uppercase underline" href={artist.kebuUrl}>
                Artist site on Kebu
              </a>
            </p>
          ) : null}
          {posts.length > 0 ? (
            <ul className="mt-8 grid gap-3">
              {posts.map((post) => (
                <li key={post.slug}>
                  <Link
                    href={`/news/${post.slug}`}
                    className="font-display text-2xl tracking-[0.08em] uppercase underline decoration-ink/40 underline-offset-4 hover:text-white"
                  >
                    {post.title}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-10 text-sm uppercase tracking-[0.16em]">
            Bookings{" "}
            <a className="underline" href={`mailto:${settings.bookingsEmail}`}>
              {settings.bookingsEmail}
            </a>
          </p>
        </div>
      </div>
    </PageFrame>
  );
}
