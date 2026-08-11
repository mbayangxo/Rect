"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { InboxTrackPlay } from "@/components/inbox-track-play";
import { RectLogo } from "@/components/rect-logo";
import { SharePlaylistButton } from "@/components/share-playlist-button";
import type { FollowedPlaylist } from "@/lib/dashboard/playlist-follows";
import type { PlaylistSummary } from "@/lib/dashboard/playlists";
import type { TrackRow } from "@/lib/tracks";

type Props = {
  initialPlaylists: PlaylistSummary[];
  collabPlaylists?: PlaylistSummary[];
  savedPlaylists?: FollowedPlaylist[];
  loadError: string | null;
  missingTable: boolean;
  followsMissing?: boolean;
  collabMissing?: boolean;
  /** True when privacy_show_saves is off (default). */
  savesHidden?: boolean;
  playlistPreviewTracks?: Record<string, TrackRow>;
};

export function PlaylistsClient({
  initialPlaylists,
  collabPlaylists: initialCollab = [],
  savedPlaylists: initialSaved = [],
  loadError,
  missingTable,
  followsMissing = false,
  collabMissing = false,
  savesHidden = true,
  playlistPreviewTracks = {},
}: Props) {
  const router = useRouter();
  const [playlists, setPlaylists] = useState(initialPlaylists);
  const [collab, setCollab] = useState(initialCollab);
  const [saved, setSaved] = useState(initialSaved);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [privacyId, setPrivacyId] = useState<string | null>(null);
  const [publishNote, setPublishNote] = useState<string | null>(null);

  useEffect(() => {
    setPlaylists(initialPlaylists);
  }, [initialPlaylists]);

  useEffect(() => {
    setCollab(initialCollab);
  }, [initialCollab]);

  useEffect(() => {
    setSaved(initialSaved);
  }, [initialSaved]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = (await res.json()) as {
        error?: string;
        playlist?: PlaylistSummary;
      };
      if (!res.ok || data.error || !data.playlist) {
        setError(data.error || "Could not create playlist");
        return;
      }
      setName("");
      setPlaylists((list) => [data.playlist!, ...list]);
      router.push(`/playlists/${data.playlist.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  async function onUnsave(id: string) {
    setError(null);
    const prev = saved;
    setSaved((list) => list.filter((p) => p.id !== id));
    try {
      const res = await fetch(`/api/playlists/${id}/follow`, { method: "POST" });
      const data = (await res.json()) as {
        error?: string;
        following?: boolean;
      };
      if (!res.ok || data.error) {
        setSaved(prev);
        setError(data.error || "Could not unsave");
        return;
      }
      // Toggle can re-follow if already unfollowed — keep local removal when following is false
      if (data.following) {
        setSaved(prev);
        setError("Still saved — try again");
        return;
      }
      router.refresh();
    } catch (err) {
      setSaved(prev);
      setError(err instanceof Error ? err.message : "Network error");
    }
  }

  async function onDelete(id: string) {
    setError(null);
    const prev = playlists;
    setPlaylists((list) => list.filter((p) => p.id !== id));
    try {
      const res = await fetch(`/api/playlists/${id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setPlaylists(prev);
        setError(data.error || "Could not delete");
        return;
      }
      router.refresh();
    } catch (err) {
      setPlaylists(prev);
      setError(err instanceof Error ? err.message : "Network error");
    }
  }

  async function onTogglePin(p: PlaylistSummary) {
    setError(null);
    const nextPinned = !p.pinned_at;
    const prev = playlists;
    const optimisticAt = nextPinned ? new Date().toISOString() : null;
    setPlaylists((list) => {
      const next = list.map((row) =>
        row.id === p.id ? { ...row, pinned_at: optimisticAt } : row,
      );
      return [...next].sort((a, b) => {
        const ap = a.pinned_at || "";
        const bp = b.pinned_at || "";
        if (ap && !bp) return -1;
        if (!ap && bp) return 1;
        if (ap && bp && ap !== bp) return bp.localeCompare(ap);
        return (b.updated_at || "").localeCompare(a.updated_at || "");
      });
    });
    try {
      const res = await fetch(`/api/playlists/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: nextPinned }),
      });
      const data = (await res.json()) as {
        error?: string;
        pinned_at?: string | null;
      };
      if (!res.ok || data.error) {
        setPlaylists(prev);
        setError(data.error || "Could not pin playlist");
        return;
      }
      setPlaylists((list) => {
        const next = list.map((row) =>
          row.id === p.id
            ? { ...row, pinned_at: data.pinned_at ?? optimisticAt }
            : row,
        );
        return [...next].sort((a, b) => {
          const ap = a.pinned_at || "";
          const bp = b.pinned_at || "";
          if (ap && !bp) return -1;
          if (!ap && bp) return 1;
          if (ap && bp && ap !== bp) return bp.localeCompare(ap);
          return (b.updated_at || "").localeCompare(a.updated_at || "");
        });
      });
      router.refresh();
    } catch (err) {
      setPlaylists(prev);
      setError(err instanceof Error ? err.message : "Network error");
    }
  }

  async function onTogglePublic(p: PlaylistSummary) {
    if (privacyId) return;
    setError(null);
    setPublishNote(null);
    const nextPublic = !p.is_public;
    const prev = playlists;
    setPrivacyId(p.id);
    setPlaylists((list) =>
      list.map((row) =>
        row.id === p.id ? { ...row, is_public: nextPublic } : row,
      ),
    );
    try {
      const res = await fetch(`/api/playlists/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_public: nextPublic }),
      });
      const data = (await res.json()) as {
        error?: string;
        is_public?: boolean;
        became_public?: boolean;
        notified?: number;
      };
      if (!res.ok || data.error) {
        setPlaylists(prev);
        setError(data.error || "Could not update visibility");
        return;
      }
      setPlaylists((list) =>
        list.map((row) =>
          row.id === p.id
            ? { ...row, is_public: data.is_public ?? nextPublic }
            : row,
        ),
      );
      if (nextPublic && data.became_public) {
        const n = Number(data.notified) || 0;
        setPublishNote(
          n === 0
            ? `${p.name} is public — no people-followers to notify yet`
            : `${p.name} is public — notified ${n} friend${n === 1 ? "" : "s"}`,
        );
      } else if (!nextPublic) {
        setPublishNote(`${p.name} is private again`);
      }
      router.refresh();
    } catch (err) {
      setPlaylists(prev);
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setPrivacyId(null);
    }
  }

  return (
    <main className="min-h-dvh bg-[#040d06] text-[#f8f8f8]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/dashboard">
            <RectLogo size={34} showWordmark />
          </Link>
          <nav className="flex gap-4 text-sm text-white/55">
            <Link href="/dashboard" className="hover:text-white">
              Home
            </Link>
            <Link href="/library" className="hover:text-white">
              Library
            </Link>
            <Link href="/playlists" className="text-[#1DB954]">
              Playlists
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl space-y-8 px-5 py-10 sm:px-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
            Playlists
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight sm:text-4xl">
            Your mixes
          </h1>
          <p className="mt-2 text-sm text-white/45">
            Mixes you create, collaborate on, and save.
          </p>
          {savesHidden ? (
            <p className="mt-4 max-w-xl rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/50">
              Saved mixes stay off your public page.{" "}
              <Link
                href="/profile"
                className="text-[#1DB954] hover:underline"
              >
                Turn on Saved mixes
              </Link>{" "}
              in Profile if you want friends to see them.
            </p>
          ) : (
            <p className="mt-2 text-sm text-white/40">
              Shared saves show on your public page. Change anytime in{" "}
              <Link
                href="/profile"
                className="text-[#1DB954] hover:underline"
              >
                Privacy settings
              </Link>
              .
            </p>
          )}
        </div>

        {missingTable ? (
          <div className="rounded-2xl border border-dashed border-white/15 px-6 py-10 text-center">
            <p className="text-base font-medium">Playlists not set up yet</p>
            <p className="mt-2 text-sm text-white/40">
              Run{" "}
              <code className="text-[#1DB954]">20260807_playlists.sql</code> in
              Supabase, then refresh.
            </p>
          </div>
        ) : (
          <form
            onSubmit={onCreate}
            className="flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New playlist name"
              maxLength={80}
              className="w-full flex-1 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm outline-none placeholder:text-white/30 focus:border-[#1DB954]/50"
            />
            <button
              type="submit"
              disabled={pending || !name.trim()}
              className="rounded-full bg-[#1DB954] px-5 py-2.5 text-sm font-semibold text-black hover:bg-[#17a349] disabled:opacity-50"
            >
              {pending ? "Creating…" : "Create"}
            </button>
          </form>
        )}

        {loadError || error ? (
          <p className="text-sm text-[#1DB954]" role="alert">
            {error || loadError}
          </p>
        ) : null}

        {publishNote ? (
          <p className="text-sm text-[#1DB954]">{publishNote}</p>
        ) : null}

        {!missingTable && playlists.length === 0 && !loadError ? (
          <div className="rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
            <p className="text-base font-medium">No playlists yet</p>
            <p className="mt-2 text-sm text-white/40">
              Create one above, then add tracks from song pages.
            </p>
          </div>
        ) : null}

        {playlists.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
              Yours
            </h2>
          <ul className="space-y-2">
            {playlists.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
              >
                <Link
                  href={`/playlists/${p.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
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
                  <p className="truncate font-medium hover:text-[#1DB954]">
                    {p.pinned_at ? (
                      <span className="mr-1.5 text-[#1DB954]" aria-hidden>
                        ▸
                      </span>
                    ) : null}
                    {p.name}
                    {p.is_public ? (
                      <span className="ml-2 text-xs font-normal text-[#1DB954]/80">
                        Public
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-white/40">
                    {p.track_count}{" "}
                    {p.track_count === 1 ? "track" : "tracks"}
                    {p.description
                      ? ` · ${p.description.slice(0, 80)}${
                          p.description.length > 80 ? "…" : ""
                        }`
                      : ""}
                  </p>
                  </span>
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  {playlistPreviewTracks[p.id] ? (
                    <InboxTrackPlay
                      track={playlistPreviewTracks[p.id]}
                      className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void onTogglePin(p)}
                    className={`rounded-full border px-3 py-1.5 text-xs ${
                      p.pinned_at
                        ? "border-[#1DB954]/50 text-[#1DB954]"
                        : "border-white/20 text-white/60 hover:bg-white/10"
                    }`}
                    aria-pressed={Boolean(p.pinned_at)}
                  >
                    {p.pinned_at ? "Pinned" : "Pin"}
                  </button>
                  <button
                    type="button"
                    disabled={privacyId === p.id}
                    onClick={() => void onTogglePublic(p)}
                    className={`rounded-full border px-3 py-1.5 text-xs disabled:opacity-50 ${
                      p.is_public
                        ? "border-[#1DB954]/50 text-[#1DB954]"
                        : "border-white/20 bg-[#1DB954]/15 text-[#1DB954] hover:bg-[#1DB954]/25"
                    }`}
                    aria-pressed={p.is_public}
                  >
                    {privacyId === p.id
                      ? "…"
                      : p.is_public
                        ? "Public"
                        : "Publish"}
                  </button>
                  <SharePlaylistButton
                    playlistId={p.id}
                    name={p.name}
                    isPublic={p.is_public}
                    isOwner
                    onBecamePublic={() => {
                      setPlaylists((list) =>
                        list.map((row) =>
                          row.id === p.id
                            ? { ...row, is_public: true }
                            : row,
                        ),
                      );
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => onDelete(p.id)}
                    className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
          </section>
        ) : null}

        {!collabMissing && collab.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
              Collaborating
            </h2>
            <ul className="space-y-2">
              {collab.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
                >
                  <Link
                    href={`/playlists/${p.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
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
                    <span className="min-w-0">
                      <span className="block truncate font-medium hover:text-[#1DB954]">
                        {p.name}
                      </span>
                      <span className="mt-0.5 block text-xs text-white/40">
                        {p.track_count}{" "}
                        {p.track_count === 1 ? "track" : "tracks"}
                        {" · "}
                        You can add tracks
                      </span>
                    </span>
                  </Link>
                  {playlistPreviewTracks[p.id] ? (
                    <InboxTrackPlay
                      track={playlistPreviewTracks[p.id]}
                      className="shrink-0 rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {!followsMissing && saved.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
              Saved
            </h2>
            <ul className="space-y-2">
              {saved.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
                >
                  <Link
                    href={`/playlists/${p.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
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
                          ★
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <p className="truncate font-medium hover:text-[#1DB954]">
                        {p.name}
                      </p>
                      <p className="truncate text-xs text-white/40">
                        {p.track_count}{" "}
                        {p.track_count === 1 ? "track" : "tracks"}
                        {p.owner_name ? ` · ${p.owner_name}` : ""}
                      </p>
                    </span>
                  </Link>
                  <div className="flex shrink-0 items-center gap-2">
                    {playlistPreviewTracks[p.id] ? (
                      <InboxTrackPlay
                        track={playlistPreviewTracks[p.id]}
                        className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
                      />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void onUnsave(p.id)}
                      className="rounded-full border border-[#1DB954]/40 px-3 py-1.5 text-xs text-[#1DB954] hover:bg-[#1DB954]/10"
                    >
                      Unsave
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {followsMissing ? (
          <p className="text-xs text-white/35">
            Run{" "}
            <code className="text-[#1DB954]">20260809_playlist_follows.sql</code>{" "}
            to save public playlists without copying them.
          </p>
        ) : null}
      </div>
    </main>
  );
}
