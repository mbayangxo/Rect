import Link from "next/link";
import { deleteArtist } from "@/lib/portal-actions";
import { getPrisma } from "@/lib/db";

export const metadata = { title: "Artists" };

export default async function PortalArtistsPage() {
  const artists = await getPrisma().artist.findMany({ orderBy: { displayName: "asc" } });
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-5xl tracking-[0.1em] uppercase">Artists</h1>
        <Link href="/portal/artists/new" className="bg-lime px-4 py-2 font-display text-ink uppercase">
          Add artist
        </Link>
      </div>
      <ul className="mt-8 grid gap-4">
        {artists.map((artist) => (
          <li key={artist.id} className="flex flex-wrap items-center justify-between gap-3 border border-white/15 p-4">
            <div>
              <p className="font-display text-2xl uppercase">{artist.displayName}</p>
              <p className="text-sm text-white/60">/{artist.slug}</p>
            </div>
            <div className="flex gap-3">
              <Link href={`/portal/artists/${artist.id}`} className="text-lime uppercase">
                Edit
              </Link>
              <form action={deleteArtist}>
                <input type="hidden" name="id" value={artist.id} />
                <button className="uppercase text-pink">Remove</button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
