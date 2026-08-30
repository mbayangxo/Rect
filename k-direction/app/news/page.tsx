import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PageFrame } from "@/components/page-frame";
import { getArtist } from "@/content/artists";
import { news } from "@/content/news";

export const metadata: Metadata = {
  title: "News",
};

export default function NewsPage() {
  return (
    <PageFrame>
      <h1 className="font-display text-6xl tracking-[0.12em] text-pink uppercase sm:text-8xl">
        News
      </h1>
      <ul className="mt-10 grid gap-8">
        {news.map((post) => {
          const artist = getArtist(post.artistSlug);
          return (
            <li key={post.slug}>
              <Link
                href={`/news/${post.slug}`}
                className="grid gap-6 border border-white/15 p-4 outline-offset-4 transition-colors hover:border-pink sm:grid-cols-[8rem_minmax(0,1fr)] sm:p-6"
              >
                {artist ? (
                  <Image
                    src={artist.portrait}
                    alt=""
                    width={160}
                    height={200}
                    className="aspect-[4/5] w-32 object-cover sm:w-full"
                  />
                ) : null}
                <span>
                  <span className="block text-sm uppercase tracking-[0.16em] text-white/60">
                    {post.dateLabel} · 1 min read
                  </span>
                  <span className="mt-2 block font-display text-4xl tracking-[0.06em] uppercase">
                    {post.title}
                  </span>
                  <span className="mt-3 block text-white/80">{post.excerpt}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </PageFrame>
  );
}
