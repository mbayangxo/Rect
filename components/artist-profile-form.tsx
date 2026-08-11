"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  CULTURAL_GENRES,
  CULTURAL_PLACES,
  toggleCulturalItem,
} from "@/lib/cultural-options";

type Props = {
  displayName: string;
  city: string;
  artistBio: string;
  countries: string[];
  genres: string[];
  avatarUrl: string | null;
  publicPortalHref: string;
  /** Scroll/highlight after become-artist setup deep-link. */
  emphasizeSetup?: boolean;
};

export function ArtistProfileForm({
  displayName: initialName,
  city: initialCity,
  artistBio: initialBio,
  countries: initialCountries,
  genres: initialGenres,
  avatarUrl: initialAvatar,
  publicPortalHref,
  emphasizeSetup = false,
}: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState(initialName);
  const [city, setCity] = useState(initialCity);
  const [artistBio, setArtistBio] = useState(initialBio);
  const [countries, setCountries] = useState(initialCountries);
  const [genres, setGenres] = useState(initialGenres);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatar);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!emphasizeSetup) return;
    const el = document.getElementById("studio-profile");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [emphasizeSetup]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (countries.length < 1) {
      setError("Pick at least one place.");
      return;
    }
    if (genres.length < 1) {
      setError("Pick at least one genre.");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/artist/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName.trim(),
          city,
          artist_bio: artistBio,
          countries,
          genres,
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

  async function onAvatarPick(file: File | null) {
    if (!file || uploading) return;
    setError(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append("avatar", file);
      const res = await fetch("/api/account/avatar", {
        method: "POST",
        body,
      });
      const data = (await res.json()) as {
        error?: string;
        avatar_url?: string;
      };
      if (!res.ok || data.error || !data.avatar_url) {
        setError(data.error || "Could not upload avatar");
        return;
      }
      setAvatarUrl(data.avatar_url);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onRemoveAvatar() {
    if (uploading || !avatarUrl) return;
    setError(null);
    setUploading(true);
    const prev = avatarUrl;
    setAvatarUrl(null);
    try {
      const res = await fetch("/api/account/avatar", { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setAvatarUrl(prev);
        setError(data.error || "Could not remove avatar");
        return;
      }
      router.refresh();
    } catch (err) {
      setAvatarUrl(prev);
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form
      id="studio-profile"
      onSubmit={(e) => void onSubmit(e)}
      className={`space-y-4 rounded-xl border bg-white/[0.03] p-5 ${
        emphasizeSetup
          ? "border-[#1DB954]/45 ring-2 ring-[#1DB954]/25"
          : "border-white/10"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white/90">Portal profile</h2>
          <p className="mt-1 text-xs text-white/40">
            Photo, places, and genres power your public portal and discovery.
          </p>
          {emphasizeSetup && (countries.length < 1 || genres.length < 1) ? (
            <p className="mt-2 text-xs text-[#1DB954]">
              Pick at least one place and one genre to unlock Charts &amp; Radio
              discovery.
            </p>
          ) : null}
        </div>
        <a
          href={publicPortalHref}
          className="shrink-0 text-xs text-[#1DB954] hover:underline"
        >
          View portal →
        </a>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-white/15 bg-white/[0.04]">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-lg font-semibold text-[#1DB954]/70">
              {(displayName.trim().slice(0, 2) || "AR").toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => void onAvatarPick(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/70 hover:border-[#1DB954]/50 hover:text-white disabled:opacity-50"
          >
            {uploading ? "Uploading…" : avatarUrl ? "Change photo" : "Add photo"}
          </button>
          {avatarUrl ? (
            <button
              type="button"
              disabled={uploading}
              onClick={() => void onRemoveAvatar()}
              className="ml-2 rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/40 hover:text-red-300 disabled:opacity-50"
            >
              Remove
            </button>
          ) : null}
          <p className="text-[0.65rem] text-white/30">JPEG, PNG, or WebP · max 5MB</p>
        </div>
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

      <fieldset className="space-y-2">
        <legend className="text-[0.65rem] uppercase tracking-[0.16em] text-white/40">
          Places
        </legend>
        <p className="text-xs text-white/35">
          Where you’re from / where the sound lives — used for place charts.
        </p>
        <div className="flex flex-wrap gap-2">
          {CULTURAL_PLACES.map((place) => {
            const on = countries.includes(place);
            return (
              <button
                key={place}
                type="button"
                onClick={() =>
                  setCountries((list) => toggleCulturalItem(list, place))
                }
                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                  on
                    ? "border-[#1DB954] bg-[#1DB954]/15 text-[#1DB954]"
                    : "border-white/15 text-white/55 hover:border-white/30"
                }`}
                aria-pressed={on}
              >
                {place}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-[0.65rem] uppercase tracking-[0.16em] text-white/40">
          Genres
        </legend>
        <div className="flex flex-wrap gap-2">
          {CULTURAL_GENRES.map((genre) => {
            const on = genres.includes(genre);
            return (
              <button
                key={genre}
                type="button"
                onClick={() =>
                  setGenres((list) => toggleCulturalItem(list, genre))
                }
                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                  on
                    ? "border-[#1DB954] bg-[#1DB954]/15 text-[#1DB954]"
                    : "border-white/15 text-white/55 hover:border-white/30"
                }`}
                aria-pressed={on}
              >
                {genre}
              </button>
            );
          })}
        </div>
      </fieldset>

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

      {error ? <p className="text-sm text-[#F5A623]">{error}</p> : null}
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
