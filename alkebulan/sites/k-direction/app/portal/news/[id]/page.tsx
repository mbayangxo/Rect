import { saveNews } from "@/lib/portal-actions";
import { getPrisma } from "@/lib/db";
import { toDatetimeLocal } from "@/lib/catalog";
import { textareaFromBody } from "@/lib/uploads";
import { notFound } from "next/navigation";

export const metadata = { title: "Edit post" };

export default async function EditNewsPage({
  params,
}: PageProps<"/portal/news/[id]">) {
  const { id } = await params;
  const [post, artists] = await Promise.all([
    id === "new" ? Promise.resolve(null) : getPrisma().newsPost.findUnique({ where: { id } }),
    getPrisma().artist.findMany({ orderBy: { displayName: "asc" } }),
  ]);
  if (id !== "new" && !post) {
    notFound();
  }

  return (
    <div>
      <h1 className="font-display text-5xl tracking-[0.1em] uppercase">
        {post ? "Edit post" : "New post"}
      </h1>
      <form action={saveNews} className="mt-8 grid max-w-xl gap-4">
        {post ? <input type="hidden" name="id" value={post.id} /> : null}
        <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
          Title
          <input name="title" required defaultValue={post?.title ?? ""} className="normal-case border border-white/30 bg-transparent px-3 py-2" />
        </label>
        <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
          Slug
          <input name="slug" defaultValue={post?.slug ?? ""} className="normal-case border border-white/30 bg-transparent px-3 py-2" />
        </label>
        <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
          Date
          <input
            name="publishedAt"
            type="datetime-local"
            defaultValue={toDatetimeLocal(post?.publishedAt)}
            className="normal-case border border-white/30 bg-transparent px-3 py-2"
          />
        </label>
        <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
          Artist
          <select name="artistId" defaultValue={post?.artistId ?? ""} className="normal-case border border-white/30 bg-ink px-3 py-2">
            <option value="">None</option>
            {artists.map((artist) => (
              <option key={artist.id} value={artist.id}>
                {artist.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
          Excerpt
          <input name="excerpt" defaultValue={post?.excerpt ?? ""} className="normal-case border border-white/30 bg-transparent px-3 py-2" />
        </label>
        <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
          Body
          <textarea name="body" rows={10} defaultValue={post ? textareaFromBody(post.body) : ""} className="normal-case border border-white/30 bg-transparent px-3 py-2" />
        </label>
        <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
          Cover photo
          <input name="coverImage" type="file" accept="image/*" className="normal-case" />
        </label>
        <label className="flex items-center gap-2 text-sm uppercase tracking-[0.14em]">
          <input name="published" type="checkbox" defaultChecked={post?.published ?? true} />
          Published
        </label>
        <button className="justify-self-start bg-lime px-6 py-3 font-display text-2xl text-ink uppercase">
          Save
        </button>
      </form>
    </div>
  );
}
