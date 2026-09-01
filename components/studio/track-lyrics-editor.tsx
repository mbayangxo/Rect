"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const MAX_LYRICS = 20_000;

type Props = {
  trackId: string;
  initialLyrics: string | null;
  /** Compact studio controls vs full song-page panel */
  compact?: boolean;
};

export function TrackLyricsEditor({
  trackId,
  initialLyrics,
  compact = false,
}: Props) {
  const router = useRouter();
  const [lyrics, setLyrics] = useState(initialLyrics ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLyrics(initialLyrics ?? "");
  }, [initialLyrics, trackId]);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    const next = lyrics.trim();
    if (next.length > MAX_LYRICS) {
      setError(`Lyrics must be under ${MAX_LYRICS.toLocaleString()} characters.`);
      setSaving(false);
      return;
    }
    try {
      const res = await fetch(`/api/tracks/${trackId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lyrics: next.length ? next : null }),
      });
      const data = (await res.json()) as { error?: string; warning?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? "Could not save lyrics.");
        return;
      }
      setMessage(
        data.warning
          ? data.warning
          : next.length
            ? "Lyrics saved."
            : "Lyrics cleared.",
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={compact ? "mt-2 space-y-2" : "space-y-3"}>
      <label className="block">
        <span
          className={
            compact
              ? "text-[0.65rem] text-white/40"
              : "text-xs font-semibold uppercase tracking-[0.14em] text-white/45"
          }
        >
          Lyrics
        </span>
        <textarea
          value={lyrics}
          onChange={(e) => setLyrics(e.target.value)}
          rows={compact ? 4 : 12}
          placeholder="Paste or write lyrics…"
          maxLength={MAX_LYRICS}
          className={
            compact
              ? "mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-xs leading-relaxed outline-none focus:border-[#1DB954]/50"
              : "mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-3 text-sm leading-relaxed outline-none focus:border-[#1DB954]/50"
          }
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-full border border-white/15 px-3 py-1.5 text-[0.65rem] text-white/70 hover:border-[#1DB954]/40 disabled:opacity-50"
        >
          {saving ? "…" : "Save lyrics"}
        </button>
        <span className="text-[0.65rem] tabular-nums text-white/30">
          {lyrics.length.toLocaleString()} / {MAX_LYRICS.toLocaleString()}
        </span>
        {message ? (
          <span className="text-[0.65rem] text-[#1DB954]">{message}</span>
        ) : null}
        {error ? (
          <span className="text-[0.65rem] text-[#F5A623]">{error}</span>
        ) : null}
      </div>
    </div>
  );
}
