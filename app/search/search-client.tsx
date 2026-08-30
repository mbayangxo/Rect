"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { AddToPlaylist } from "@/components/add-to-playlist";
import { ArtistFollowButton } from "@/components/artist-follow-button";
import { PeopleFollowButton } from "@/components/people-follow-button";
import { usePlayer } from "@/components/player-provider";
import { RectLogo } from "@/components/rect-logo";
import { QueueTrackButton } from "@/components/queue-track-button";
import { SavePlaylistButton } from "@/components/save-playlist-button";
import { FollowPlaylistButton } from "@/components/follow-playlist-button";
import { SharePlaylistButton } from "@/components/share-playlist-button";
import { ShareTrackButton } from "@/components/share-track-button";
import { TrackLikeButton } from "@/components/track-like-button";
import { GenreFilterChips } from "@/components/genre-filter-chips";
import { LanguageFilterChips } from "@/components/language-filter-chips";
import { PlaceFilterChips } from "@/components/place-filter-chips";
import { TrackCover } from "@/components/track-cover";
import type {
  SearchArtist,
  SearchPerson,
  SearchPlaylist,
  SearchTrack,
} from "@/lib/dashboard/search";
import { personProfileHref } from "@/lib/dashboard/people";
import { trackArtist, trackTitle, formatTrackDuration } from "@/lib/tracks";

const BROWSE = [
  { href: "/charts", label: "Charts", tone: "from-[#0F2B1A] to-[#060908]" },
  { href: "/new", label: "New", tone: "from-[#1a2b14] to-[#060908]" },
  { href: "/places", label: "Places", tone: "from-[#1a2410] to-[#060908]" },
  { href: "/genres", label: "Genres", tone: "from-[#142b0f] to-[#060908]" },
  { href: "/languages", label: "Languages", tone: "from-[#0f1a2b] to-[#06080a]" },
  { href: "/radio", label: "Radio", tone: "from-[#0a2e18] to-[#060908]" },
  { href: "/following", label: "Following", tone: "from-[#1a2b0f] to-[#060908]" },
  { href: "/inbox", label: "Inbox", tone: "from-[#0f1a14] to-[#060908]" },
  { href: "/playlists", label: "Playlists", tone: "from-[#1a1f0f] to-[#060908]" },
  { href: "/tips", label: "Tips", tone: "from-[#2b1f0f] to-[#090806]" },
  { href: "/studio", label: "Studio", tone: "from-[#0f2b1a] to-[#060908]" },
  { href: "/library", label: "Liked", tone: "from-[#2B0F1A] to-[#090608]" },
  { href: "/journal", label: "Journal", tone: "from-[#0F1A2B] to-[#06080A]" },
] as const;

type Props = {
  initialQuery: string;
  initialTracks: SearchTrack[];
  initialArtists: SearchArtist[];
  initialPlaylists: SearchPlaylist[];
  initialPeople: SearchPerson[];
  initialError: string | null;
  viewerId?: string | null;
  followingPeople?: Record<string, boolean>;
  peopleFollowsReady?: boolean;
  followingArtists?: Record<string, boolean>;
  artistFollowsReady?: boolean;
  likedTracks?: Record<string, boolean>;
  likesReady?: boolean;
  languageSlug?: string | null;
  languageLabel?: string | null;
  languageChips?: { slug: string; name: string }[];
  genreSlug?: string | null;
  genreLabel?: string | null;
  genreChips?: { slug: string; name: string }[];
  placeSlug?: string | null;
  placeLabel?: string | null;
  placeChips?: { slug: string; name: string }[];
};

