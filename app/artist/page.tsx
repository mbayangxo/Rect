import Link from "next/link";
import { redirect } from "next/navigation";
import { ArtistProfileForm } from "@/components/artist-profile-form";
import { TrackDeleteButton } from "@/components/track-delete-button";
import { TrackEditButton } from "@/components/track-edit-button";
import { TrackPublishToggle } from "@/components/track-publish-toggle";
import { loadArtistStudioStats } from "@/lib/dashboard/artist-stats";
import { loadArtistFollowers } from "@/lib/dashboard/follows";
import { loadArtistNotifications } from "@/lib/dashboard/notifications";
import { loadArtistTipStats } from "@/lib/dashboard/tips";
import { createClient } from "@/lib/supabase/server";
import { isPublishedTrack, trackTitle } from "@/lib/tracks";

export const dynamic = "force-dynamic";

export default async function ArtistLibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/artist");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("display_name, role, account_type, city, artist_bio")
    .eq("id", user.id)
    .maybeSingle();

  const displayName =
    profile?.display_name ||
    (typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : null) ||
    user.email ||
    "Artist";

  const city =
    (typeof profile?.city === "string" && profile.city) ||
    (typeof user.user_metadata?.city === "string"
      ? user.user_metadata.city
      : "") ||
    "";
  const artistBio =
    (typeof profile?.artist_bio === "string" && profile.artist_bio) ||
    (typeof user.user_metadata?.artist_bio === "string"
      ? user.user_metadata.artist_bio
      : "") ||
    "";

  const [stats, tipStats, followersRes, inboxRes] = await Promise.all([
    loadArtistStudioStats(supabase, user.id),
    loadArtistTipStats(supabase, user.id),
    loadArtistFollowers(supabase, user.id, 30),
    loadArtistNotifications(supabase, user.id, 5),
  ]);
  const {
    tracks,
    totalPlays,
    playsThisMonth,
    uniqueListeners,
    followerCount,
    publishedCount,
    topTracks,
    followsReady,
    error,
  } = stats;

  return (
    <main className="relative bg-[#040d06] text-[#f8f8f8]">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-[#1DB954]/12 blur-[100px]"
      />

      <div className="relative mx-auto w-full max-w-3xl px-5 py-10 sm:px-6">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/dashboard"
            className="text-xs uppercase tracking-[0.2em] text-white/45 hover:text-white"
          >
            ← Hub
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link
              href="/artist/inbox"
              className="text-white/55 hover:text-white"
            >
              Inbox
              {!inboxRes.missingTable && inboxRes.unreadCount > 0
                ? ` (${inboxRes.unreadCount})`
                : ""}
            </Link>
            <Link
              href={`/artists/${user.id}`}
              className="text-white/55 hover:text-white"
            >
              Public portal
            </Link>
            <Link
              href="/artist/upload"
              className="rounded-full bg-[#1DB954] px-4 py-2 font-semibold text-black hover:bg-[#17a349]"
            >
              Upload
            </Link>
          </div>
        </div>

        <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-[#1DB954]">
          Artist studio
        </p>
        <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Your numbers
        </h1>
        <p className="mt-2 text-sm text-white/50">
          {displayName}
          {city ? ` · ${city}` : ""} — live plays, follows, and tips from
          Supabase.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-4">
          <div className="bg-[#071208] px-4 py-4 text-center">
            <p className="font-display text-2xl text-[#1DB954]">{totalPlays}</p>
            <p className="mt-1 text-[0.55rem] uppercase tracking-[0.16em] text-white/40">
              All plays
            </p>
          </div>
          <div className="bg-[#071208] px-4 py-4 text-center">
            <p className="font-display text-2xl text-[#1DB954]">
              {playsThisMonth}
            </p>
            <p className="mt-1 text-[0.55rem] uppercase tracking-[0.16em] text-white/40">
              This month
            </p>
          </div>
          <div className="bg-[#071208] px-4 py-4 text-center">
            <p className="font-display text-2xl text-[#1DB954]">
              {uniqueListeners}
            </p>
            <p className="mt-1 text-[0.55rem] uppercase tracking-[0.16em] text-white/40">
              Listeners
            </p>
          </div>
          <div className="bg-[#071208] px-4 py-4 text-center">
            <p className="font-display text-2xl text-[#1DB954]">
              {followsReady ? followerCount : "—"}
            </p>
            <p className="mt-1 text-[0.55rem] uppercase tracking-[0.16em] text-white/40">
              Followers
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-4">
          <div className="bg-[#071208] px-3 py-3 text-center">
            <p className="text-lg font-semibold text-white">{tracks.length}</p>
            <p className="mt-0.5 text-[0.5rem] uppercase tracking-[0.14em] text-white/35">
              Tracks
            </p>
          </div>
          <div className="bg-[#071208] px-3 py-3 text-center">
            <p className="text-lg font-semibold text-white">{publishedCount}</p>
            <p className="mt-0.5 text-[0.5rem] uppercase tracking-[0.14em] text-white/35">
              Live
            </p>
          </div>
          <div className="bg-[#071208] px-3 py-3 text-center">
            <p className="text-lg font-semibold text-white">
              {tipStats.missingTable
                ? "—"
                : tipStats.totalXof.toLocaleString()}
            </p>
            <p className="mt-0.5 text-[0.5rem] uppercase tracking-[0.14em] text-white/35">
              Tips XOF
            </p>
          </div>
          <div className="bg-[#071208] px-3 py-3 text-center">
            <p className="text-lg font-semibold text-white">
              {tipStats.missingTable
                ? "—"
                : tipStats.thisMonthXof.toLocaleString()}
            </p>
            <p className="mt-0.5 text-[0.5rem] uppercase tracking-[0.14em] text-white/35">
              Tips mo
            </p>
          </div>
        </div>

        {!followsReady ? (
          <p className="mt-3 text-xs text-white/35">
            Run artist follows SQL to unlock follower counts.
          </p>
        ) : null}
        {tipStats.missingTable ? (
          <p className="mt-2 text-xs text-white/35">
            Run artist tips SQL to unlock tip totals.
          </p>
        ) : null}

        {!tipStats.missingTable && tipStats.recent.length > 0 ? (
          <section className="mt-10">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
              Recent tips
            </h2>
            <ul className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]">
              {tipStats.recent.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3 text-sm last:border-b-0"
                >
                  <span className="font-medium text-[#1DB954]">
                    {t.amount_xof.toLocaleString()} XOF
                  </span>
                  <span className="text-xs text-white/40">
                    {t.created_at
                      ? new Date(t.created_at).toLocaleDateString()
                      : "—"}
                    {" · stub"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-white/35">
              {tipStats.tipCount} confirmed tip
              {tipStats.tipCount === 1 ? "" : "s"} all time
            </p>
          </section>
        ) : null}

        {followsReady && !followersRes.missingTable ? (
          <section className="mt-10">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
              Followers
            </h2>
            {followersRes.error ? (
              <p className="text-sm text-[#1DB954]">{followersRes.error}</p>
            ) : followersRes.followers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/15 px-4 py-8 text-center">
                <p className="text-sm text-white/45">No followers yet</p>
                <p className="mt-1 text-xs text-white/30">
                  Share your public portal to grow the roster.
                </p>
              </div>
            ) : (
              <ul className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]">
                {followersRes.followers.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3 text-sm last:border-b-0"
                  >
                    <span className="truncate font-medium">{f.display_name}</span>
                    <span className="shrink-0 text-xs text-white/35">
                      {f.followed_at
                        ? new Date(f.followed_at).toLocaleDateString()
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {topTracks.length > 0 ? (
          <section className="mt-10">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
              Top tracks
            </h2>
            <ol className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]">
              {topTracks.map((t, i) => (
                <li
                  key={t.id}
                  className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3 last:border-b-0"
                >
                  <span className="w-5 shrink-0 text-sm text-white/35">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/songs/${t.id}`}
                      className="block truncate text-sm font-medium hover:underline"
                    >
                      {trackTitle(t)}
                    </Link>
                    <p className="mt-0.5 text-xs text-white/40">
                      {t.play_count} plays
                      {t.plays_this_month > 0
                        ? ` · ${t.plays_this_month} this month`
                        : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <section className="mt-10">
          <ArtistProfileForm
            displayName={String(displayName)}
            city={city}
            artistBio={artistBio}
            publicPortalHref={`/artists/${user.id}`}
          />
        </section>

        <section className="mt-10">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
            Catalog
          </h2>

          {error ? (
            <p className="rounded-xl border border-[#1DB954]/30 bg-[#1DB954]/10 px-4 py-3 text-sm text-[#1DB954]">
              {error}
            </p>
          ) : tracks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/15 px-4 py-10 text-center">
              <p className="text-sm text-white/55">No uploads yet</p>
              <Link
                href="/artist/upload"
                className="mt-3 inline-block text-sm text-[#1DB954] hover:underline"
              >
                Upload your first track →
              </Link>
            </div>
          ) : (
            <ul className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]">
              {tracks.map((t) => (
                <li
                  key={t.id}
                  className="relative flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-4 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/songs/${t.id}`}
                      className="block truncate text-sm font-medium text-white hover:underline"
                    >
                      {trackTitle(t)}
                    </Link>
                    <p className="mt-1 truncate text-xs text-white/40">
                      {t.genre || "no genre"}
                      {" · "}
                      {isPublishedTrack(t) ? "live" : "draft"}
                      {" · "}
                      {t.play_count} plays
                      {t.plays_this_month > 0
                        ? ` · ${t.plays_this_month} mo`
                        : ""}
                    </p>
                  </div>
                  <div className="relative flex shrink-0 items-start gap-2">
                    <TrackEditButton
                      trackId={t.id}
                      title={trackTitle(t)}
                      genre={t.genre}
                      hasCover={Boolean(t.cover_art_url)}
                    />
                    <TrackPublishToggle trackId={t.id} status={t.status} />
                    <TrackDeleteButton
                      trackId={t.id}
                      title={trackTitle(t)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
