"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { ArtistProfileForm } from "@/components/artist-profile-form";
import { RectLogo } from "@/components/rect-logo";
import { TrackCover } from "@/components/track-cover";
import { TrackEditButton } from "@/components/track-edit-button";
import { TrackPublishToggle } from "@/components/track-publish-toggle";
import type { ArtistStatTrack } from "@/lib/dashboard/artist-stats";
import {
  CULTURAL_GENRES,
  CULTURAL_LANGUAGES,
  readAudioDurationSecs,
} from "@/lib/cultural-options";
import { isPublishedTrack, trackTitle } from "@/lib/tracks";

type WriterRow = { id: string; name: string; percent: string };

type Props = {
  displayName: string;
  avatarUrl: string | null;
  artistId: string;
  city: string;
  artistBio: string;
  countries: string[];
  genres: string[];
  tracks: ArtistStatTrack[];
  totalPlays: number;
  publishedCount: number;
  draftCount: number;
  loadError: string | null;
  focusTrackId?: string | null;
  setupPlaces?: boolean;
  needsPlaces?: boolean;
};

function newWriter(name = "", percent = ""): WriterRow {
  return {
    id: crypto.randomUUID(),
    name,
    percent,
  };
}

export function StudioClient({
  displayName,
  avatarUrl,
  artistId,
  city,
  artistBio,
  countries,
  genres,
  tracks,
  totalPlays,
  publishedCount,
  draftCount,
  loadError,
  focusTrackId = null,
  setupPlaces = false,
  needsPlaces = false,
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [language, setLanguage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [writers, setWriters] = useState<WriterRow[]>([
    newWriter(displayName, "100"),
  ]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const splitsTotal = useMemo(() => {
    return writers.reduce((sum, w) => {
      const n = Number(w.percent);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
  }, [writers]);

  const splitsOk = Math.abs(splitsTotal - 100) <= 0.01;

  async function onPublish(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!file) {
      setError("Choose an audio file.");
      return;
    }
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (needsPlaces) {
      setError(
        "Set at least one place in My portal before publishing — Charts place boards need it.",
      );
      document
        .getElementById("studio-profile")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (!genre.trim()) {
      setError("Pick a genre before publishing.");
      return;
    }
    if (!language.trim()) {
      setError("Pick a language before publishing.");
      return;
    }
    if (!splitsOk) {
      setError(`Writer splits must total 100% (now ${splitsTotal.toFixed(1)}%).`);
      return;
    }
    for (const w of writers) {
      if (!w.name.trim()) {
        setError("Each writer needs a name.");
        return;
      }
    }

    setPending(true);
    try {
      const durationSecs = await readAudioDurationSecs(file);
      const body = new FormData();
      body.set("title", title.trim());
      body.set("publish", "1");
      if (genre.trim()) body.set("genre", genre.trim());
      if (language.trim()) body.set("language", language.trim());
      if (durationSecs != null) body.set("duration_secs", String(durationSecs));
      body.set("audio", file);
      if (cover) body.set("cover", cover);
      body.set(
        "writers",
        JSON.stringify(
          writers.map((w) => ({
            name: w.name.trim(),
            percent: Number(w.percent),
          })),
        ),
      );

      const res = await fetch("/api/tracks/upload", {
        method: "POST",
        body,
      });
      const data = (await res.json()) as {
        error?: string;
        track?: { id?: string; title?: string; status?: string };
        published?: boolean;
        writers_saved?: boolean;
      };

      if (!res.ok || data.error) {
        if (res.status === 401) {
          window.location.href = "/auth/login?next=/studio";
          return;
        }
        setError(data.error || "Upload failed.");
        return;
      }

      if (!data.published || !data.track?.id) {
        setError("Upload did not publish a live track. Try again.");
        return;
      }

      const trackId = data.track.id.trim();
      setSuccess(
        `Published “${data.track.title || title}” — live on Home, Wave, and Charts (including place boards).`,
      );
      setTitle("");
      setGenre("");
      setLanguage("");
      setFile(null);
      setCover(null);
      setWriters([newWriter(displayName, "100")]);
      window.setTimeout(() => {
        router.push(
          trackId
            ? `/studio?focus=${encodeURIComponent(trackId)}`
            : "/studio",
        );
        router.refresh();
      }, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="relative min-h-dvh bg-[#040d06] text-[#f8f8f8]">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-[#1DB954]/12 blur-[100px]"
      />

      <header className="relative border-b border-white/10">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
          <Link href="/dashboard">
            <RectLogo size={34} showWordmark />
          </Link>
          <nav className="flex flex-wrap items-center gap-3 text-sm text-white/55">
            <Link href="/dashboard" className="hover:text-white">
              Listener hub
            </Link>
            <Link href="/artist/inbox" className="hover:text-white">
              Inbox
            </Link>
            <Link
              href={`/artists/${artistId}`}
              className="hover:text-white"
            >
              Public portal
            </Link>
            <span className="text-[#1DB954]">Studio</span>
          </nav>
        </div>
      </header>

      <div className="relative mx-auto w-full max-w-3xl px-5 py-10 sm:px-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-[#1DB954]">
          Artist Studio
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight sm:text-4xl">
          {displayName}
        </h1>
        <p className="mt-2 text-sm text-white/45">
          Upload and publish with place, genre, and language so tracks actually
          appear on Home, Wave, and Charts.
        </p>

        {needsPlaces ? (
          <div
            id="studio-places-banner"
            className="mt-6 rounded-xl border border-[#F5A623]/35 bg-[#F5A623]/10 px-4 py-3 text-sm text-[#F5A623]"
          >
            Publishing is blocked until you set at least one place — Dakar and
            Alkebulan boards need it.{" "}
            <a href="#studio-profile" className="font-semibold underline">
              Set places now
            </a>
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
            <p className="text-[0.65rem] uppercase tracking-[0.14em] text-white/40">
              Streams
            </p>
            <p className="mt-1 text-xl font-semibold text-[#1DB954]">
              {totalPlays.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
            <p className="text-[0.65rem] uppercase tracking-[0.14em] text-white/40">
              Live
            </p>
            <p className="mt-1 text-xl font-semibold">{publishedCount}</p>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
            <p className="text-[0.65rem] uppercase tracking-[0.14em] text-white/40">
              Drafts
            </p>
            <p className="mt-1 text-xl font-semibold">{draftCount}</p>
          </div>
        </div>

        {/* 1. UPLOAD TRACK */}
        <section className="mt-12">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
            Upload track
          </h2>
          <form
            onSubmit={(e) => void onPublish(e)}
            className="mt-4 space-y-4 rounded-xl border border-white/[0.08] bg-white/[0.03] p-5"
          >
            <label className="block">
              <span className="text-xs text-white/45">Song title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                required
                className="mt-1.5 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-[#1DB954]"
                placeholder="Track title"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-white/45">Genre (required)</span>
                <select
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  required
                  className="mt-1.5 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-[#1DB954]"
                >
                  <option value="">Select genre</option>
                  {CULTURAL_GENRES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-white/45">Language (required)</span>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  required
                  className="mt-1.5 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-[#1DB954]"
                >
                  <option value="">Select language</option>
                  {CULTURAL_LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="text-xs text-white/45">Audio file</span>
              <input
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="mt-1.5 block w-full text-sm text-white/70 file:mr-3 file:rounded-full file:border-0 file:bg-[#1DB954] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-black"
              />
            </label>

            <label className="block">
              <span className="text-xs text-white/45">Cover art</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setCover(e.target.files?.[0] ?? null)}
                className="mt-1.5 block w-full text-sm text-white/70 file:mr-3 file:rounded-full file:border-0 file:bg-white/15 file:px-4 file:py-2 file:text-sm file:text-white"
              />
            </label>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs text-white/45">Writer splits</span>
                <span
                  className={`text-xs ${
                    splitsOk ? "text-[#1DB954]" : "text-[#F5A623]"
                  }`}
                >
                  Total {splitsTotal.toFixed(1)}%
                </span>
              </div>
              <ul className="space-y-2">
                {writers.map((w, i) => (
                  <li key={w.id} className="flex flex-wrap gap-2">
                    <input
                      value={w.name}
                      onChange={(e) => {
                        const name = e.target.value;
                        setWriters((list) =>
                          list.map((row, idx) =>
                            idx === i ? { ...row, name } : row,
                          ),
                        );
                      }}
                      placeholder="Writer name"
                      className="min-w-[10rem] flex-1 rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none focus:border-[#1DB954]"
                    />
                    <input
                      value={w.percent}
                      onChange={(e) => {
                        const percent = e.target.value;
                        setWriters((list) =>
                          list.map((row, idx) =>
                            idx === i ? { ...row, percent } : row,
                          ),
                        );
                      }}
                      inputMode="decimal"
                      placeholder="%"
                      className="w-20 rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none focus:border-[#1DB954]"
                    />
                    {writers.length > 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setWriters((list) => list.filter((_, idx) => idx !== i))
                        }
                        className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/50 hover:bg-white/10"
                      >
                        Remove
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setWriters((list) => [...list, newWriter()])}
                className="mt-2 text-xs text-[#1DB954] hover:underline"
              >
                + Add writer
              </button>
            </div>

            {error ? (
              <p className="text-sm text-[#F5A623]" role="alert">
                {error}
              </p>
            ) : null}
            {success ? (
              <p className="text-sm text-[#1DB954]" role="status">
                {success}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={pending || !splitsOk || needsPlaces}
              className="w-full rounded-full bg-[#1DB954] py-3.5 text-sm font-semibold text-black hover:bg-[#17a349] disabled:opacity-50"
            >
              {pending
                ? "Publishing…"
                : needsPlaces
                  ? "Set place to publish"
                  : "Publish"}
            </button>
          </form>
        </section>

        {/* 2. MY TRACKS */}
        <section className="mt-12">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
            My tracks
          </h2>
          {loadError ? (
            <p className="mt-3 text-sm text-[#F5A623]">{loadError}</p>
          ) : tracks.length === 0 ? (
            <p className="mt-3 text-sm text-white/40">
              No uploads yet. Publish your first track above.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {tracks.map((t) => {
                const live = isPublishedTrack(t);
                const focused = focusTrackId === t.id;
                return (
                  <li
                    key={t.id}
                    className={`rounded-xl border px-4 py-3 ${
                      focused
                        ? "border-[#1DB954]/50 bg-[#1DB954]/[0.08]"
                        : "border-white/[0.08] bg-white/[0.03]"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <TrackCover track={t} size="sm" />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/songs/${t.id}`}
                          className="block truncate font-medium hover:text-[#1DB954]"
                        >
                          {trackTitle(t)}
                        </Link>
                        <p className="mt-0.5 text-xs text-white/40">
                          {t.play_count.toLocaleString()} stream
                          {t.play_count === 1 ? "" : "s"}
                          {" · "}
                          {t.play_count.toLocaleString()} play pack credit
                          {t.play_count === 1 ? "" : "s"} earned
                          {t.genre ? ` · ${t.genre}` : ""}
                          {!live ? " · Draft" : " · Live"}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <TrackEditButton
                            trackId={t.id}
                            title={t.title || ""}
                            genre={t.genre}
                            language={t.language}
                            hasCover={Boolean(t.cover_art_url)}
                          />
                          <TrackPublishToggle
                            trackId={t.id}
                            status={t.status}
                            emphasize={focused && !live}
                            genre={t.genre}
                            language={t.language}
                            hasPlaces={!needsPlaces}
                          />
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 3. MY PORTAL */}
        <section className="mt-12">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
            My portal
          </h2>
          <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.03] p-5">
            <div className="flex items-center gap-4">
              <span className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.04] text-lg font-semibold text-[#1DB954]/80">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  (displayName.trim().slice(0, 2) || "AR").toUpperCase()
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">{displayName}</p>
                <p className="mt-0.5 text-xs text-white/40">
                  Public artist portal — listeners follow, tip, and play here.
                </p>
                <Link
                  href={`/artists/${artistId}`}
                  className="mt-2 inline-block text-sm text-[#1DB954] hover:underline"
                >
                  Open public portal →
                </Link>
              </div>
            </div>
            <div className="mt-6 border-t border-white/[0.06] pt-5">
              <ArtistProfileForm
                displayName={displayName}
                city={city}
                artistBio={artistBio}
                countries={countries}
                genres={genres}
                avatarUrl={avatarUrl}
                publicPortalHref={`/artists/${artistId}`}
                emphasizeSetup={setupPlaces || needsPlaces}
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
