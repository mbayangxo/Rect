"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  playlistId: string;
};

export function PlaylistCollabInviteActions({ playlistId }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<"accepted" | "declined" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function respond(accept: boolean) {
    if (pending || done) return;
    setPending(true);
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
      setDone(accept ? "accepted" : "declined");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  if (done === "accepted") {
    return (
      <p className="mt-2 text-xs text-[#1DB954]">
        Accepted — you can add tracks now.
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
        {pending ? "…" : "Accept"}
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
