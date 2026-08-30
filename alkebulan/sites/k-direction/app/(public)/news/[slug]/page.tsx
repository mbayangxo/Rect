import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageFrame } from "@/components/page-frame";
import { formatDate, getNewsPost, parsePostBody } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/news/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const post = await getNewsPost(slug);
  return { title: post?.title ?? "News" };
}

export default async function NewsPostPage({
  params,
}: PageProps<"/news/[slug]">) {
  const { slug } = await params;
  const post = await getNewsPost(slug);
  if (!post || !post.published) {
    notFound();
  }
  const paragraphs = parsePostBody(post.body);

  return (
    <PageFrame>
      <p className="text-sm uppercase tracking-[0.16em] text-white/60">
        {formatDate(post.publishedAt)} · K-Direction
      </p>
      <h1 className="mt-3 max-w-3xl font-display text-5xl tracking-[0.06em] uppercase sm:text-7xl">
        {post.title}
      </h1>
      {post.coverImage || post.artist ? (
        <figure className="mt-10 max-w-sm border-[8px] border-pink">
          <Image
            src={post.coverImage || post.artist!.portrait}
            alt={post.artist?.portraitAlt || post.title}
            width={800}
            height={1000}
            className="aspect-[4/5] w-full object-cover"
          />
        </figure>
      ) : null}
      <div className="mt-8 max-w-xl space-y-4 text-lg leading-relaxed text-white/90">
        {paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      {post.artist ? (
        <p className="mt-10">
          <Link
            href={`/artists/${post.artist.slug}`}
            className="font-display text-2xl tracking-[0.1em] text-lime uppercase hover:text-pink"
          >
            {post.artist.displayName}
          </Link>
        </p>
      ) : null}
    </PageFrame>
  );
}
