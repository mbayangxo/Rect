"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import type { DistributionRelease } from "@/lib/dashboard/distribution";
import type { TrackRow } from "@/lib/tracks";
import { trackTitle } from "@/lib/tracks";

const DSPS = [
  { id: "spotify", label: "Spotify" },
  { id: "apple_music", label: "Apple Music" },
  { id: "youtube_music", label: "YouTube Music" },
  { id: "deezer", label: "Deezer" },
  { id: "tidal", label: "Tidal" },
  { id: "amazon_music", label: "Amazon Music" },
  { id: "boomplay", label: "Boomplay" },
] as const;

type Props = {
  initialReleases: DistributionRelease[];
  tracks: TrackRow[];
  missingTable: boolean;
  loadError: string | null;
  taaliLive: boolean;
};

export function StudioDeliveryManager({
  initialReleases,
  tracks,
  missingTable,
  loadError,
  taaliLive,
}: Props) {
  const router = useRouter();
  const [releases, setReleases] = useState(initialReleases);
  const [title, setTitle] = useState("");
  const [upc, setUpc] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [dsps, setDsps] = useState<string[]>([
    "spotify",
    "apple_music",
    "youtube_music",
    "deezer",
    "tidal",
  ]);
  const [pending, setPending] = useState(false);
  const [submitId, setSubmitId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const liveTracks = useMemo(
    () =>
      tracks.filter(
        (t) =>
          t.audio_url &&
          (t.content_kind || "music") !== "podcast" &&
          (!t.status || t.status === "live" || t.status === "published"),
      ),
    [tracks],
  );

  const punchReadyCount = useMemo(
    () =>
      liveTracks.filter(
        (t) =>
          (t.punch_status || "").toLowerCase() === "ready" &&
          typeof t.punch_audio_url === "string" &&
          t.punch_audio_url.trim(),
      ).length,
    [liveTracks],
  );

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const cover = liveTracks.find((t) => selected.includes(t.id))
        ?.cover_art_url;
      const res = await fetch("/api/studio/delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          upc: upc.trim() || undefined,
          release_date: releaseDate || undefined,
          cover_art_url: cover || undefined,
          track_ids: selected,
          dsp_targets: dsps,
          territories: ["WW"],
        }),
      });
      const data = (await res.json()) as { error?: string; release_id?: string };
      if (!res.ok || data.error) {
        setError(data.error || "Could not create release");
        return;
      }
      setTitle("");
      setUpc("");
      setSelected([]);
      setMessage("Release draft created. Submit to Taali to push to DSPs.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  async function onSubmitToTaali(releaseId: string) {
    if (submitId) return;
    setSubmitId(releaseId);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/studio/delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit", release_id: releaseId }),
      });
      const data = (await res.json()) as {
        error?: string;
        mode?: string;
        status?: string;
      };
      if (!res.ok || data.error) {
        setError(data.error || "Submit failed");
        return;
      }
      setMessage(
        data.mode === "demo"
          ? "Queued in demo mode — set TAALI_API_URL + TAALI_API_KEY for live DSP delivery. Status will not claim Spotify live until Taali confirms."
          : `Submitted to Taali (${data.status}).`,
      );
      setReleases((list) =>
        list.map((r) =>
          r.id === releaseId
            ? { ...r, status: (data.status as DistributionRelease["status"]) || r.status }
            : r,
        ),
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitId(null);
    }
  }

  if (missingTable) {
    return (
      <div className="rounded-xl border border-[#F5A623]/35 bg-[#F5A623]/10 px-4 py-4 text-sm text-[#F5A623]">
        Run{" "}
        <code className="text-white/80">20260831_artist_os_delivery_suite.sql</code>{" "}
        in the Supabase SQL Editor to enable DSP Delivery.
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/55">
        {taaliLive ? (
          <span className="text-[#1DB954]">Taali live</span>
        ) : (
          <span>
            Taali demo mode — releases queue on RECT until you set{" "}
            <code className="text-white/70">TAALI_API_*</code> env vars.
          </span>
        )}{" "}
        Upload audio once to RECT; Delivery sends metadata + file URLs to Taali
        for Spotify, Apple, and more. When a track is{" "}
        <span className="text-white/70">Punch ready</span>, Taali receives the
        punched master (`punch_audio_url`) instead of the raw upload.
      </div>

      {loadError ? (
        <p className="text-sm text-[#F5A623]" role="alert">
          {loadError}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-[#F5A623]" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p className="text-sm text-[#1DB954]">{message}</p> : null}

      <form
        onSubmit={(e) => void onCreate(e)}
        className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5"
      >
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
          New DSP release
        </h2>
        <label className="block">
          <span className="text-xs text-white/45">Release title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={160}
            className="mt-1.5 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-[#1DB954]"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs text-white/45">UPC (optional)</span>
            <input
              value={upc}
              onChange={(e) => setUpc(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-[#1DB954]"
            />
          </label>
          <label className="block">
            <span className="text-xs text-white/45">DSP street date</span>
            <input
              type="date"
              value={releaseDate}
              onChange={(e) => setReleaseDate(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-[#1DB954]"
            />
          </label>
        </div>

        <fieldset>
          <legend className="text-xs text-white/45">DSPs</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {DSPS.map((d) => {
              const on = dsps.includes(d.id);
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() =>
                    setDsps((list) =>
                      on ? list.filter((x) => x !== d.id) : [...list, d.id],
                    )
                  }
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                    on
                      ? "bg-[#1DB954] text-black"
                      : "border border-white/15 text-white/55"
                  }`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-xs text-white/45">
            Tracks on RECT ({selected.length} selected)
            {punchReadyCount > 0
              ? ` · ${punchReadyCount} Punch ready for Taali`
              : ""}
          </legend>
          {liveTracks.length === 0 ? (
            <p className="mt-2 text-sm text-white/40">
              Publish a music track in Upload / Tracks first.{" "}
              <Link href="/studio/upload" className="text-[#1DB954]">
                Upload →
              </Link>
            </p>
          ) : (
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
              {liveTracks.map((t) => {
                const on = selected.includes(t.id);
                const punch = (t.punch_status || "").toLowerCase();
                const punchReady =
                  punch === "ready" &&
                  typeof t.punch_audio_url === "string" &&
                  Boolean(t.punch_audio_url.trim());
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setSelected((list) =>
                          on
                            ? list.filter((id) => id !== t.id)
                            : [...list, t.id],
                        )
                      }
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                        on ? "bg-[#1DB954]/15 text-[#1DB954]" : "hover:bg-white/[0.04]"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {trackTitle(t)}
                        {punchReady ? (
                          <span className="ml-2 text-[0.65rem] text-[var(--rect)]">
                            Punch ready
                          </span>
                        ) : punch === "requested" || punch === "processing" ? (
                          <span className="ml-2 text-[0.65rem] text-white/35">
                            Punch {punch}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-xs opacity-60">
                        {on ? "✓" : "+"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>

        <button
          type="submit"
          disabled={pending || selected.length === 0 || !title.trim()}
          className="rounded-full bg-[#1DB954] px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create release draft"}
        </button>
      </form>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
          Your releases
        </h2>
        {releases.length === 0 ? (
          <p className="mt-3 text-sm text-white/40">No DSP releases yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {releases.map((r) => (
              <li
                key={r.id}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{r.title}</p>
                    <p className="mt-1 text-xs text-white/40">
                      Status:{" "}
                      <span className="text-[#1DB954]">{r.status}</span>
                      {r.release_date ? ` · street ${r.release_date}` : ""}
                      {r.upc ? ` · UPC ${r.upc}` : ""}
                    </p>
                    {r.last_error ? (
                      <p className="mt-1 text-xs text-[#F5A623]">{r.last_error}</p>
                    ) : null}
                    {r.smart_link_slug ? (
                      <Link
                        href={`/r/${r.smart_link_slug}`}
                        className="mt-2 inline-block text-xs text-[#1DB954] hover:underline"
                      >
                        Release link → /r/{r.smart_link_slug}
                      </Link>
                    ) : null}
                  </div>
                  {r.status === "draft" || r.status === "failed" ? (
                    <button
                      type="button"
                      disabled={submitId === r.id}
                      onClick={() => void onSubmitToTaali(r.id)}
                      className="rounded-full border border-[#1DB954]/40 px-4 py-2 text-xs font-semibold text-[#1DB954] disabled:opacity-50"
                    >
                      {submitId === r.id ? "Submitting…" : "Send to Taali / DSPs"}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
