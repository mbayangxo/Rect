"use client";

import type { ArtistAnalyticsDashboard } from "@/lib/dashboard/artist-analytics";
import { PLAY_EARNING_XOF } from "@/lib/dashboard/play-earnings";

type Props = {
  data: ArtistAnalyticsDashboard;
};

export function StudioAnalyticsDashboard({ data }: Props) {
  const maxDay = Math.max(1, ...data.playsByDay.map((d) => d.count));

  return (
    <div className="space-y-8">
      {data.error ? (
        <p className="text-sm text-[#F5A623]">{data.error}</p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="All-time plays" value={data.totalPlays.toLocaleString()} accent />
        <StatCard label="This week" value={data.playsThisWeek.toLocaleString()} />
        <StatCard label="Today" value={data.playsToday.toLocaleString()} />
        <StatCard
          label="Followers"
          value={
            data.followsReady ? data.followerCount.toLocaleString() : "—"
          }
        />
        <StatCard
          label="Top song"
          value={data.topSongTitle ?? "—"}
          sub={
            data.topSongPlays > 0
              ? `${data.topSongPlays.toLocaleString()} plays`
              : undefined
          }
        />
        <StatCard
          label="Play earnings"
          value={`${data.playCreditsEarnedXof.toLocaleString()} XOF`}
          sub={`${data.creditedPlayCount} credited · ${PLAY_EARNING_XOF} XOF/play demo`}
        />
      </div>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
          Plays — last 7 days
        </h2>
        <div className="mt-4 flex h-40 items-end gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 pb-4 pt-6">
          {data.playsByDay.map((day) => {
            const h = Math.max(4, Math.round((day.count / maxDay) * 100));
            return (
              <div
                key={day.date}
                className="flex min-w-0 flex-1 flex-col items-center gap-2"
              >
                <span className="text-[0.6rem] tabular-nums text-white/50">
                  {day.count}
                </span>
                <div
                  className="w-full max-w-[2.5rem] rounded-t bg-[#1DB954]/80 transition-all"
                  style={{ height: `${h}%` }}
                  title={`${day.label}: ${day.count} plays`}
                />
                <span className="truncate text-[0.55rem] text-white/35">
                  {day.label.split(" ")[0]}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
      <p className="text-[0.65rem] uppercase tracking-[0.14em] text-white/40">
        {label}
      </p>
      <p
        className={`mt-1 truncate text-lg font-semibold ${
          accent ? "text-[#1DB954]" : ""
        }`}
      >
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-[0.65rem] text-white/35">{sub}</p> : null}
    </div>
  );
}
