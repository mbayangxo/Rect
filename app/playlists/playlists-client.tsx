"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { RectLogo } from "@/components/rect-logo";
import type { PlaylistSummary } from "@/lib/dashboard/playlists";

type Props = {
  initialPlaylists: PlaylistSummary[];
  loadError: string | null;
  missingTable: boolean;
};

export function PlaylistsClient({
  initialPlaylists,
  loadError,
  missingTable,
}: Props) {
  const router = useRouter();
  const [playlists, setPlaylists] = useState(initialPlaylists);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPlaylists(initialPlaylists);
  }, [initialPlaylists]);

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
              Liked
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
            Private playlists saved to your account — add tracks from any song
            page.
          </p>
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

        {!missingTable && playlists.length === 0 && !loadError ? (
          <div className="rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
            <p className="text-base font-medium">No playlists yet</p>
            <p className="mt-2 text-sm text-white/40">
              Create one above, then add tracks from song pages.
            </p>
          </div>
        ) : null}

        {playlists.length > 0 ? (
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
                <button
                  type="button"
                  onClick={() => onDelete(p.id)}
                  className="shrink-0 rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </main>
  );
}