export function SearchClient({
  initialQuery,
  initialTracks,
  initialArtists,
  initialPlaylists,
  initialPeople,
  initialError,
  viewerId = null,
  followingPeople = {},
  peopleFollowsReady = false,
  followingArtists = {},
  artistFollowsReady = false,
  likedTracks = {},
  likesReady = false,
  languageSlug = null,
  languageLabel = null,
  languageChips = [],
  genreSlug = null,
  genreLabel = null,
  genreChips = [],
  placeSlug = null,
  placeLabel = null,
  placeChips = [],
}: Props) {
  const router = useRouter();
  const player = usePlayer();
  const [q, setQ] = useState(initialQuery);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setQ(initialQuery);
  }, [initialQuery]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const next = q.trim();
    const params = new URLSearchParams();
    if (next) params.set("q", next);
    if (languageSlug) params.set("language", languageSlug);
    if (genreSlug) params.set("genre", genreSlug);
    if (placeSlug) params.set("place", placeSlug);
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/search?${qs}` : "/search");
    });
  }

  const empty =
    !initialError &&
    initialTracks.length === 0 &&
    initialArtists.length === 0 &&
    initialPlaylists.length === 0 &&
    initialPeople.length === 0;

  const playableSongs = initialTracks.filter((t) => t.audio_url);

  return (
    <main className="min-h-dvh bg-[#040d06] text-[#f8f8f8]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/dashboard">
            <RectLogo size={34} showWordmark />
          </Link>
          <nav className="flex gap-4 text-sm text-white/55">
            <Link href="/dashboard" className="hover:text-white">
              Home
            </Link>
            <Link href="/search" className="text-[#1DB954]">
              Search
            </Link>
            <Link href="/charts" className="hover:text-white">
              Charts
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl space-y-8 px-5 py-8 sm:px-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
            Search
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight sm:text-4xl">
            Find music in the world
          </h1>
        </div>

        <form
          onSubmit={submit}
          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 focus-within:border-[#1DB954]/50"
        >
          <span className="text-white/35" aria-hidden>
            ⌕
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Artists, songs, people, playlists…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-white/30"
            aria-label="Search RECT SOUND"
          />
          <button
            type="submit"
            disabled={pending}
            className="shrink-0 rounded-full bg-[#1DB954] px-4 py-1.5 text-xs font-semibold text-black disabled:opacity-60"
          >
            {pending ? "…" : "Search"}
          </button>
        </form>

        <div className="space-y-2">
          <PlaceFilterChips
            activeSlug={placeSlug}
            basePath="/search"
            keepParams={{
              q: initialQuery || undefined,
              genre: genreSlug || undefined,
              language: languageSlug || undefined,
            }}
            places={placeChips}
          />
          <GenreFilterChips
            activeSlug={genreSlug}
            basePath="/search"
            keepParams={{
              q: initialQuery || undefined,
              language: languageSlug || undefined,
              place: placeSlug || undefined,
            }}
            genres={genreChips}
          />
          <LanguageFilterChips
            activeSlug={languageSlug}
            basePath="/search"
            keepParams={{
              q: initialQuery || undefined,
              genre: genreSlug || undefined,
              place: placeSlug || undefined,
            }}
            languages={languageChips}
          />
        </div>
        {placeLabel || genreLabel || languageLabel ? (
          <p className="text-xs text-white/40">
            Filtering
            {placeLabel ? ` · ${placeLabel}` : ""}
            {genreLabel ? ` · ${genreLabel}` : ""}
            {languageLabel ? ` · ${languageLabel}` : ""}.{" "}
            <Link href="/places" className="text-[#1DB954] hover:underline">
              Place hubs →
            </Link>
          </p>
        ) : null}

        {!initialQuery && !languageSlug && !genreSlug && !placeSlug ? (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-white/70">Browse</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {BROWSE.map((b) => (
                <Link
                  key={b.href}
                  href={b.href}
                  className={`flex h-24 items-end rounded-xl border border-white/10 bg-gradient-to-br ${b.tone} p-4 text-sm font-semibold transition hover:border-[#1DB954]/40`}
                >
                  {b.label}
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {initialError ? (
          <p className="rounded-xl border border-[#1DB954]/30 bg-[#1DB954]/10 px-4 py-3 text-sm text-[#1DB954]">
            Could not search. {initialError}
          </p>
        ) : null}

        {empty ? (
          <div className="rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
            <p className="text-base font-medium">
              {initialQuery
                ? `No results for “${initialQuery}”`
                : placeLabel || genreLabel || languageLabel
                  ? `No results for ${[placeLabel, genreLabel, languageLabel].filter(Boolean).join(" · ")} yet`
                  : "Nothing to browse yet"}
            </p>
            <p className="mt-2 text-sm text-white/40">
              Real tracks, artists, listeners, and public playlists from
              Supabase show up here.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            <div className="grid gap-10 lg:grid-cols-2">
              <section>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
                    Songs{" "}
                    {initialTracks.length ? `(${initialTracks.length})` : ""}
                  </h2>
                  {playableSongs.length > 0 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => player.playQueue(playableSongs, 0)}
                        className="rounded-full bg-[#1DB954] px-3 py-1 text-xs font-semibold text-black hover:bg-[#17a349]"
                      >
                        ▶ Play all
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          player.playQueue(playableSongs, 0, {
                            shuffle: true,
                            repeat: true,
                          })
                        }
                        className="rounded-full border border-white/20 px-3 py-1 text-xs font-medium text-white/80 hover:bg-white/10"
                      >
                        ⇄ Shuffle
                      </button>
                    </>
                  ) : null}
                </div>
                {initialTracks.length === 0 ? (
                  <p className="text-sm text-white/40">No songs matched.</p>
                ) : (
                  <ul className="space-y-1">
                    {initialTracks.map((t) => {
                      const active = player.track?.id === t.id;
                      const canPlay = Boolean(t.audio_url);
                      const queueIdx = playableSongs.findIndex(
                        (x) => x.id === t.id,
                      );
                      return (
                      <li
                        key={t.id}
                        className={`flex items-center gap-2 rounded-xl px-3 py-3 hover:bg-white/[0.04] ${
                          active ? "bg-[#1DB954]/10" : ""
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (!canPlay) return;
                            if (active) player.toggle();
                            else
                              player.playQueue(
                                playableSongs,
                                Math.max(0, queueIdx),
                              );
                          }}
                          disabled={!canPlay}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-40"
                        >
                          <TrackCover track={t} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {trackTitle(t)}
                            </span>
                            <span className="block truncate text-xs text-white/40">
                              {trackArtist(t)}
                              {t.genre ? ` · ${t.genre}` : ""}
                              {formatTrackDuration(t.duration_secs)
                                ? ` · ${formatTrackDuration(t.duration_secs)}`
                                : ""}
                            </span>
                          </span>
                          <span className="text-[#1DB954]">▶</span>
                        </button>
                        <Link
                          href={`/songs/${t.id}`}
                          className="shrink-0 text-xs text-white/35 hover:text-[#1DB954]"
                        >
                          Open
                        </Link>
                        <AddToPlaylist
                          trackId={t.id}
                          compact
                          loginNext={`/search?q=${encodeURIComponent(initialQuery)}`}
                        />
                        <TrackLikeButton
                          trackId={t.id}
                          initialLiked={Boolean(likedTracks[t.id])}
                          likesReady={likesReady}
                          loginNext={`/search?q=${encodeURIComponent(initialQuery)}`}
                          compact
                        />
                        <QueueTrackButton track={t} compact />
                        <ShareTrackButton track={t} compact />
                      </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
                  Artists{" "}
                  {initialArtists.length ? `(${initialArtists.length})` : ""}
                </h2>
                {initialArtists.length === 0 ? (
                  <p className="text-sm text-white/40">No artists matched.</p>
                ) : (
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {initialArtists.map((a) => {
                      const isSelf = viewerId === a.id;
                      return (
                      <li
                        key={a.id}
                        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3"
                      >
                        <Link
                          href={`/artists/${a.id}`}
                          className="flex min-w-0 flex-1 items-center gap-3 transition hover:text-[#1DB954]"
                        >
                          <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/[0.04]">
                            {a.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={a.avatar_url}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-[#1DB954]/70">
                                {(a.display_name.slice(0, 2) || "AR").toUpperCase()}
                              </span>
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold">
                              {a.display_name}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-white/40">
                              {a.genre || "Artist"}
                            </span>
                          </span>
                        </Link>
                        {!isSelf ? (
                          <ArtistFollowButton
                            artistId={a.id}
                            initialFollowing={Boolean(followingArtists[a.id])}
                            initialCount={0}
                            followsReady={artistFollowsReady}
                            showCount={false}
                            compact
                            className="mt-0 shrink-0"
                            loginNext={
                              initialQuery
                                ? `/search?q=${encodeURIComponent(initialQuery)}`
                                : "/search"
                            }
                          />
                        ) : null}
                      </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>

            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
                People{" "}
                {initialPeople.length ? `(${initialPeople.length})` : ""}
              </h2>
              {initialPeople.length === 0 ? (
                <p className="text-sm text-white/40">
                  {initialQuery
                    ? "No public listeners matched."
                    : "No public listener profiles yet."}
                </p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {initialPeople.map((p) => {
                    const isSelf = viewerId === p.id;
                    return (
                      <li
                        key={p.id}
                        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3"
                      >
                        <Link
                          href={personProfileHref(p.id)}
                          className="flex min-w-0 flex-1 items-center gap-3 transition hover:text-[#1DB954]"
                        >
                          <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/[0.04]">
                            {p.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={p.avatar_url}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-[#1DB954]/70">
                                {(p.display_name.slice(0, 2) || "LI").toUpperCase()}
                              </span>
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">
                              {p.display_name}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-white/40">
                              {p.place || "Listener"}
                            </span>
                          </span>
                        </Link>
                        {!isSelf && peopleFollowsReady ? (
                          <PeopleFollowButton
                            personId={p.id}
                            initialFollowing={Boolean(followingPeople[p.id])}
                            initialCount={0}
                            followsReady={peopleFollowsReady}
                            showCount={false}
                            compact
                            className="mt-0 shrink-0"
                            loginNext={
                              initialQuery
                                ? `/search?q=${encodeURIComponent(initialQuery)}`
                                : "/search"
                            }
                          />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
                Playlists{" "}
                {initialPlaylists.length
                  ? `(${initialPlaylists.length})`
                  : ""}
              </h2>
              {initialPlaylists.length === 0 ? (
                <p className="text-sm text-white/40">
                  {initialQuery
                    ? "No public playlists matched."
                    : "No public playlists yet — share one from Your mixes."}
                </p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {initialPlaylists.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-2 pr-2 transition hover:border-[#1DB954]/40"
                    >
                      <Link
                        href={`/playlists/${p.id}`}
                        className="flex min-w-0 flex-1 items-center gap-3 p-1"
                      >
                        <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
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
                          <span className="block truncate font-medium">
                            {p.name}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-white/40">
                            {p.track_count}{" "}
                            {p.track_count === 1 ? "track" : "tracks"}
                            {p.owner_name ? ` · ${p.owner_name}` : ""}
                          </span>
                          {p.description ? (
                            <span className="mt-0.5 block truncate text-xs text-white/30">
                              {p.description}
                            </span>
                          ) : null}
                        </span>
                      </Link>
                      <FollowPlaylistButton
                        playlistId={p.id}
                        compact
                        hydrate
                        loginNext={`/search?q=${encodeURIComponent(initialQuery)}`}
                      />
                      <SavePlaylistButton
                        playlistId={p.id}
                        compact
                        loginNext={`/search?q=${encodeURIComponent(initialQuery)}`}
                      />
                      <SharePlaylistButton
                        playlistId={p.id}
                        name={p.name}
                        isPublic
                        compact
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
