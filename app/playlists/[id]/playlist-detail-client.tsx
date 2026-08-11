"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FollowPlaylistButton } from "@/components/follow-playlist-button";
import { AskToCollabButton } from "@/components/ask-to-collab-button";
import { AddToPlaylist } from "@/components/add-to-playlist";
import { PeopleFollowButton } from "@/components/people-follow-button";
import { PlaylistCollaboratorsPanel } from "@/components/playlist-collaborators-panel";
import { PlaylistComments } from "@/components/playlist-comments";
import { usePlayer } from "@/components/player-provider";
import { QueueTrackButton } from "@/components/queue-track-button";
import { RectLogo } from "@/components/rect-logo";
import { ShareTrackButton } from "@/components/share-track-button";
import { TrackCover } from "@/components/track-cover";
import { TrackLikeButton } from "@/components/track-like-button";
import { personProfileHref } from "@/lib/dashboard/people";
import type {
  PlaylistCollabAsk,
  PlaylistCollaborator,
} from "@/lib/dashboard/playlist-collaborators";
import type { PlaylistComment } from "@/lib/dashboard/playlist-comments";
import type { PlaylistSaver } from "@/lib/dashboard/playlist-follows";
import type { PlaylistDetail } from "@/lib/dashboard/playlists";
import { trackArtist, trackTitle } from "@/lib/tracks";

type Props = {
  playlist: PlaylistDetail | null;
  loadError: string | null;
  missingTable: boolean;
  initialFollowing?: boolean;
  followerCount?: number;
  followsReady?: boolean;
  savers?: PlaylistSaver[];
  saversError?: string | null;
  saversMissingTable?: boolean;
  friendsSavers?: PlaylistSaver[];
  followingPeople?: Record<string, boolean>;
  peopleFollowsReady?: boolean;
  collaborators?: PlaylistCollaborator[];
  collabReady?: boolean;
  askPending?: boolean;
  collabAsks?: PlaylistCollabAsk[];
  comments?: PlaylistComment[];
  commentsMissing?: boolean;
  commentsError?: string | null;
  commentsLikesReady?: boolean;
  signedIn?: boolean;
  currentUserId?: string | null;
  likedTracks?: Record<string, boolean>;
  likesReady?: boolean;
};

