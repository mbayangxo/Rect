import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToPlaylist } from "@/components/add-to-playlist";
import { ArtistFollowButton } from "@/components/artist-follow-button";
import { ArtistTipButton } from "@/components/artist-tip-button";
import { QueueTrackButton } from "@/components/queue-track-button";
import { ShareTrackButton } from "@/components/share-track-button";
import { SongLikeControl } from "@/components/song-like-control";
import { TrackCover } from "@/components/track-cover";
import { TrackPlayButton } from "@/components/track-play-button";
import { loadArtistCreditMap } from "@/lib/dashboard/artist-names";
import {
  loadFollowerCount,
  loadIsFollowing,
} from "@/lib/dashboard/follows";
import { genreToSlug } from "@/lib/dashboard/genres";
import {
  loadLikedTrackIds,
  loadTrackLikeCount,
} from "@/lib/dashboard/likes";
import { PRIVATE_ARTIST_LABEL } from "@/lib/dashboard/privacy";
import { tipsTableReady } from "@/lib/dashboard/tips";
import { createClient } from "@/lib/supabase/server";
import {
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

  const { data, error } = await supabase
    .from("tracks")
    .select(
      "id, title, audio_url, cover_art_url, genre, artist_id, duration_secs, status, created_at",
    )
    .eq("id", id)
    .maybeSingle();

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
  const loginNext = `/songs/${id}`;

  const [likeCountRes, likesRes, countRes, followRes, tipsReady] =
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
    ]);

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
              </p>
              {!likeCountRes.missingView ? (
                <p className="mt-2 text-xs text-white/35">
                  {likeCountRes.count.toLocaleString()}{" "}
                  {likeCountRes.count === 1 ? "like" : "likes"}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-8">
            <TrackPlayButton track={track} />
          </div>

          {isOwner && artistId ? (
            <p className="mt-4 text-sm text-white/45">
              <Link href="/artist" className="text-[#1DB954] hover:underline">
                Open studio →
              </Link>
            </p>
          ) : null}

          {showArtistSupport && artistId ? (
            <div className="mt-6 border-t border-white/[0.08] pt-5">
              <p className="text-xs uppercase tracking-[0.16em] text-white/35">
                Support the artist
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
              />
            </div>
          ) : null}

          <SongLikeControl
            trackId={track.id}
            initialCount={likeCountRes.count}
            initiallyLiked={initiallyLiked}
            signedIn={Boolean(user)}
          />

          <QueueTrackButton track={track} />

          <ShareTrackButton track={track} />

          <AddToPlaylist trackId={track.id} />

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
