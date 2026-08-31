import Link from "next/link";
import { notFound } from "next/navigation";
import { ArtistFollowButton } from "@/components/artist-follow-button";
import { ArtistMerchGrid } from "@/components/artist-merch-grid";
import { ArtistTipButton } from "@/components/artist-tip-button";
import { PeopleBlockButton } from "@/components/people-block-button";
import { PeopleSharedTracks } from "@/components/people-shared-tracks";
import { RectLogo } from "@/components/rect-logo";
import { TrackList } from "@/components/track-list";
import { loadIsBlocked, loadUsersAreBlocked } from "@/lib/dashboard/blocks";
import { loadArtistMerchItems } from "@/lib/dashboard/artist-merch";
import {
  loadFollowerCount,
  loadIsFollowing,
} from "@/lib/dashboard/follows";
import { loadLikedAmongTrackIds } from "@/lib/dashboard/likes";
import {
  formatPlayedAt,
  loadSharedListeningActivity,
} from "@/lib/dashboard/listening-journal";
import { loadPublicPlaylistsByOwner } from "@/lib/dashboard/playlists";
import {
  artistCreditName,
  isProfilePublic,
  PRIVATE_ARTIST_LABEL,
} from "@/lib/dashboard/privacy";
import { tipsTableReady } from "@/lib/dashboard/tips";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isDemoTrack, isPublishedTrack, withLiveCatalogTracks, type TrackRow } from "@/lib/tracks";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ArtistPortalPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();
  const db = admin ?? supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  type ArtistProfile = {
    id: string;
    display_name: string | null;
    genres?: unknown;
    countries?: unknown;
    avatar_url?: string | null;
    account_type?: string | null;
    role?: string | null;
    city?: string | null;
    artist_bio?: string | null;
    privacy_public_profile?: boolean | null;
  };

  const fullArtist = await db
    .from("users")
    .select(
      "id, display_name, genres, countries, avatar_url, account_type, role, created_at, city, artist_bio, privacy_public_profile",
    )
    .eq("id", id)
    .maybeSingle();

  let artist: ArtistProfile | null = null;
  if (
    fullArtist.error &&
    /privacy_public_profile|city|artist_bio|countries|avatar_url|column .* does not exist/i.test(
      fullArtist.error.message,
    )
  ) {
    const lean = await db
      .from("users")
      .select(
        "id, display_name, genres, countries, account_type, role, created_at, city, artist_bio, privacy_public_profile",
      )
      .eq("id", id)
      .maybeSingle();
    if (
      lean.error &&
      /privacy_public_profile|city|artist_bio|countries|column .* does not exist/i.test(
        lean.error.message,
      )
    ) {
      const bare = await db
        .from("users")
        .select("id, display_name, genres, account_type, role, created_at")
        .eq("id", id)
        .maybeSingle();
      if (bare.error || !bare.data) notFound();
      artist = bare.data as ArtistProfile;
    } else if (lean.error || !lean.data) {
      notFound();
    } else {
      artist = lean.data as ArtistProfile;
    }
  } else if (fullArtist.error || !fullArtist.data) {
    notFound();
  } else {
    artist = fullArtist.data as ArtistProfile;
  }

  const isArtist =
    artist.account_type === "artist" || artist.role === "artist";
  if (!isArtist) {
    notFound();
  }

  const isOwner = user?.id === id;
  const publicOk = isProfilePublic({
    privacy_public_profile: artist.privacy_public_profile ?? true,
  });

  if (!publicOk && !isOwner) {
    return (
      <main className="min-h-dvh bg-[#040d06] text-[#f8f8f8]">
        <header className="border-b border-white/10">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
            <Link href="/dashboard">
              <RectLogo size={34} showWordmark />
            </Link>
          </div>
        </header>
        <div className="mx-auto max-w-lg px-5 py-20 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
            Artist portal
          </p>
          <h1 className="mt-3 font-[family-name:var(--font-syne)] text-3xl font-semibold">
            {PRIVATE_ARTIST_LABEL}
          </h1>
          <p className="mt-3 text-sm text-white/45">
            This artist keeps their profile private.
          </p>
          <Link
            href="/search"
            className="mt-8 inline-block text-sm text-[#1DB954] hover:underline"
          >
            Back to Search
          </Link>
        </div>
      </main>
    );
  }

  const [blockMutual, blockOutgoing] = await Promise.all([
    user && !isOwner
      ? loadUsersAreBlocked(supabase, user.id, id)
      : Promise.resolve({ blocked: false, missingTable: false }),
    user && !isOwner
      ? loadIsBlocked(supabase, user.id, id)
      : Promise.resolve({ blocked: false, missingTable: false }),
  ]);

  if (blockMutual.blocked && !isOwner) {
    const lockedName =
      typeof artist.display_name === "string" && artist.display_name.trim()
        ? artist.display_name.trim()
        : "Artist";
    return (
      <main className="min-h-dvh bg-[#040d06] text-[#f8f8f8]">
        <header className="border-b border-white/10">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
            <Link href="/dashboard">
              <RectLogo size={34} showWordmark />
            </Link>
          </div>
        </header>
        <div className="mx-auto max-w-lg px-5 py-20 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
            Artist portal
          </p>
          <h1 className="mt-3 font-[family-name:var(--font-syne)] text-3xl font-semibold">
            {blockOutgoing.blocked ? lockedName : "Profile unavailable"}
          </h1>
          <p className="mt-3 text-sm text-white/45">
            {blockOutgoing.blocked
              ? "You’ve blocked this artist. Unblock to see their portal again."
              : "This profile isn’t available."}
          </p>
          {blockOutgoing.blocked ? (
            <div className="mt-6 flex justify-center">
              <PeopleBlockButton
                personId={id}
                initialBlocked
                blocksReady={
                  !blockMutual.missingTable && !blockOutgoing.missingTable
                }
                loginNext={`/artists/${id}`}
                className="mt-0"
              />
            </div>
          ) : null}
          <Link
            href="/search"
            className="mt-8 inline-block text-sm text-[#1DB954] hover:underline"
          >
            Back to Search
          </Link>
        </div>
      </main>
    );
  }

  const genres = Array.isArray(artist.genres)
    ? artist.genres.filter((g): g is string => typeof g === "string")
    : [];
  const places = Array.isArray(artist.countries)
    ? artist.countries.filter((c): c is string => typeof c === "string")
    : [];

  const trackQuery = isOwner
    ? db
        .from("tracks")
        .select(
          "id, title, audio_url, cover_art_url, genre, artist_id, duration_secs, status, created_at",
        )
        .eq("artist_id", id)
        .order("created_at", { ascending: false })
        .limit(40)
    : withLiveCatalogTracks(
        db
          .from("tracks")
          .select(
            "id, title, audio_url, cover_art_url, genre, artist_id, duration_secs, status, created_at",
          )
          .eq("artist_id", id),
      )
        .order("created_at", { ascending: false })
        .limit(40);

  const { data: trackRows, error: trackError } = await trackQuery;

  const name = isOwner
    ? (typeof artist.display_name === "string" &&
        artist.display_name.trim()) ||
      "Artist"
    : artistCreditName({
        display_name: artist.display_name,
        privacy_public_profile: artist.privacy_public_profile ?? true,
      });

  const tracks = ((trackRows ?? []) as TrackRow[])
    .map((t) => ({ ...t, artist_name: name }))
    .filter((t) => {
      if (isDemoTrack(t)) return false;
      // Owners see drafts; public visitors only published
      return isOwner || isPublishedTrack(t);
    });

  const [countRes, followRes, tipsReady, activity, mixesRes, merchRes] =
    await Promise.all([
      loadFollowerCount(supabase, id),
      user && !isOwner
        ? loadIsFollowing(supabase, user.id, id)
        : Promise.resolve({ following: false, missingTable: false }),
      tipsTableReady(supabase),
      loadSharedListeningActivity(supabase, id, 6),
      loadPublicPlaylistsByOwner(supabase, id, 8),
      loadArtistMerchItems(db, id, { publicOnly: true }),
    ]);
  const followsReady = !countRes.missingTable && !followRes.missingTable;
  const publicMixes = mixesRes.playlists;

  const activityTrackIds = activity.entries.map((e) => e.id).filter(Boolean);
  const catalogTrackIds = tracks.map((t) => t.id).filter(Boolean);
  const likeProbeIds = [...new Set([...activityTrackIds, ...catalogTrackIds])];
  const likedAmong =
    user && likeProbeIds.length > 0
      ? await loadLikedAmongTrackIds(supabase, user.id, likeProbeIds)
      : { likedIds: [] as string[], missingTable: true };
  const likedByViewer: Record<string, boolean> = {};
  for (const tid of likedAmong.likedIds) {
    likedByViewer[tid] = true;
  }
  const likesReady = Boolean(user) && !likedAmong.missingTable;

  return (
    <main className="min-h-dvh bg-[#040d06] text-[#f8f8f8]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/dashboard">
            <RectLogo size={34} showWordmark />
          </Link>
          <nav className="flex gap-4 text-sm text-white/55">
            <Link href="/search" className="hover:text-white">
              Search
            </Link>
            <Link href="/charts" className="hover:text-white">
              Charts
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl space-y-8 px-5 py-10 sm:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-full border border-white/15 bg-white/[0.04] sm:h-32 sm:w-32">
            {typeof artist.avatar_url === "string" &&
            artist.avatar_url.trim() ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={artist.avatar_url.trim()}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-2xl font-semibold text-[#1DB954]/70">
                {(name.trim().slice(0, 2) || "AR").toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
            Artist portal
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight sm:text-5xl">
            {name}
          </h1>
          <p className="mt-2 text-sm text-white/45">
            {[
              artist.city?.trim() || null,
              places.length ? places.slice(0, 3).join(" · ") : null,
              genres.length ? genres.join(" · ") : null,
              !artist.city && !places.length && !genres.length
                ? "RECT SOUND artist"
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            {isOwner && !publicOk ? " · Private to others" : ""}
          </p>
          {artist.artist_bio?.trim() ? (
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/60">
              {artist.artist_bio.trim()}
            </p>
          ) : null}
          {isOwner ? (
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <p className="text-sm text-white/45">
                {countRes.count.toLocaleString()}{" "}
                {countRes.count === 1 ? "follower" : "followers"}
              </p>
              <Link
                href="/artist/login?next=/studio"
                className="text-sm text-[#1DB954] hover:underline"
              >
                Open studio →
              </Link>
            </div>
          ) : (
            <div>
              <ArtistFollowButton
                artistId={id}
                initialFollowing={followRes.following}
                initialCount={countRes.count}
                followsReady={followsReady}
              />
              <ArtistTipButton artistId={id} tipsReady={tipsReady} />
              {user ? (
                <PeopleBlockButton
                  personId={id}
                  initialBlocked={false}
                  blocksReady={!blockMutual.missingTable}
                  loginNext={`/artists/${id}`}
                />
              ) : null}
            </div>
          )}
          </div>
        </div>

        {activity.sharing && activity.entries.length > 0 ? (
          <PeopleSharedTracks
            activity={activity.entries}
            likedTracks={[]}
            showActivity
            showLikes={false}
            likedByViewer={likedByViewer}
            likesReady={likesReady}
            loginNext={`/artists/${id}`}
            formatPlayedAt={formatPlayedAt}
          />
        ) : null}

        {!mixesRes.missingTable && publicMixes.length > 0 ? (
          <section>
            <div className="mb-4 flex items-end justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
                Public mixes
              </h2>
              {isOwner ? (
                <Link
                  href="/playlists"
                  className="text-xs text-[#1DB954] hover:underline"
                >
                  Manage →
                </Link>
              ) : null}
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {publicMixes.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/playlists/${p.id}`}
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 transition hover:border-[#1DB954]/40"
                  >
                    <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
                      {p.cover_art_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.cover_art_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-white/25">
                          ♫
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {p.name}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-white/40">
                        {p.track_count}{" "}
                        {p.track_count === 1 ? "track" : "tracks"}
                        {p.description ? ` · ${p.description}` : ""}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : isOwner && !mixesRes.missingTable ? (
          <section className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-center">
            <p className="text-sm text-white/45">No public mixes yet</p>
            <p className="mt-1 text-xs text-white/30">
              Share a playlist from Your mixes — it will show here.
            </p>
            <Link
              href="/playlists"
              className="mt-3 inline-block text-xs text-[#1DB954] hover:underline"
            >
              Open Your mixes →
            </Link>
          </section>
        ) : null}

        {!merchRes.missingTable && merchRes.items.length > 0 ? (
          <ArtistMerchGrid
            items={merchRes.items}
            artistId={id}
            isOwner={isOwner}
            loginNext={`/artists/${id}`}
          />
        ) : isOwner && !merchRes.missingTable ? (
          <section className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-center">
            <p className="text-sm text-white/45">No store items yet</p>
            <p className="mt-1 text-xs text-white/30">
              Add merch in Studio — active items appear here automatically.
            </p>
            <Link
              href="/artist/login?next=/studio/store"
              className="mt-3 inline-block text-xs text-[#1DB954] hover:underline"
            >
              Open Store →
            </Link>
          </section>
        ) : null}

        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
            Catalog
          </h2>
          {trackError ? (
            <p className="rounded-xl border border-[#1DB954]/30 bg-[#1DB954]/10 px-4 py-3 text-sm text-[#1DB954]">
              Could not load tracks. {trackError.message}
            </p>
          ) : tracks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
              <p className="text-base font-medium">
                {isOwner ? "No releases yet" : "No live releases yet"}
              </p>
              <p className="mt-2 text-sm text-white/40">
                {isOwner
                  ? "Publish from Studio — live tracks appear here and on Home & Charts."
                  : "This artist hasn’t published a live track yet."}
              </p>
              {isOwner ? (
                <Link
                  href="/artist/login?next=/studio"
                  className="mt-5 inline-block rounded-full bg-[#1DB954] px-5 py-2.5 text-sm font-semibold text-black hover:bg-[#17a349]"
                >
                  Open Studio
                </Link>
              ) : (
                <div className="mt-5 flex justify-center">
                  <ArtistFollowButton
                    artistId={id}
                    initialFollowing={followRes.following}
                    initialCount={countRes.count}
                    followsReady={followsReady}
                    loginNext={`/artists/${id}`}
                    className="mt-0 justify-center"
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-2 md:p-3">
              <TrackList
                tracks={tracks}
                likedTracks={likedByViewer}
                likesReady={likesReady}
                loginNext={`/artists/${id}`}
              />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
