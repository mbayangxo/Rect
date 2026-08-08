"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Props = {
  displayName: string;
  city: string;
  artistBio: string;
  publicPortalHref: string;
};

export function ArtistProfileForm({
  displayName: initialName,
  city: initialCity,
  artistBio: initialBio,
  publicPortalHref,
}: Props) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialName);
  const [city, setCity] = useState(initialCity);
  const [artistBio, setArtistBio] = useState(initialBio);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setPending(true);
    try {
      const res = await fetch("/api/artist/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName.trim(),
          city,
          artist_bio: artistBio,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setError(data.error || "Could not save profile.");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white/90">Portal profile</h2>
          <p className="mt-1 text-xs text-white/40">
            Shown on your public artist page when your profile is public.
          </p>
        </div>
        <a
          href={publicPortalHref}
          className="shrink-0 text-xs text-[#1DB954] hover:underline"
        >
          View portal →
        </a>
      </div>

      <label className="block space-y-1.5">
        <span className="text-[0.65rem] uppercase tracking-[0.16em] text-white/40">
          Stage name
        </span>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={48}
          required
          minLength={2}
          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-[#1DB954]"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-[0.65rem] uppercase tracking-[0.16em] text-white/40">
          City
        </span>
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          maxLength={80}
          placeholder="Dakar, Lagos, Accra…"
          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-[#1DB954]"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-[0.65rem] uppercase tracking-[0.16em] text-white/40">
          Bio
        </span>
        <textarea
          value={artistBio}
          onChange={(e) => setArtistBio(e.target.value)}
          maxLength={500}
          rows={4}
          placeholder="Who you are in the culture…"
          className="w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-[#1DB954]"
        />
        <span className="text-[0.65rem] text-white/30">
          {artistBio.length}/500
        </span>
      </label>

      {error ? (
        <p className="text-sm text-[#F5A623]">{error}</p>
      ) : null}
      {saved ? (
        <p className="text-sm text-[#1DB954]">Saved to your portal.</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-[#1DB954] px-5 py-2.5 text-sm font-semibold text-black hover:bg-[#17a349] disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
