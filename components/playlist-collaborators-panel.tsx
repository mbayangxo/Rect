"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PeopleFollowButton } from "@/components/people-follow-button";
import type {
  PlaylistCollabAsk,
  PlaylistCollaborator,
} from "@/lib/dashboard/playlist-collaborators";
import type { ShareRecipient } from "@/lib/dashboard/shares";
import { personProfileHref } from "@/lib/dashboard/people";

type Props = {
  playlistId: string;
  initialCollaborators: PlaylistCollaborator[];
  initialAsks?: PlaylistCollabAsk[];
  collabReady: boolean;
  isOwner: boolean;
  isCollaborator: boolean;
  collabPending: boolean;
  followingPeople?: Record<string, boolean>;
  peopleFollowsReady?: boolean;
  currentUserId?: string | null;
};

export function PlaylistCollaboratorsPanel({
  playlistId,
  initialCollaborators,
  initialAsks = [],
  collabReady,
  isOwner,
  isCollaborator,
  collabPending,
  followingPeople = {},
  peopleFollowsReady = false,
  currentUserId = null,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [collaborators, setCollaborators] = useState(initialCollaborators);
  const [asks, setAsks] = useState(initialAsks);
  const [recipients, setRecipients] = useState<ShareRecipient[] | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [responding, setResponding] = useState(false);

  useEffect(() => {
    setCollaborators(initialCollaborators);
  }, [initialCollaborators]);

  useEffect(() => {
    setAsks(initialAsks);
  }, [initialAsks]);

  useEffect(() => {
    if (!open || !isOwner) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/shares");
        const data = (await res.json()) as {
          recipients?: ShareRecipient[];
          code?: string;
        };
        if (cancelled) return;
        if (res.status === 503 || data.code === "missing_table") {
          setRecipients([]);
          return;
        }
        setRecipients(data.recipients ?? []);
      } catch {
        if (!cancelled) setRecipients([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, isOwner]);

  async function invite(person: ShareRecipient) {
    if (pendingId) return;
    setPendingId(person.id);
    setError(null);
    try {
      const res = await fetch(`/api/playlists/${playlistId}/collaborators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "invite", user_id: person.id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setError(data.error || "Could not invite");
        return;
      }
      setCollaborators((list) => {
        if (list.some((c) => c.user_id === person.id)) return list;
        return [
          ...list,
          {
            user_id: person.id,
            display_name: person.display_name,
            avatar_url: person.avatar_url,
            status: "pending",
            created_at: new Date().toISOString(),
          },
        ];
      });
      setAsks((list) => list.filter((a) => a.user_id !== person.id));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPendingId(null);
    }
  }

  async function resolveAsk(personId: string, approve: boolean) {
    if (pendingId) return;
    setPendingId(personId);
    setError(null);
    const prevAsks = asks;
    const asker = asks.find((a) => a.user_id === personId);
    setAsks((list) => list.filter((a) => a.user_id !== personId));
    try {
      const res = await fetch(`/api/playlists/${playlistId}/collaborators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: approve ? "approve_request" : "decline_request",
          user_id: personId,
        }),
      });
      const data = (await res.json()) as { error?: string; code?: string };
      if (!res.ok || data.error) {
        setAsks(prevAsks);
        setError(data.error || "Could not respond");
        return;
      }
      if (approve && asker) {
        setCollaborators((list) => {
          if (list.some((c) => c.user_id === personId)) {
            return list.map((c) =>
              c.user_id === personId ? { ...c, status: "accepted" as const } : c,
            );
          }
          return [
            ...list,
            {
              user_id: asker.user_id,
              display_name: asker.display_name,
              avatar_url: asker.avatar_url,
              status: "accepted" as const,
              created_at: asker.created_at,
            },
          ];
        });
      }
      router.refresh();
    } catch (e) {
      setAsks(prevAsks);
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPendingId(null);
    }
  }

  async function remove(userId: string) {
    if (pendingId) return;
    setPendingId(userId);
    setError(null);
    const prev = collaborators;
    setCollaborators((list) => list.filter((c) => c.user_id !== userId));
    try {
      const res = await fetch(`/api/playlists/${playlistId}/collaborators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", user_id: userId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setCollaborators(prev);
        setError(data.error || "Could not remove");
        return;
      }
      router.refresh();
    } catch (e) {
      setCollaborators(prev);
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPendingId(null);
    }
  }

  async function respond(accept: boolean) {
    if (responding) return;
    setResponding(true);
    setError(null);
    try {
      const res = await fetch(`/api/playlists/${playlistId}/collaborators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: accept ? "accept" : "decline" }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setError(data.error || "Could not respond");
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setResponding(false);
    }
  }

  async function leave() {
    if (responding) return;
    setResponding(true);
    setError(null);
    try {
      const res = await fetch(`/api/playlists/${playlistId}/collaborators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "leave" }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setError(data.error || "Could not leave");
        return;
      }
      router.push("/playlists");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setResponding(false);
    }
  }

  if (!collabReady) {
    return (
      <p className="text-xs text-white/35">
        Run{" "}
        <code className="text-[#1DB954]">20260809_playlist_collaborators.sql</code>{" "}
        to invite collaborators.
      </p>
    );
  }

  if (collabPending) {
    return (
      <div className="rounded-xl border border-[#1DB954]/30 bg-[#1DB954]/10 px-4 py-3">
        <p className="text-sm text-white/80">
          You’ve been invited to add tracks to this mix.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={responding}
            onClick={() => void respond(true)}
            className="rounded-full bg-[#1DB954] px-4 py-1.5 text-xs font-semibold text-black hover:bg-[#17a349] disabled:opacity-50"
          >
            {responding ? "…" : "Accept"}
          </button>
          <button
            type="button"
            disabled={responding}
            onClick={() => void respond(false)}
            className="rounded-full border border-white/20 px-4 py-1.5 text-xs text-white/70 hover:bg-white/10 disabled:opacity-50"
          >
            Decline
          </button>
        </div>
        {error ? (
          <p className="mt-2 text-xs text-[#F5A623]" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (isCollaborator && !isOwner) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-white/45">You’re a collaborator on this mix</p>
        <button
          type="button"
          disabled={responding}
          onClick={() => void leave()}
          className="text-xs text-white/40 hover:text-white/70 disabled:opacity-50"
        >
          Leave
        </button>
        {error ? (
          <p className="w-full text-xs text-[#F5A623]" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (!isOwner) return null;

  const invitedIds = new Set(collaborators.map((c) => c.user_id));
  const askIds = new Set(asks.map((a) => a.user_id));
  const invitees = (recipients ?? []).filter(
    (r) => !invitedIds.has(r.id) && !askIds.has(r.id),
  );

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
          Collaborators
        </h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 hover:bg-white/10"
        >
          {open ? "Close" : "Invite"}
        </button>
      </div>

      {asks.length > 0 ? (
        <div className="mb-4">
          <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-white/40">
            Asks to collab
          </p>
          <ul className="space-y-2">
            {asks.map((a) => (
              <li
                key={a.user_id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-[#1DB954]/25 bg-[#1DB954]/[0.07] px-3 py-2"
              >
                <Link
                  href={personProfileHref(a.user_id)}
                  className="flex min-w-0 flex-1 items-center gap-2 hover:text-[#1DB954]"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.06] text-[0.6rem] text-white/40">
                    {a.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.avatar_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      (a.display_name.slice(0, 1) || "?").toUpperCase()
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {a.display_name}
                    </span>
                    <span className="text-xs text-white/40">
                      Wants to add tracks
                    </span>
                  </span>
                </Link>
                <div className="flex flex-wrap items-center gap-2">
                  {a.user_id !== currentUserId && peopleFollowsReady ? (
                    <PeopleFollowButton
                      personId={a.user_id}
                      initialFollowing={Boolean(followingPeople[a.user_id])}
                      initialCount={0}
                      followsReady={peopleFollowsReady}
                      showCount={false}
                      compact
                      idleLabel="Follow"
                      className="shrink-0"
                      loginNext={`/playlists/${playlistId}`}
                    />
                  ) : null}
                  <button
                    type="button"
                    disabled={pendingId != null}
                    onClick={() => void resolveAsk(a.user_id, true)}
                    className="rounded-full bg-[#1DB954] px-3 py-1 text-xs font-semibold text-black hover:bg-[#17a349] disabled:opacity-50"
                  >
                    {pendingId === a.user_id ? "…" : "Approve"}
                  </button>
                  <button
                    type="button"
                    disabled={pendingId != null}
                    onClick={() => void resolveAsk(a.user_id, false)}
                    className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/60 hover:bg-white/10 disabled:opacity-50"
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {collaborators.length === 0 && asks.length === 0 ? (
        <p className="text-sm text-white/40">
          Invite friends you follow to add tracks — or wait for asks.
        </p>
      ) : collaborators.length > 0 ? (
        <ul className="space-y-2">
          {collaborators.map((c) => (
            <li
              key={c.user_id}
              className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2"
            >
              <Link
                href={personProfileHref(c.user_id)}
                className="flex min-w-0 flex-1 items-center gap-2 hover:text-[#1DB954]"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.06] text-[0.6rem] text-white/40">
                  {c.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.avatar_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    (c.display_name.slice(0, 1) || "?").toUpperCase()
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {c.display_name}
                  </span>
                  <span className="text-xs text-white/40">
                    {c.status === "accepted"
                      ? "Can add tracks"
                      : "Invite pending"}
                  </span>
                </span>
              </Link>
              {c.user_id !== currentUserId && peopleFollowsReady ? (
                <PeopleFollowButton
                  personId={c.user_id}
                  initialFollowing={Boolean(followingPeople[c.user_id])}
                  initialCount={0}
                  followsReady={peopleFollowsReady}
                  showCount={false}
                  compact
                  idleLabel="Follow"
                  className="shrink-0"
                  loginNext={`/playlists/${playlistId}`}
                />
              ) : null}
              <button
                type="button"
                disabled={pendingId != null}
                onClick={() => void remove(c.user_id)}
                className="text-xs text-white/35 hover:text-white/70 disabled:opacity-50"
              >
                {pendingId === c.user_id ? "…" : "Remove"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3">
          <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-white/40">
            Invite from Following
          </p>
          {recipients == null ? (
            <p className="text-xs text-white/40">Loading…</p>
          ) : invitees.length === 0 ? (
            <p className="text-xs text-white/45">
              Follow people first, or everyone is already invited.{" "}
              <Link href="/following" className="text-[#1DB954] hover:underline">
                Following
              </Link>
            </p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {invitees.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={pendingId != null}
                    onClick={() => void invite(p)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/10 disabled:opacity-50"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {pendingId === p.id ? "…" : p.display_name}
                    </span>
                    <span className="text-xs text-[#1DB954]">Invite</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {error ? (
        <p className="mt-2 text-xs text-[#F5A623]" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
