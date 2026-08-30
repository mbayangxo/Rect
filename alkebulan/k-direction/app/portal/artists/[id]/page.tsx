import { saveArtist } from "@/lib/portal-actions";
import { getPrisma } from "@/lib/db";
import { notFound } from "next/navigation";

export const metadata = { title: "Edit artist" };

export default async function EditArtistPage({
  params,
}: PageProps<"/portal/artists/[id]">) {
  const { id } = await params;
  const artist =
    id === "new" ? null : await getPrisma().artist.findUnique({ where: { id } });
  if (id !== "new" && !artist) {
    notFound();
  }

  return (
    <div>
      <h1 className="font-display text-5xl tracking-[0.1em] uppercase">
        {artist ? "Edit artist" : "Add artist"}
      </h1>
      <form action={saveArtist} className="mt-8 grid max-w-xl gap-4">
        {artist ? <input type="hidden" name="id" value={artist.id} /> : null}
        <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
          Name
          <input name="name" required defaultValue={artist?.name ?? ""} className="normal-case border border-white/30 bg-transparent px-3 py-2" />
        </label>
        <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
          Display name
          <input name="displayName" defaultValue={artist?.displayName ?? ""} className="normal-case border border-white/30 bg-transparent px-3 py-2" />
        </label>
        <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
          Slug
          <input name="slug" defaultValue={artist?.slug ?? ""} className="normal-case border border-white/30 bg-transparent px-3 py-2" />
        </label>
        <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
          Debut line
          <input name="debut" defaultValue={artist?.debut ?? ""} className="normal-case border border-white/30 bg-transparent px-3 py-2" />
        </label>
        <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
          Bio
          <textarea name="bio" rows={5} defaultValue={artist?.bio ?? ""} className="normal-case border border-white/30 bg-transparent px-3 py-2" />
        </label>
        <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
          Kebu site URL
          <input name="kebuUrl" type="url" defaultValue={artist?.kebuUrl ?? ""} className="normal-case border border-white/30 bg-transparent px-3 py-2" />
        </label>
        <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
          Photo
          <input name="portrait" type="file" accept="image/*" className="normal-case" />
        </label>
        <button className="justify-self-start bg-lime px-6 py-3 font-display text-2xl text-ink uppercase">
          Save
        </button>
      </form>
    </div>
  );
}
