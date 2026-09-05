"use client";

import Link from "next/link";
import type { NewWaveShow } from "@/lib/dashboard/new-wave-shows";

type Props = {
  shows: NewWaveShow[];
  loadError: string | null;
};

export function NewWaveShowsClient({ shows, loadError }: Props) {
  if (loadError) {
    return <p className="text-sm text-[#F5A623]">{loadError}</p>;
  }

  if (shows.length === 0) {
    return (
      <p className="text-sm text-white/45">
        No new Wave radio shows yet. Tune into{" "}
        <Link href="/radio" className="text-[var(--rect)] hover:underline">
          Wave
        </Link>{" "}
        for stations, or check{" "}
        <Link href="/new-sounds" className="text-[var(--rect)] hover:underline">
          New Sounds
        </Link>{" "}
        for music launches.
      </p>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {shows.map((s) => (
        <li key={s.id}>
          <Link
            href={s.href}
            className="flex gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 transition hover:border-[var(--rect)]/35"
          >
            <span
              className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-white/[0.06]"
              style={
                s.cover_url
                  ? {
                      backgroundImage: `url(${s.cover_url})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }
                  : undefined
              }
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate font-medium text-white">
                  {s.title}
                </span>
                {s.kind === "live" ? (
                  <span className="shrink-0 rounded bg-red-500/20 px-1.5 py-0.5 text-[0.55rem] font-semibold uppercase tracking-wider text-red-300">
                    Live
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block truncate text-xs text-white/45">
                {s.subtitle}
              </span>
              <span className="mt-1 block text-[0.65rem] uppercase tracking-wider text-white/30">
                {s.meta}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
