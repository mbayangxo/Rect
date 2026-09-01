import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToFanChart } from "@/components/add-to-fan-chart";
import { AddToPlaylist } from "@/components/add-to-playlist";
import { DownloadTrackButton } from "@/components/download-track-button";
import { PaidDownloadButton } from "@/components/paid-download-button";
import { ArtistFollowButton } from "@/components/artist-follow-button";
import { ArtistTipButton } from "@/components/artist-tip-button";
import { PeopleFollowButton } from "@/components/people-follow-button";
import { QueueTrackButton } from "@/components/queue-track-button";
import { ShareTrackButton } from "@/components/share-track-button";
import { SongComments } from "@/components/song-comments";
import { SongLikeControl } from "@/components/song-like-control";
import { SongLyrics } from "@/components/song-lyrics";
import { TrackCover } from "@/components/track-cover";
import { TrackPlayButton } from "@/components/track-play-button";
import { TrackLyricsEditor } from "@/components/studio/track-lyrics-editor";
import { TrackWritersEditor } from "@/components/track-writers-editor";
import { loadArtistCreditMap } from "@/lib/dashboard/artist-names";
import { loadTrackComments } from "@/lib/dashboard/comments";
import {
  loadFollowerCount,
  loadIsFollowing,
} from "@/lib/dashboard/follows";
import { genreToSlug } from "@/lib/dashboard/genres";
import { languageToSlug } from "@/lib/dashboard/languages";
import {
  loadFriendsWhoLikedTrack,
  loadLikedTrackIds,
  loadTrackLikeCount,
  loadTrackLikers,
} from "@/lib/dashboard/likes";
import { personProfileHref } from "@/lib/dashboard/people";
import { loadFollowingAmong } from "@/lib/dashboard/people-follows";
import { PRIVATE_ARTIST_LABEL } from "@/lib/dashboard/privacy";
import { tipsTableReady } from "@/lib/dashboard/tips";
import {
  loadTrackWriterSplits,
} from "@/lib/dashboard/writer-splits";
import { userOwnsTrackDownload } from "@/lib/dashboard/track-downloads-paid";
import { createClient } from "@/lib/supabase/server";
import {
  formatTrackDuration,
  isPublishedTrack,
  trackArtist,
  trackTitle,
  type TrackRow,
} from "@/lib/tracks";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function SongPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const full = await supabase
    .from("tracks")
    .select(
      "id, title, audio_url, cover_art_url, genre, language, artist_id, duration_secs, status, created_at, download_price_xof, lyrics",
    )
    .eq("id", id)
    .maybeSingle();

  let data = full.data;
  let error = full.error;
  if (
    error &&
    /download_price_xof|lyrics|language|column .* does not exist/i.test(error.message)
  ) {
    const lean = await supabase
      .from("tracks")
      .select(
        "id, title, audio_url, cover_art_url, genre, artist_id, duration_secs, status, created_at",
      )
      .eq("id", id)
      .maybeSingle();
    data = lean.data as typeof data;
    error = lean.error;
  }

  if (error || !data) notFound();

  const isOwner = user?.id === data.artist_id;
  if (!isPublishedTrack(data) && !isOwner) {
    notFound();
  }

  let artist_name: string | null = null;
  if (data.artist_id) {
    const names = await loadArtistCreditMap(supabase, [data.artist_id]);
    artist_name = names.get(data.artist_id) ?? null;
  }

  const track: TrackRow = { ...data, artist_name };
  const artistId = track.artist_id;
  const artistLabel = trackArtist(track);
  const artistIsPublic =
    Boolean(artistId) && artistLabel !== PRIVATE_ARTIST_LABEL;
  const genreSlug = track.genre ? genreToSlug(track.genre) : "";
  const languageSlug = track.language ? languageToSlug(track.language) : "";
  const loginNext = `/songs/${id}`;

  const downloadPrice =
    typeof data.download_price_xof === "number" && data.download_price_xof > 0
      ? data.download_price_xof
      : 0;

  const [likeCountRes, likesRes, countRes, followRes, tipsReady, commentsRes, likersRes, friendsLikedRes, writersRes, ownsDownload] =
    await Promise.all([
      loadTrackLikeCount(supabase, id),
      user
        ? loadLikedTrackIds(supabase, user.id)
        : Promise.resolve({
            likedIds: [] as string[],
            missingTable: false,
            error: null,
          }),
      artistId && artistIsPublic && !isOwner
        ? loadFollowerCount(supabase, artistId)
        : Promise.resolve({
            count: 0,
            missingTable: false,
            error: null as string | null,
          }),
      artistId && artistIsPublic && user && !isOwner
        ? loadIsFollowing(supabase, user.id, artistId)
        : Promise.resolve({ following: false, missingTable: false }),
      artistId && artistIsPublic && !isOwner
        ? tipsTableReady(supabase)
        : Promise.resolve(false),
      loadTrackComments(supabase, id, { viewerId: user?.id ?? null }),
      isOwner
        ? loadTrackLikers(supabase, id, 24)
        : Promise.resolve({
            likers: [],
            missingTable: false,
            error: null as string | null,
          }),
      user
        ? loadFriendsWhoLikedTrack(supabase, user.id, id, 12)
        : Promise.resolve({
            likers: [],
            missingTable: false,
            error: null as string | null,
          }),
      loadTrackWriterSplits(supabase, id),
      user && downloadPrice > 0 && !isOwner
        ? userOwnsTrackDownload(supabase, user.id, id)
        : Promise.resolve(false),
    ]);

  const likerIds = [
    ...new Set(
      [...friendsLikedRes.likers, ...likersRes.likers]
        .map((l) => l.id)
        .filter((id) => id && id !== user?.id),
    ),
  ];
  const peopleAmong =
    user && likerIds.length > 0
      ? await loadFollowingAmong(supabase, user.id, likerIds)
      : { followingIds: [] as string[], missingTable: false };
  const followingPeople: Record<string, boolean> = {};
  for (const pid of peopleAmong.followingIds) {
    followingPeople[pid] = true;
  }
  const peopleFollowsReady = Boolean(user) && !peopleAmong.missingTable;

  const initiallyLiked = likesRes.likedIds.includes(id);
  const followsReady = !countRes.missingTable && !followRes.missingTable;
  const showArtistSupport = Boolean(artistId && artistIsPublic && !isOwner);

  return (
    <main className="min-h-screen bg-[#040d06] px-5 py-10 text-[#f8f8f8] sm:px-6">
      <div className="mx-auto max-w-xl">
        <Link
          href="/dashboard"
          className="text-xs uppercase tracking-[0.2em] text-white/45 hover:text-white"
        >
          ← Hub
        </Link>

        <div className="mt-10 rounded-xl border border-white/[0.08] bg-white/[0.03] p-6">
          <div className="flex items-start gap-4">
            <TrackCover track={track} size="lg" className="rounded-xl" />
            <div className="min-w-0 flex-1">
              <p className="text-[0.65rem] uppercase tracking-[0.28em] text-[#1DB954]">
                Track
                {isOwner && !isPublishedTrack(track) ? " · Draft" : ""}
              </p>
              <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight">
                {trackTitle(track)}
              </h1>
              <p className="mt-2 text-sm text-white/50">
                {artistId && artistIsPublic ? (
                  <Link
                    href={`/artists/${artistId}`}
                    className="hover:text-[#1DB954]"
                  >
                    {artistLabel}
                  </Link>
                ) : (
                  artistLabel
                )}
                {track.genre ? (
                  <>
                    {" · "}
                    {genreSlug ? (
                      <Link
                        href={`/genres/${genreSlug}`}
                        className="hover:text-[#1DB954]"
                      >
                        {track.genre}
                      </Link>
                    ) : (
                      track.genre
                    )}
                  </>
                ) : null}
                {track.language ? (
                  <>
                    {" · "}
                    {languageSlug ? (
                      <Link
                        href={`/languages/${languageSlug}`}
                        className="hover:text-[#1DB954]"
                      >
                        {track.language}
                      </Link>
                    ) : (
                      <span>{track.language}</span>
                    )}
                  </>
                ) : null}
                {formatTrackDuration(track.duration_secs) ? (
                  <>
                    {" · "}
                    <span className="tabular-nums">
                      {formatTrackDuration(track.duration_secs)}
                    </span>
                  </>
                ) : null}
              </p>
              {!likeCountRes.missingView ? (
                <p className="mt-2 text-xs text-white/35">
                  {likeCountRes.count.toLocaleString()}{" "}
                  {likeCountRes.count === 1 ? "like" : "likes"}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <TrackPlayButton track={track} />
            {downloadPrice > 0 && !isOwner && !ownsDownload ? (
              <PaidDownloadButton
                track={track}
                priceXof={downloadPrice}
                owned={ownsDownload}
              />
            ) : null}
            {(downloadPrice <= 0 || isOwner || ownsDownload) && track.audio_url ? (
              <DownloadTrackButton
                track={track}
                useEntitlementApi={downloadPrice > 0}
              />
            ) : null}
          </div>

          {isOwner ? (
            <section className="mt-6 border-t border-white/[0.08] pt-5">
              <TrackLyricsEditor
                trackId={track.id}
                initialLyrics={
                  typeof track.lyrics === "string" ? track.lyrics : null
                }
              />
            </section>
          ) : typeof track.lyrics === "string" && track.lyrics.trim() ? (
            <SongLyrics lyrics={track.lyrics} />
          ) : null}

          {!writersRes.missingTable ? (
            <section className="mt-6 border-t border-white/[0.08] pt-5">
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                Writers
              </h2>
              {writersRes.error ? (
                <p className="mt-2 text-sm text-[#F5A623]">{writersRes.error}</p>
              ) : isOwner ? (
                <div className="mt-3">
                  <TrackWritersEditor
                    trackId={track.id}
                    initialWriters={writersRes.writers}
                  />
                </div>
              ) : writersRes.writers.length === 0 ? (
                <p className="mt-2 text-sm text-white/40">
                  No writer credits listed.
                </p>
              ) : (
                <ul className="mt-3 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]">
                  {writersRes.writers.map((w, i) => (
                    <li
                      key={`${w.writer_name}-${i}`}
                      className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3 text-sm last:border-b-0"
                    >
                      <span className="min-w-0 truncate font-medium">
                        {w.writer_name}
                      </span>
                      <span className="shrink-0 tabular-nums text-white/45">
                        {w.share_percent}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : isOwner ? (
            <section className="mt-6 border-t border-white/[0.08] pt-5">
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                Writers
              </h2>
              <p className="mt-2 text-xs text-white/35">
                Run{" "}
                <code className="text-[#1DB954]">
                  20260810_phase1_track_live_status.sql
                </code>{" "}
                to store writer splits.
              </p>
            </section>
          ) : null}

          {isOwner && artistId ? (
            <p className="mt-4 text-sm text-white/45">
              <Link href="/studio/tracks" className="text-[#1DB954] hover:underline">
                Open studio →
              </Link>
            </p>
          ) : null}

          {showArtistSupport && artistId ? (
            <div className="mt-6 border-t border-white/[0.08] pt-5">
              <p className="text-xs uppercase tracking-[0.16em] text-white/35">
                Support the artist
              </p>
              <p className="mt-1 text-[0.65rem] text-white/35">
                Tips are demo amounts — not a real charge.
              </p>
              <ArtistFollowButton
                artistId={artistId}
                initialFollowing={followRes.following}
                initialCount={countRes.count}
                followsReady={followsReady}
                loginNext={loginNext}
                className="mt-3"
              />
              <ArtistTipButton
                artistId={artistId}
                tipsReady={tipsReady}
                loginNext={loginNext}
                trackId={track.id}
                trackTitle={trackTitle(track)}
              />
            </div>
          ) : null}

          <SongLikeControl
            trackId={track.id}
            initialCount={likeCountRes.count}
            initiallyLiked={initiallyLiked}
            signedIn={Boolean(user)}
          />

          {!friendsLikedRes.missingTable &&
          !friendsLikedRes.error &&
          friendsLikedRes.likers.length > 0 ? (
            <section className="mt-6">
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                Liked by friends
              </h2>
              <ul className="mt-3 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]">
                {friendsLikedRes.likers.map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3 text-sm last:border-b-0"
                  >
                    <Link
                      href={personProfileHref(l.id)}
                      className="min-w-0 flex-1 truncate font-medium hover:text-[#1DB954]"
                    >
                      {l.display_name}
                    </Link>
                    {l.id !== user?.id && peopleFollowsReady ? (
                      <PeopleFollowButton
                        personId={l.id}
                        initialFollowing={Boolean(followingPeople[l.id])}
                        initialCount={0}
                        followsReady={peopleFollowsReady}
                        showCount={false}
                        compact
                        idleLabel="Follow"
                        className="shrink-0"
                        loginNext={loginNext}
                      />
                    ) : null}
                    <span className="shrink-0 text-xs text-white/35">
                      {l.liked_at
                        ? new Date(l.liked_at).toLocaleDateString()
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {isOwner ? (
            <section className="mt-6">
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                Liked by
              </h2>
              {likersRes.missingTable ? (
                <p className="mt-2 text-xs text-white/35">
                  Run{" "}
                  <code className="text-[#1DB954]">
                    20260809_track_likes_artist_select.sql
                  </code>{" "}
                  to see who liked this track.
                </p>
              ) : likersRes.error ? (
                <p className="mt-2 text-sm text-[#1DB954]">{likersRes.error}</p>
              ) : likersRes.likers.length === 0 ? (
                <p className="mt-2 text-sm text-white/40">
                  {likeCountRes.count > 0
                    ? "Likes exist — run 20260809_track_likes_artist_select.sql to see who."
                    : "No likes yet"}
                </p>
              ) : (
                <ul className="mt-3 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]">
                  {likersRes.likers.map((l) => (
                    <li
                      key={l.id}
                      className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3 text-sm last:border-b-0"
                    >
                      <Link
                        href={personProfileHref(l.id)}
                        className="min-w-0 flex-1 truncate font-medium hover:text-[#1DB954]"
                      >
                        {l.display_name}
                      </Link>
                      {l.id !== user?.id && peopleFollowsReady ? (
                        <PeopleFollowButton
                          personId={l.id}
                          initialFollowing={Boolean(followingPeople[l.id])}
                          initialCount={0}
                          followsReady={peopleFollowsReady}
                          showCount={false}
                          compact
                          idleLabel="Follow"
                          className="shrink-0"
                          loginNext={loginNext}
                        />
                      ) : null}
                      <span className="shrink-0 text-xs text-white/35">
                        {l.liked_at
                          ? new Date(l.liked_at).toLocaleDateString()
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          <QueueTrackButton track={track} />

          <ShareTrackButton track={track} />

          <AddToPlaylist trackId={track.id} />

          <AddToFanChart trackId={track.id} loginNext={loginNext} />

          <SongComments
            trackId={track.id}
            initialComments={commentsRes.comments}
            missingTable={commentsRes.missingTable}
            loadError={commentsRes.error}
            signedIn={Boolean(user)}
            currentUserId={user?.id ?? null}
            isTrackOwner={isOwner}
            loginNext={loginNext}
            likesReady={commentsRes.likesReady}
          />

          {!track.audio_url ? (
            <p className="mt-4 text-sm text-[#1DB954]">
              No audio_url on this row.
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
