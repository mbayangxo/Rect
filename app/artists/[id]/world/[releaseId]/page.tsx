import Link from "next/link";
import { notFound } from "next/navigation";
import { loadPortalReleaseById } from "@/lib/dashboard/portal-releases";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string; releaseId: string }>;
};

export default async function PortalWorldPage({ params }: Props) {
  const { id: artistId, releaseId } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();
  const db = admin ?? supabase;

  const release = await loadPortalReleaseById(db, releaseId);
  if (!release || release.artistId !== artistId) notFound();
  if (!release.published) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id !== artistId) notFound();
  }

  const { data: artist } = await db
    .from("users")
    .select("display_name, avatar_url")
    .eq("id", artistId)
    .maybeSingle();

  const accent = release.themeColor || "#1DB954";

  return (
    <main
      className="min-h-dvh text-white"
      style={{
        background: `radial-gradient(ellipse at top, ${accent}22 0%, #040d06 55%)`,
      }}
    >
      <div className="mx-auto max-w-2xl px-4 py-10 pb-24">
        <Link
          href={`/artists/${artistId}`}
          className="text-xs text-white/40 hover:text-white"
        >
          ← {artist?.display_name ?? "Artist"} profile
        </Link>

        <p
          className="mt-6 text-[0.65rem] font-medium uppercase tracking-[0.28em]"
          style={{ color: accent }}
        >
          Portal · {release.kind}
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight">
          {release.title}
        </h1>
        {release.description ? (
          <p className="mt-4 text-white/60 leading-relaxed">{release.description}</p>
        ) : null}

        {release.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={release.coverUrl}
            alt=""
            className="mt-8 w-full rounded-2xl object-cover shadow-2xl"
          />
        ) : null}

        {release.portalAudioUrl ? (
          <audio
            controls
            src={release.portalAudioUrl}
            className="mt-6 w-full"
          />
        ) : null}

        {release.media.length > 0 ? (
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {release.media.map((m) =>
              m.kind === "video" ? (
                <video
                  key={m.id}
                  src={m.url}
                  controls
                  className="w-full rounded-xl bg-black/40"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={m.id}
                  src={m.url}
                  alt={m.caption ?? ""}
                  className="w-full rounded-xl object-cover"
                />
              ),
            )}
          </div>
        ) : (
          <p className="mt-10 text-sm text-white/35">
            No photos or videos in this world yet.
          </p>
        )}
      </div>
    </main>
  );
}
