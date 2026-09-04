"use client";

import { useEffect, useState } from "react";
import type { AffinityItem } from "@/lib/dashboard/behavior";

type AffinityPayload = {
  play_count: number;
  like_count: number;
  window_days: number;
  genres: AffinityItem[];
  languages: AffinityItem[];
  countries: AffinityItem[];
  listening_times: AffinityItem[];
  missingRpc?: boolean;
};

/**
 * Shows what RECT learned from plays/likes — feeds For You / Wave ranking.
 */
export function ProfileListeningTaste() {
  const [affinity, setAffinity] = useState<AffinityPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/account/behavior?days=90");
        const data = (await res.json()) as {
          error?: string;
          affinity?: AffinityPayload;
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || "Could not load listening taste.");
          return;
        }
        setAffinity(data.affinity ?? null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Network error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <section className="mx-auto mt-8 w-full max-w-5xl px-5 sm:px-8">
        <p className="text-sm text-white/40">Loading listening taste…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mx-auto mt-8 w-full max-w-5xl px-5 sm:px-8">
        <p className="text-sm text-[#F5A623]">{error}</p>
      </section>
    );
  }

  const plays = affinity?.play_count ?? 0;
  const likes = affinity?.like_count ?? 0;
  const empty = plays === 0 && likes === 0;

  function ChipRow({
    label,
    items,
  }: {
    label: string;
    items: AffinityItem[];
  }) {
    if (items.length === 0) return null;
    return (
      <div className="mt-3">
        <p className="text-[0.65rem] uppercase tracking-[0.16em] text-white/35">
          {label}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {items.slice(0, 8).map((g) => (
            <span
              key={`${label}-${g.name}`}
              className="rounded-full border border-white/12 px-2.5 py-1 text-[0.7rem] text-white/65"
            >
              {g.name}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="mx-auto mt-8 w-full max-w-5xl px-5 sm:px-8">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-5">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-[var(--rect)]">
          Listening taste
        </p>
        <h2 className="mt-1 font-[family-name:var(--font-syne)] text-lg font-semibold">
          What RECT learns from you
        </h2>
        <p className="mt-1 text-sm text-white/45">
          Plays and likes shape For You and Wave — merged with the genres and
          places you set in onboarding.
        </p>
        {empty ? (
          <p className="mt-4 text-sm text-white/40">
            Keep listening — after a few credited plays, your genres and
            dayparts show up here.
          </p>
        ) : (
          <>
            <p className="mt-3 text-xs text-white/40">
              Last {affinity?.window_days ?? 90} days · {plays} play
              {plays === 1 ? "" : "s"} · {likes} like{likes === 1 ? "" : "s"}
              {affinity?.missingRpc
                ? " · run listener_behavior_affinity SQL for full place signals"
                : ""}
            </p>
            <ChipRow label="Genres" items={affinity?.genres ?? []} />
            <ChipRow label="Languages" items={affinity?.languages ?? []} />
            <ChipRow label="Places" items={affinity?.countries ?? []} />
            <ChipRow
              label="Listening times"
              items={affinity?.listening_times ?? []}
            />
          </>
        )}
      </div>
    </section>
  );
}
