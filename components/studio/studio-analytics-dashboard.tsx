"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, useTransition } from "react";
import type {
  SongPerformanceRow,
  StudioAnalytics,
} from "@/lib/dashboard/artist-analytics";
import type { AnalyticsRangeId } from "@/lib/dashboard/analytics-time";
import { PLAY_EARNING_XOF } from "@/lib/dashboard/play-earnings";

type Props = {
  initialData: StudioAnalytics;
};

const RANGES: { id: AnalyticsRangeId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "3months", label: "Last 3 months" },
  { id: "all", label: "All time" },
];

type SortKey =
  | "title"
  | "totalStreams"
  | "streamsInRange"
  | "streamsThisWeek"
  | "streamsToday"
  | "chartPosition"
  | "revenueXof"
  | "downloadSales"
  | "completionRate"
  | "likes";

export function StudioAnalyticsDashboard({ initialData }: Props) {
  return (
    <Suspense fallback={<AnalyticsLoading />}>
      <StudioAnalyticsDashboardInner initialData={initialData} />
    </Suspense>
  );
}

function AnalyticsLoading() {
  return (
    <div className="py-12 text-center text-sm text-white/40">Loading analytics…</div>
  );
}

function StudioAnalyticsDashboardInner({ initialData }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState(initialData);
  const [pending, startTransition] = useTransition();
  const [sortKey, setSortKey] = useState<SortKey>("streamsInRange");
  const [sortAsc, setSortAsc] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  const activeRange = (searchParams.get("range") ?? data.window.id) as AnalyticsRangeId;

  function applyRange(range: AnalyticsRangeId, from?: string, to?: string) {
    const params = new URLSearchParams();
    params.set("range", range);
    if (range === "custom" && from) params.set("from", from);
    if (range === "custom" && to) params.set("to", to);
    startTransition(() => {
      router.push(`/studio/analytics?${params.toString()}`);
      void fetch(`/api/studio/analytics?${params.toString()}`)
        .then((r) => r.json())
        .then((json: StudioAnalytics) => setData(json))
        .catch(() => {});
    });
  }

  const sortedSongs = useMemo(() => {
    const list = [...data.songs];
    list.sort((a, b) => {
      let av: string | number | null = a[sortKey as keyof SongPerformanceRow] as
        | string
        | number
        | null;
      let bv: string | number | null = b[sortKey as keyof SongPerformanceRow] as
        | string
        | number
        | null;
      if (sortKey === "chartPosition") {
        av = a.chartPosition ?? 9999;
        bv = b.chartPosition ?? 9999;
      }
      if (sortKey === "completionRate") {
        av = a.completionRate ?? -1;
        bv = b.completionRate ?? -1;
      }
      if (typeof av === "string" && typeof bv === "string") {
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const na = Number(av) || 0;
      const nb = Number(bv) || 0;
      return sortAsc ? na - nb : nb - na;
    });
    return list;
  }, [data.songs, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  const maxTrend = Math.max(1, ...data.playsTrend.map((d) => d.count));

  return (
    <div className={`space-y-10 ${pending ? "opacity-60" : ""}`}>
      {data.errors.length > 0 ? (
        <div className="rounded-xl border border-[#F5A623]/30 bg-[#F5A623]/10 px-4 py-3 text-sm text-[#F5A623]">
          {data.errors.join(" · ")}
        </div>
      ) : null}

      {/* Time filters */}
      <section className="flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => applyRange(r.id)}
            className={`rounded-full px-4 py-2 text-xs font-medium transition ${
              activeRange === r.id
                ? "bg-[#1DB954] text-black"
                : "border border-white/15 text-white/60 hover:border-[#1DB954]/40"
            }`}
          >
            {r.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => applyRange("custom", customFrom, customTo)}
          className={`rounded-full px-4 py-2 text-xs font-medium ${
            activeRange === "custom"
              ? "bg-[#1DB954] text-black"
              : "border border-white/15 text-white/60"
          }`}
        >
          Custom
        </button>
        {activeRange === "custom" || customFrom || customTo ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-xs"
            />
            <span className="text-white/30">→</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-xs"
            />
          </div>
        ) : null}
        <span className="ml-auto text-xs text-white/35">{data.window.label}</span>
      </section>

      {/* Overview */}
      <section>
        <SectionTitle>Overview</SectionTitle>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Streams all time"
            value={data.overview.totalStreamsAllTime.toLocaleString()}
            accent
          />
          <StatCard
            label="Streams this week"
            value={data.overview.streamsThisWeek.toLocaleString()}
          />
          <StatCard
            label="Streams today"
            value={data.overview.streamsToday.toLocaleString()}
          />
          <StatCard
            label={`Streams · ${data.window.label}`}
            value={data.overview.streamsInRange.toLocaleString()}
          />
          <StatCard
            label="Revenue all time"
            value={`${data.overview.totalRevenueXof.toLocaleString()} XOF`}
            accent
          />
          <StatCard
            label={`Revenue · ${data.window.label}`}
            value={`${data.overview.revenueInRangeXof.toLocaleString()} XOF`}
          />
          <StatCard
            label="Total sales"
            value={String(data.overview.totalSalesCount)}
            sub="Merch confirmed · downloads when priced"
          />
          <StatCard
            label="Followers"
            value={
              data.overview.followsReady
                ? data.overview.followers.toLocaleString()
                : "—"
            }
          />
          <StatCard
            label="Fan club"
            value={
              data.overview.fanClubReady
                ? String(data.overview.fanClubMembers)
                : "—"
            }
            sub={data.overview.fanClubReady ? undefined : "Not live yet"}
          />
        </div>
      </section>

      {/* Stream trend */}
      <section>
        <SectionTitle>Stream trend</SectionTitle>
        <BarChart data={data.playsTrend} max={maxTrend} />
      </section>

      {/* Songs performance */}
      <section>
        <SectionTitle>Songs performance</SectionTitle>
        {sortedSongs.length === 0 ? (
          <EmptyState text="Upload and publish a track — streams appear here after fans listen." />
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-white/[0.08]">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[0.65rem] uppercase tracking-wider text-white/40">
                  <th className="px-3 py-3">Song</th>
                  <SortTh label="All time" k="totalStreams" sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
                  <SortTh label="Range" k="streamsInRange" sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
                  <SortTh label="Week" k="streamsThisWeek" sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
                  <SortTh label="Today" k="streamsToday" sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
                  <SortTh label="Chart" k="chartPosition" sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
                  <SortTh label="Revenue" k="revenueXof" sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
                  <SortTh label="DL sales" k="downloadSales" sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
                  <SortTh label="Min %" k="completionRate" sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
                  <th className="px-3 py-3">Skip</th>
                  <SortTh label="Likes" k="likes" sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {sortedSongs.map((song) => (
                  <tr
                    key={song.trackId}
                    className="border-b border-white/[0.06] hover:bg-white/[0.02]"
                  >
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-white/5">
                          {song.coverArtUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={song.coverArtUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-xs text-white/25">
                              ♫
                            </span>
                          )}
                        </span>
                        <span className="font-medium">{song.title}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 tabular-nums">{song.totalStreams}</td>
                    <td className="px-3 py-3 tabular-nums text-[#1DB954]">
                      {song.streamsInRange}
                    </td>
                    <td className="px-3 py-3 tabular-nums">{song.streamsThisWeek}</td>
                    <td className="px-3 py-3 tabular-nums">{song.streamsToday}</td>
                    <td className="px-3 py-3 tabular-nums">
                      {song.chartPosition != null ? (
                        <span>
                          #{song.chartPosition}
                          <span className="block text-[0.6rem] text-white/35">
                            {song.chartBoard}
                          </span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {song.revenueXof.toLocaleString()} XOF
                    </td>
                    <td className="px-3 py-3 tabular-nums">{song.downloadSales}</td>
                    <td className="px-3 py-3 tabular-nums">
                      {song.completionRate != null
                        ? `${song.completionRate}%`
                        : "—"}
                    </td>
                    <td className="px-3 py-3 text-xs text-white/35">N/A</td>
                    <td className="px-3 py-3 tabular-nums">{song.likes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[0.65rem] text-white/30">
          Completion % = minimum at credit threshold ({PLAY_EARNING_XOF} XOF / 30s
          rule). Skip rate not tracked yet.
        </p>
      </section>

      {/* Audience */}
      <section>
        <SectionTitle>Audience</SectionTitle>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/45">
              Countries
            </h3>
            {data.audience.countries.length === 0 ? (
              <p className="mt-3 text-sm text-white/35">No listener location data in range.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {data.audience.countries.map((c) => (
                  <li key={c.name}>
                    <div className="flex justify-between text-sm">
                      <span>{c.name}</span>
                      <span className="tabular-nums text-white/50">
                        {c.count} · {c.pct}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-[#1DB954]"
                        style={{ width: `${Math.max(c.pct, 2)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-4">
            <MiniList title="Top cities" items={data.audience.cities.map((c) => `${c.name} · ${c.count}`)} empty="No city data" />
            <MiniList
              title="Dakar neighborhoods"
              items={data.audience.neighborhoods.map((n) => `${n.name} · ${n.count}`)}
              empty="No Dakar neighborhood matches in listener cities"
            />
            <MiniList
              title="Languages (by streams)"
              items={data.audience.languages.map((l) => `${l.name} · ${l.pct}%`)}
              empty="No language data"
            />
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <StatCard
            label="New listeners"
            value={String(data.audience.newListeners)}
            sub={`This ${data.window.label.toLowerCase()}`}
          />
          <StatCard
            label="Returning"
            value={String(data.audience.returningListeners)}
            sub="Played before this range"
          />
          <StatCard
            label="Unique listeners"
            value={String(data.audience.uniqueListenersInRange)}
            sub={data.window.label}
          />
        </div>

        <p className="mt-3 text-xs text-white/35">
          Device breakdown:{" "}
          {data.audience.devices.tracked
            ? `${data.audience.devices.mobile} mobile · ${data.audience.devices.desktop} desktop`
            : "Not tracked yet — listener countries come from fan profiles."}
        </p>
      </section>

      {/* Revenue */}
      <section>
        <SectionTitle>Revenue breakdown</SectionTitle>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="Streams" value={`${data.revenue.streamsInRangeXof.toLocaleString()} XOF`} sub={`All time ${data.revenue.streamsXof.toLocaleString()}`} />
          <StatCard label="Downloads" value={`${data.revenue.downloadsXof} XOF`} sub="When song pricing is enabled" />
          <StatCard label="Merch" value={`${data.revenue.merchInRangeXof.toLocaleString()} XOF`} sub={data.revenue.merchReady ? `All time ${data.revenue.merchXof}` : "Run merch migration"} />
          <StatCard label="Fan club" value={`${data.revenue.fanClubXof} XOF`} sub="Not live yet" />
          <StatCard label="Tips" value={`${data.revenue.tipsInRangeXof.toLocaleString()} XOF`} sub={data.revenue.tipsReady ? `All time ${data.revenue.tipsXof}` : "Tips table missing"} />
          <StatCard label="This month" value={`${data.revenue.monthTotalXof.toLocaleString()} XOF`} accent />
        </div>
        <p className="mt-3 text-sm text-white/45">
          All time total:{" "}
          <span className="font-semibold text-[#1DB954]">
            {data.revenue.allTimeXof.toLocaleString()} XOF
          </span>
        </p>
        <div className="mt-4 rounded-xl border border-dashed border-white/10 px-4 py-5 text-center text-sm text-white/35">
          JOKO payout history will appear here when artist withdrawals ship.
        </div>
      </section>

      {/* Chart history */}
      <section>
        <SectionTitle>Chart history · STANDINGS</SectionTitle>
        {data.chartPositions.length === 0 ? (
          <EmptyState text="Publish live tracks to enter STANDINGS boards." />
        ) : (
          <ul className="mt-4 space-y-2">
            {data.chartPositions.map((row) => (
              <li
                key={`${row.boardId}-${row.trackId}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{row.trackTitle}</p>
                  <p className="text-xs text-white/40">
                    {row.boardTitle} · {row.cadence}
                  </p>
                </div>
                <p className="text-lg font-semibold text-[#1DB954]">#{row.position}</p>
              </li>
            ))}
          </ul>
        )}

        {data.chartMilestones.length > 0 ? (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-[0.65rem] uppercase tracking-wider text-white/40">
                  <th className="py-2 pr-4">Song</th>
                  <th className="py-2 pr-4">FIRST LIGHT</th>
                  <th className="py-2 pr-4">Neighborhood</th>
                  <th className="py-2 pr-4">City</th>
                  <th className="py-2 pr-4">Regional</th>
                  <th className="py-2">Peak</th>
                </tr>
              </thead>
              <tbody>
                {data.chartMilestones.map((m) => (
                  <tr key={m.trackId} className="border-t border-white/[0.06]">
                    <td className="py-2 pr-4 font-medium">{m.trackTitle}</td>
                    <td className="py-2 pr-4 text-xs text-white/45">
                      {m.firstLightAt
                        ? new Date(m.firstLightAt).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="py-2 pr-4">{m.onNeighborhoodChart ? "✓" : "—"}</td>
                    <td className="py-2 pr-4">{m.onCityChart ? "✓" : "—"}</td>
                    <td className="py-2 pr-4">{m.onRegionalChart ? "✓" : "—"}</td>
                    <td className="py-2">
                      {m.highestPosition != null
                        ? `#${m.highestPosition} ${m.highestBoard ?? ""}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/45">
            Week-by-week streams
          </h3>
          <BarChart data={data.playsTrend.slice(-14)} max={maxTrend} compact />
        </div>
      </section>

      {/* Engagement */}
      <section>
        <SectionTitle>Engagement</SectionTitle>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <StatCard label="Likes" value={String(data.engagement.totalLikes)} />
          <StatCard label="Comments" value={String(data.engagement.totalComments)} />
          <StatCard label="Shares" value={String(data.engagement.totalShares)} />
        </div>

        {data.engagement.topFans.length > 0 ? (
          <div className="mt-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/45">
              Top fans · {data.window.label}
            </h3>
            <ul className="mt-3 space-y-2">
              {data.engagement.topFans.map((fan) => (
                <li
                  key={fan.listenerId}
                  className="flex items-center justify-between rounded-lg border border-white/[0.08] px-4 py-2.5"
                >
                  <span className="text-sm">{fan.displayName}</span>
                  <span className="text-xs tabular-nums text-white/45">
                    {fan.plays} plays
                    {fan.tipsXof > 0 ? ` · ${fan.tipsXof} XOF tips` : ""}
                    {" · score "}
                    {fan.score}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-4 text-sm text-white/35">No fan activity in this range yet.</p>
        )}

        <p className="mt-4 text-xs text-white/30">
          Fan club growth over time — not live yet (no fan club table).
        </p>
      </section>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
      {children}
    </h2>
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
        className={`mt-1 truncate text-lg font-semibold tabular-nums ${
          accent ? "text-[#1DB954]" : ""
        }`}
      >
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-[0.65rem] text-white/35">{sub}</p> : null}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="mt-4 rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/40">
      {text}
    </p>
  );
}

function BarChart({
  data,
  max,
  compact = false,
}: {
  data: { date: string; label: string; count: number }[];
  max: number;
  compact?: boolean;
}) {
  if (data.length === 0) {
    return (
      <p className="mt-4 text-sm text-white/35">No stream data for this period.</p>
    );
  }
  return (
    <div
      className={`mt-4 flex items-end gap-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 pb-3 pt-5 ${
        compact ? "h-28" : "h-44"
      }`}
    >
      {data.map((day) => {
        const h = Math.max(4, Math.round((day.count / max) * 100));
        return (
          <div
            key={day.date}
            className="flex min-w-0 flex-1 flex-col items-center gap-1"
            title={`${day.label}: ${day.count}`}
          >
            {!compact ? (
              <span className="text-[0.55rem] tabular-nums text-white/45">
                {day.count}
              </span>
            ) : null}
            <div
              className="w-full max-w-[1.75rem] rounded-t bg-[#1DB954]/85"
              style={{ height: `${h}%` }}
            />
            <span className="truncate text-[0.5rem] text-white/30">
              {day.label.split(" ")[0]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SortTh({
  label,
  k,
  sortKey,
  sortAsc,
  onSort,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortAsc: boolean;
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <th className="px-3 py-3">
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`text-[0.65rem] uppercase tracking-wider ${
          active ? "text-[#1DB954]" : "text-white/40 hover:text-white/60"
        }`}
      >
        {label}
        {active ? (sortAsc ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
}

function MiniList({
  title,
  items,
  empty,
}: {
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-white/45">
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-white/35">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm text-white/70">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
