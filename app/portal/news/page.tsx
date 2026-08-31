import Link from "next/link";
import { deleteNews } from "@/lib/portal-actions";
import { getPrisma } from "@/lib/db";

export const metadata = { title: "Blog" };

export default async function PortalNewsPage() {
  const posts = await getPrisma().newsPost.findMany({ orderBy: { publishedAt: "desc" } });
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-5xl tracking-[0.1em] uppercase">Blog</h1>
        <Link href="/portal/news/new" className="bg-lime px-4 py-2 font-display text-ink uppercase">
          New post
        </Link>
      </div>
      <ul className="mt-8 grid gap-4">
        {posts.map((post) => (
          <li key={post.id} className="flex flex-wrap items-center justify-between gap-3 border border-white/15 p-4">
            <div>
              <p className="font-display text-2xl uppercase">{post.title}</p>
              <p className="text-sm text-white/60">{post.published ? "Live" : "Draft"}</p>
            </div>
            <div className="flex gap-3">
              <Link href={`/portal/news/${post.id}`} className="text-lime uppercase">
                Edit
              </Link>
              <form action={deleteNews}>
                <input type="hidden" name="id" value={post.id} />
                <button className="uppercase text-pink">Remove</button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