export function PlaylistDetailClient({
  playlist: initial,
  loadError,
  missingTable,
  initialFollowing = false,
  followerCount = 0,
  followsReady = false,
  savers = [],
  saversError = null,
  saversMissingTable = false,
  friendsSavers = [],
  followingPeople = {},
  peopleFollowsReady = false,
  collaborators = [],
  collabReady = false,
  askPending = false,
  collabAsks = [],
  comments = [],
  commentsMissing = false,
  commentsError = null,
  commentsLikesReady = false,
  signedIn = false,
  currentUserId = null,
  likedTracks = {},
  likesReady = false,
}: Props) {
  const router = useRouter();
  const player = usePlayer();
  const [playlist, setPlaylist] = useState(initial);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(initial?.name ?? "");
  const [renaming, setRenaming] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(initial?.description ?? "");
  const [savingDesc, setSavingDesc] = useState(false);
  const [shareStatus, setShareStatus] = useState<
    "idle" | "copied" | "error"
  >("idle");
  const [privacyPending, setPrivacyPending] = useState(false);
  const [publishNote, setPublishNote] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setPlaylist(initial);
    if (initial && !editing) {
      setNameDraft(initial.name);
    }
    if (initial && !editingDesc) {
      setDescDraft(initial.description ?? "");
    }
  }, [initial, editing, editingDesc]);

  if (missingTable) {
    return (
      <main className="min-h-dvh bg-[#040d06] px-5 py-16 text-center text-[#f8f8f8]">
        <p className="text-base font-medium">Playlists not set up yet</p>
        <p className="mt-2 text-sm text-white/40">
          Run <code className="text-[#1DB954]">20260807_playlists.sql</code> in
          Supabase.
        </p>
        <Link href="/playlists" className="mt-6 inline-block text-[#1DB954]">
          Back
        </Link>
      </main>
    );
  }

  if (!playlist) {
    return (
      <main className="min-h-dvh bg-[#040d06] px-5 py-16 text-center text-[#f8f8f8]">
        <p>{loadError || "Playlist not found"}</p>
        <Link href="/playlists" className="mt-6 inline-block text-[#1DB954]">
          Back
        </Link>
      </main>
    );
  }

  const isOwner = playlist.is_owner;
  const canEdit = playlist.can_edit ?? isOwner;
  const isCollaborator = playlist.is_collaborator ?? false;
  const collabPending = playlist.collab_pending ?? false;

  async function removeTrack(trackId: string) {
    if (!playlist) return;
    const row = playlist.tracks.find((t) => t.id === trackId);
    if (!row?.can_remove && !playlist.is_owner) return;
    setPendingId(trackId);
    setError(null);
    const prev = playlist;
    setPlaylist({
      ...playlist,
      tracks: playlist.tracks.filter((t) => t.id !== trackId),
      track_count: Math.max(0, playlist.track_count - 1),
    });
    try {
      const res = await fetch(`/api/playlists/${playlist.id}/tracks`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track_id: trackId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setPlaylist(prev);
        setError(data.error || "Could not remove track");
        return;
      }
      router.refresh();
    } catch (e) {
      setPlaylist(prev);
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPendingId(null);
    }
  }

  async function moveTrack(trackId: string, direction: "up" | "down") {
    if (!playlist || !playlist.is_owner || reordering) return;
    const idx = playlist.tracks.findIndex((t) => t.id === trackId);
    if (idx < 0) return;
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= playlist.tracks.length) return;

    setReordering(true);
    setError(null);
    const prev = playlist;
    const nextTracks = [...playlist.tracks];
    const tmp = nextTracks[idx];
    nextTracks[idx] = nextTracks[swapWith];
    nextTracks[swapWith] = tmp;
    setPlaylist({ ...playlist, tracks: nextTracks });

    try {
      const res = await fetch(`/api/playlists/${playlist.id}/tracks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track_id: trackId, direction }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setPlaylist(prev);
        setError(data.error || "Could not reorder");
        return;
      }
      router.refresh();
    } catch (e) {
      setPlaylist(prev);
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setReordering(false);
    }
  }

  async function saveRename() {
    if (!playlist || renaming || !playlist.is_owner) return;
    const next = nameDraft.trim().slice(0, 80);
    if (!next) {
      setError("Name is required");
      return;
    }
    if (next === playlist.name) {
      setEditing(false);
      return;
    }

    setRenaming(true);
    setError(null);
    const prevName = playlist.name;
    setPlaylist({ ...playlist, name: next });

    try {
      const res = await fetch(`/api/playlists/${playlist.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: next }),
      });
      const data = (await res.json()) as { error?: string; name?: string };
      if (!res.ok || data.error) {
        setPlaylist({ ...playlist, name: prevName });
        setError(data.error || "Could not rename playlist");
        return;
      }
      setPlaylist({ ...playlist, name: data.name || next });
      setNameDraft(data.name || next);
      setEditing(false);
      router.refresh();
    } catch (e) {
      setPlaylist({ ...playlist, name: prevName });
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setRenaming(false);
    }
  }

  async function saveDescription() {
    if (!playlist || savingDesc || !playlist.is_owner) return;
    const next = descDraft.trim().slice(0, 280);
    const prev = playlist.description;
    if ((prev ?? "") === next) {
      setEditingDesc(false);
      return;
    }

    setSavingDesc(true);
    setError(null);
    setPlaylist({ ...playlist, description: next || null });

    try {
      const res = await fetch(`/api/playlists/${playlist.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: next || null }),
      });
      const data = (await res.json()) as {
        error?: string;
        description?: string | null;
      };
      if (!res.ok || data.error) {
        setPlaylist({ ...playlist, description: prev });
        setError(data.error || "Could not save description");
        return;
      }
      const saved =
        typeof data.description === "string" ? data.description : null;
      setPlaylist({ ...playlist, description: saved });
      setDescDraft(saved ?? "");
      setEditingDesc(false);
      router.refresh();
    } catch (e) {
      setPlaylist({ ...playlist, description: prev });
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSavingDesc(false);
    }
  }

  async function setPublic(nextPublic: boolean): Promise<boolean> {
    if (!playlist || !playlist.is_owner || privacyPending) return false;
    if (nextPublic && playlist.tracks.length < 1) {
      setError(
        "Add at least one track before making this mix public — empty mixes stay private.",
      );
      return false;
    }
    setPrivacyPending(true);
    setError(null);
    setPublishNote(null);
    const prev = playlist.is_public;
    setPlaylist({ ...playlist, is_public: nextPublic });
    try {
      const res = await fetch(`/api/playlists/${playlist.id}`, {
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
        setPlaylist({ ...playlist, is_public: prev });
        setError(data.error || "Could not update visibility");
        return false;
      }
      setPlaylist({
        ...playlist,
        is_public: data.is_public ?? nextPublic,
      });
      if (nextPublic && data.became_public) {
        const n = Number(data.notified) || 0;
        setPublishNote(
          n === 0
            ? "Public — no people-followers to notify yet"
            : `Public — notified ${n} friend${n === 1 ? "" : "s"}`,
        );
      } else if (!nextPublic) {
        setPublishNote("Back to private");
      }
      router.refresh();
      return true;
    } catch (e) {
      setPlaylist({ ...playlist, is_public: prev });
      setError(e instanceof Error ? e.message : "Network error");
      return false;
    } finally {
      setPrivacyPending(false);
    }
  }

  async function sharePlaylist() {
    if (!playlist) return;
    const url = `${window.location.origin}/playlists/${playlist.id}`;
    const title = playlist.name;
    const text = `${playlist.name} on RECT SOUND`;

    if (playlist.is_owner && !playlist.is_public) {
      const ok = await setPublic(true);
      if (!ok) return;
    }

    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, text, url });
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setShareStatus("copied");
      window.setTimeout(() => setShareStatus("idle"), 2000);
    } catch {
      setShareStatus("error");
      window.setTimeout(() => setShareStatus("idle"), 2500);
    }
  }

  async function deletePlaylist() {
    if (!playlist || !playlist.is_owner || deleting) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/playlists/${playlist.id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setError(data.error || "Could not delete playlist");
        setConfirmDelete(false);
        return;
      }
      router.push("/playlists");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  async function duplicateThis() {
    if (!playlist || duplicating) return;
    setDuplicating(true);
    setError(null);
    try {
      const res = await fetch(`/api/playlists/${playlist.id}/duplicate`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        error?: string;
        playlist?: { id: string };
        authenticated?: boolean;
      };
      if (res.status === 401) {
        router.push(
          `/auth/login?next=${encodeURIComponent(`/playlists/${playlist.id}`)}`,
        );
        return;
      }
      if (!res.ok || data.error || !data.playlist?.id) {
        setError(data.error || "Could not duplicate playlist");
        return;
      }
      router.push(`/playlists/${data.playlist.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setDuplicating(false);
    }
  }

  async function uploadCover(file: File) {
    if (!playlist || !playlist.is_owner || coverBusy) return;
    setCoverBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("cover", file);
      const res = await fetch(`/api/playlists/${playlist.id}/cover`, {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as {
        error?: string;
        cover_art_url?: string;
      };
      if (!res.ok || data.error || !data.cover_art_url) {
        setError(data.error || "Could not upload cover");
        return;
      }
      setPlaylist({ ...playlist, cover_art_url: data.cover_art_url });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setCoverBusy(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  }

  async function removeCover() {
    if (!playlist || !playlist.is_owner || coverBusy || !playlist.cover_art_url)
      return;
    setCoverBusy(true);
    setError(null);
    const prev = playlist.cover_art_url;
    setPlaylist({ ...playlist, cover_art_url: null });
    try {
      const res = await fetch(`/api/playlists/${playlist.id}/cover`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setPlaylist({ ...playlist, cover_art_url: prev });
        setError(data.error || "Could not remove cover");
        return;
      }
      router.refresh();
    } catch (e) {
      setPlaylist({ ...playlist, cover_art_url: prev });
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setCoverBusy(false);
    }
  }

  const playable = playlist.tracks.filter((t) => t.audio_url);
  const displayCover =
    playlist.cover_art_url ||
    playlist.tracks.find((t) => t.cover_art_url)?.cover_art_url ||
    null;

  return (
    <main className="min-h-dvh bg-[#040d06] pb-28 text-[#f8f8f8]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/dashboard">
            <RectLogo size={34} showWordmark />
          </Link>
          <nav className="flex gap-4 text-sm text-white/55">
            <Link href="/playlists" className="hover:text-white">
              Playlists
            </Link>
            <Link href="/library" className="hover:text-white">
              Liked
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl space-y-8 px-5 py-10 sm:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="shrink-0">
            <div className="relative h-40 w-40 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] sm:h-48 sm:w-48">
              {displayCover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={displayCover}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-4xl text-white/20">
                  ♫
                </div>
              )}
            </div>
            {isOwner ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadCover(file);
                  }}
                />
                <button
                  type="button"
                  disabled={coverBusy}
                  onClick={() => coverInputRef.current?.click()}
                  className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 disabled:opacity-50"
                >
                  {coverBusy
                    ? "…"
                    : playlist.cover_art_url
                      ? "Replace cover"
                      : "Add cover"}
                </button>
                {playlist.cover_art_url ? (
                  <button
                    type="button"
                    disabled={coverBusy}
                    onClick={() => void removeCover()}
                    className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/45 hover:border-red-400/40 hover:text-red-300 disabled:opacity-50"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
            Playlist
            {playlist.is_public ? " · Public" : isOwner ? " · Private" : ""}
            {isCollaborator ? " · Collaborator" : ""}
            {collabPending ? " · Invite" : ""}
            {followerCount > 0
              ? ` · ${followerCount} ${followerCount === 1 ? "save" : "saves"}`
              : ""}
          </p>
          {editing && isOwner ? (
            <form
              className="mt-3 flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void saveRename();
              }}
            >
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={80}
                autoFocus
                disabled={renaming}
                className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight text-white outline-none focus:border-[#1DB954]/50 sm:text-3xl"
                aria-label="Playlist name"
              />
              <button
                type="submit"
                disabled={renaming}
                className="rounded-full bg-[#1DB954] px-4 py-2 text-sm font-semibold text-black hover:bg-[#17a349] disabled:opacity-50"
              >
                {renaming ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                disabled={renaming}
                onClick={() => {
                  setNameDraft(playlist.name);
                  setEditing(false);
                  setError(null);
                }}
                className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/70 hover:bg-white/10 disabled:opacity-50"
              >
                Cancel
              </button>
            </form>
          ) : (
            <div className="mt-2 flex flex-wrap items-baseline gap-3">
              <h1 className="font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight sm:text-4xl">
                {playlist.name}
              </h1>
              {isOwner ? (
                <button
                  type="button"
                  onClick={() => {
                    setNameDraft(playlist.name);
                    setEditing(true);
                  }}
                  className="text-sm text-white/45 hover:text-[#1DB954]"
                >
                  Rename
                </button>
              ) : null}
            </div>
          )}
          <p className="mt-2 text-sm text-white/45">
            {playlist.track_count}{" "}
            {playlist.track_count === 1 ? "track" : "tracks"}
          </p>

          {editingDesc && isOwner ? (
            <form
              className="mt-3 space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                void saveDescription();
              }}
            >
              <textarea
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                maxLength={280}
                rows={3}
                disabled={savingDesc}
                placeholder="What’s this mix about?"
                className="w-full resize-y rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm text-white/85 outline-none placeholder:text-white/30 focus:border-[#1DB954]/50"
                aria-label="Playlist description"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={savingDesc}
                  className="rounded-full bg-[#1DB954] px-4 py-2 text-sm font-semibold text-black hover:bg-[#17a349] disabled:opacity-50"
                >
                  {savingDesc ? "Saving…" : "Save description"}
                </button>
                <button
                  type="button"
                  disabled={savingDesc}
                  onClick={() => {
                    setDescDraft(playlist.description ?? "");
                    setEditingDesc(false);
                    setError(null);
                  }}
                  className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/70 hover:bg-white/10 disabled:opacity-50"
                >
                  Cancel
                </button>
                <span className="text-xs text-white/35">
                  {descDraft.trim().length}/280
                </span>
              </div>
            </form>
          ) : (
            <div className="mt-3">
              {playlist.description ? (
                <p className="max-w-2xl text-sm leading-relaxed text-white/60">
                  {playlist.description}
                </p>
              ) : isOwner ? (
                <p className="text-sm text-white/35">No description yet</p>
              ) : null}
              {isOwner ? (
                <button
                  type="button"
                  onClick={() => {
                    setDescDraft(playlist.description ?? "");
                    setEditingDesc(true);
                  }}
                  className="mt-1 text-sm text-white/45 hover:text-[#1DB954]"
                >
                  {playlist.description ? "Edit description" : "Add description"}
                </button>
              ) : null}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2">
          {playable.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => player.playQueue(playable, 0)}
                className="rounded-full bg-[#1DB954] px-5 py-2.5 text-sm font-semibold text-black hover:bg-[#17a349]"
              >
                ▶ Play all
              </button>
              <button
                type="button"
                onClick={() =>
                  player.playQueue(playable, 0, {
                    shuffle: true,
                    repeat: true,
                  })
                }
                className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10"
              >
                ⇄ Shuffle
              </button>
            </>
          ) : null}
            <button
              type="button"
              onClick={() => void sharePlaylist()}
              disabled={privacyPending}
              className="rounded-full border border-white/20 px-4 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10 disabled:opacity-50"
            >
              {shareStatus === "copied"
                ? "Link copied"
                : shareStatus === "error"
                  ? "Could not copy"
                  : "Share"}
            </button>
            {isOwner && !playlist.is_public ? (
              <button
                type="button"
                disabled={privacyPending || playlist.tracks.length < 1}
                onClick={() => void setPublic(true)}
                className="rounded-full bg-[#1DB954] px-4 py-2.5 text-sm font-semibold text-black hover:bg-[#17a349] disabled:opacity-50"
                title={
                  playlist.tracks.length < 1
                    ? "Add tracks before publishing"
                    : undefined
                }
              >
                {privacyPending
                  ? "…"
                  : playlist.tracks.length < 1
                    ? "Add tracks to publish"
                    : "Publish for friends"}
              </button>
            ) : null}
            {isOwner && playlist.is_public ? (
              <button
                type="button"
                disabled={privacyPending}
                onClick={() => void setPublic(false)}
                className="rounded-full border border-white/20 px-4 py-2.5 text-sm text-white/55 hover:bg-white/10 disabled:opacity-50"
              >
                {privacyPending ? "…" : "Make private"}
              </button>
            ) : null}
            {!isOwner && playlist.is_public ? (
              <FollowPlaylistButton
                playlistId={playlist.id}
                initialFollowing={initialFollowing}
                initialCount={followerCount}
                followsReady={followsReady}
                loginNext={`/playlists/${playlist.id}`}
              />
            ) : null}
            {!isOwner &&
            !isCollaborator &&
            !collabPending &&
            playlist.is_public ? (
              <AskToCollabButton
                playlistId={playlist.id}
                collabReady={collabReady}
                signedIn={signedIn}
                loginNext={`/playlists/${playlist.id}`}
                askPending={askPending}
              />
            ) : null}
            <button
              type="button"
              disabled={duplicating}
              onClick={() => void duplicateThis()}
              className="rounded-full border border-white/20 px-4 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10 disabled:opacity-50"
            >
              {duplicating
                ? "Copying…"
                : isOwner
                  ? "Duplicate"
                  : "Make a copy"}
            </button>
            {isOwner ? (
              <button
                type="button"
                disabled={deleting}
                onClick={() => void deletePlaylist()}
                onBlur={() => {
                  if (!deleting) setConfirmDelete(false);
                }}
                className="rounded-full border border-white/20 px-4 py-2.5 text-sm text-white/45 hover:border-red-400/40 hover:text-red-300 disabled:opacity-50"
              >
                {deleting
                  ? "Deleting…"
                  : confirmDelete
                    ? "Confirm delete"
                    : "Delete"}
              </button>
            ) : null}
          </div>
          </div>
        </div>

        {loadError || error ? (
          <p className="text-sm text-[#1DB954]" role="alert">
            {error || loadError}
          </p>
        ) : null}

        {publishNote ? (
          <p className="text-sm text-[#1DB954]">{publishNote}</p>
        ) : null}

        {isOwner || isCollaborator || collabPending ? (
          <PlaylistCollaboratorsPanel
            playlistId={playlist.id}
            initialCollaborators={collaborators}
            initialAsks={collabAsks}
            collabReady={collabReady}
            isOwner={isOwner}
            isCollaborator={isCollaborator}
            collabPending={collabPending}
            followingPeople={followingPeople}
            peopleFollowsReady={peopleFollowsReady}
            currentUserId={currentUserId}
          />
        ) : null}

        {friendsSavers.length > 0 ? (
          <section className="mt-2">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
              Saved by friends
            </h2>
            <ul className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]">
              {friendsSavers.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3 text-sm last:border-b-0"
                >
                  <Link
                    href={personProfileHref(s.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 hover:text-[#1DB954]"
                  >
                    <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/[0.04]">
                      {s.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={s.avatar_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-[0.65rem] font-semibold text-[#1DB954]/70">
                          {(s.display_name.trim().slice(0, 2) || "LI").toUpperCase()}
                        </span>
                      )}
                    </span>
                    <span className="truncate font-medium">{s.display_name}</span>
                  </Link>
                  {s.id !== currentUserId && peopleFollowsReady ? (
                    <PeopleFollowButton
                      personId={s.id}
                      initialFollowing={Boolean(followingPeople[s.id])}
                      initialCount={0}
                      followsReady={peopleFollowsReady}
                      showCount={false}
                      compact
                      idleLabel="Follow"
                      className="shrink-0"
                      loginNext={playlist ? `/playlists/${playlist.id}` : "/playlists"}
                    />
                  ) : null}
                  <span className="shrink-0 text-xs text-white/35">
                    {s.saved_at
                      ? new Date(s.saved_at).toLocaleDateString()
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {isOwner ? (
          <section className="mt-2">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
              Saved by
            </h2>
            {saversMissingTable ? (
              <p className="text-xs text-white/35">
                Run{" "}
                <code className="text-[#1DB954]">
                  20260809_playlist_follows.sql
                </code>{" "}
                (and{" "}
                <code className="text-[#1DB954]">
                  20260809_playlist_savers_roster.sql
                </code>
                ) to see who saved this mix.
              </p>
            ) : saversError ? (
              <p className="text-sm text-[#1DB954]">{saversError}</p>
            ) : savers.length === 0 ? (
              <p className="text-sm text-white/40">
                {followerCount > 0
                  ? "Saves exist — run 20260809_playlist_savers_roster.sql if the list stays empty."
                  : "No saves yet. Share a public link so fans can bookmark it."}
              </p>
            ) : (
              <ul className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]">
                {savers.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3 text-sm last:border-b-0"
                  >
                    <Link
                      href={personProfileHref(s.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 hover:text-[#1DB954]"
                    >
                      <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/[0.04]">
                        {s.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={s.avatar_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-[0.65rem] font-semibold text-[#1DB954]/70">
                            {(s.display_name.trim().slice(0, 2) || "LI").toUpperCase()}
                          </span>
                        )}
                      </span>
                      <span className="truncate font-medium">{s.display_name}</span>
                    </Link>
                    {s.id !== currentUserId && peopleFollowsReady ? (
                      <PeopleFollowButton
                        personId={s.id}
                        initialFollowing={Boolean(followingPeople[s.id])}
                        initialCount={0}
                        followsReady={peopleFollowsReady}
                        showCount={false}
                        compact
                        idleLabel="Follow"
                        className="shrink-0"
                        loginNext={
                          playlist ? `/playlists/${playlist.id}` : "/playlists"
                        }
                      />
                    ) : null}
                    <span className="shrink-0 text-xs text-white/35">
                      {s.saved_at
                        ? new Date(s.saved_at).toLocaleDateString()
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {playlist.tracks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
            <p className="text-base font-medium">Empty playlist</p>
            <p className="mt-2 text-sm text-white/40">
              {canEdit
                ? "Open a song and tap Add to playlist."
                : "This shared playlist has no published tracks yet."}
            </p>
            {canEdit ? (
              <Link
                href="/search"
                className="mt-6 inline-block text-sm text-[#1DB954] hover:underline"
              >
                Find tracks
              </Link>
            ) : null}
          </div>
        ) : (
          <ul className="space-y-1 rounded-2xl border border-white/10 bg-white/[0.03] p-2 md:p-3">
            {playlist.tracks.map((t, i) => (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-white/[0.06]"
              >
                <span className="w-5 shrink-0 text-xs text-white/35">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    disabled={!t.audio_url}
                    onClick={() => {
                      if (!t.audio_url) return;
                      const idx = playable.findIndex((x) => x.id === t.id);
                      player.playQueue(playable, idx >= 0 ? idx : 0);
                    }}
                    className="flex w-full min-w-0 items-center gap-3 text-left disabled:opacity-40"
                  >
                    <TrackCover track={t} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {trackTitle(t)}
                      </p>
                      <p className="truncate text-xs text-white/40">
                        {trackArtist(t)}
                      </p>
                    </div>
                  </button>
                  {t.added_by &&
                  t.added_by_name &&
                  playlist.owner_id &&
                  t.added_by !== playlist.owner_id ? (
                    <p className="mt-0.5 pl-[3.25rem] text-[0.65rem] text-white/30">
                      Added by{" "}
                      <Link
                        href={personProfileHref(t.added_by)}
                        className="hover:text-[#1DB954]"
                      >
                        {t.added_by_name}
                      </Link>
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <AddToPlaylist
                    trackId={t.id}
                    compact
                    loginNext={`/playlists/${playlist.id}`}
                  />
                  <TrackLikeButton
                    trackId={t.id}
                    initialLiked={Boolean(likedTracks[t.id])}
                    likesReady={likesReady}
                    loginNext={`/playlists/${playlist.id}`}
                    compact
                  />
                  <QueueTrackButton track={t} compact />
                  <ShareTrackButton track={t} compact />
                </div>
                {isOwner || t.can_remove ? (
                  <div className="flex shrink-0 items-center gap-1">
                    {isOwner ? (
                      <>
                        <button
                          type="button"
                          disabled={reordering || i === 0}
                          onClick={() => void moveTrack(t.id, "up")}
                          className="rounded-full border border-white/20 px-2 py-1 text-xs text-white/55 hover:bg-white/10 disabled:opacity-30"
                          aria-label="Move up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={
                            reordering || i === playlist.tracks.length - 1
                          }
                          onClick={() => void moveTrack(t.id, "down")}
                          className="rounded-full border border-white/20 px-2 py-1 text-xs text-white/55 hover:bg-white/10 disabled:opacity-30"
                          aria-label="Move down"
                        >
                          ↓
                        </button>
                      </>
                    ) : null}
                    {t.can_remove || isOwner ? (
                      <button
                        type="button"
                        disabled={pendingId === t.id || reordering}
                        onClick={() => removeTrack(t.id)}
                        className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/55 hover:bg-white/10 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <Link
                    href={`/songs/${t.id}`}
                    className="shrink-0 text-xs text-white/40 hover:text-[#1DB954]"
                  >
                    Open
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}

        <PlaylistComments
          playlistId={playlist.id}
          initialComments={comments}
          missingTable={commentsMissing}
          loadError={commentsError}
          signedIn={signedIn}
          currentUserId={currentUserId}
          isOwner={isOwner}
          loginNext={`/playlists/${playlist.id}`}
          canComment={playlist.is_public || isOwner || isCollaborator}
          likesReady={commentsLikesReady}
        />
      </div>
    </main>
  );
}
