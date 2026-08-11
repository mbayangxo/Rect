"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  playlistId: string;
  personId: string;
  notificationId: number;
};

export function PlaylistCollabRequestActions({
  playlistId,
  personId,
  notificationId,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<"approved" | "invited" | "declined" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  async function markRead() {
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [notificationId] }),
    });
  }

  async function respond(approve: boolean) {
    if (pending || done) return;
    setPending(true);
    setError(null);
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
        // Soft-fail: approve SQL not run yet → invite hop / mark read
        if (res.status === 503 || data.code === "missing_table") {
          if (approve) {
            const inviteRes = await fetch(
              `/api/playlists/${playlistId}/collaborators`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "invite", user_id: personId }),
              },
            );
            const inviteData = (await inviteRes.json()) as { error?: string };
            if (!inviteRes.ok || inviteData.error) {
              setError(inviteData.error || data.error || "Could not approve");
              return;
            }
            await markRead();
            setDone("invited");
            router.refresh();
            return;
          }
          await markRead();
          setDone("declined");
          router.refresh();
          return;
        }
        setError(data.error || "Could not respond");
        return;
      }
      await markRead();
      setDone(approve ? "approved" : "declined");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  if (done === "approved") {
    return (
      <p className="mt-2 text-xs text-[#1DB954]">
        Approved — they’re a collaborator now.
      </p>
    );
  }
  if (done === "invited") {
    return (
      <p className="mt-2 text-xs text-[#1DB954]">
        Invited — run collab approve SQL for one-click accept.
      </p>
    );
  }
  if (done === "declined") {
    return <p className="mt-2 text-xs text-white/40">Declined</p>;
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => void respond(true)}
        className="rounded-full bg-[#1DB954] px-3 py-1 text-xs font-semibold text-black hover:bg-[#17a349] disabled:opacity-50"
      >
        {pending ? "…" : "Approve"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => void respond(false)}
        className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/60 hover:bg-white/10 disabled:opacity-50"
      >
        Decline
      </button>
      {error ? (
        <p className="w-full text-xs text-[#F5A623]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
