"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, useTransition } from "react";
import type {
  SongPerformanceRow,
  StudioAnalytics,
} from "@/lib/dashboard/artist-analytics";
import type { StudioFanProfile } from "@/lib/dashboard/artist-fan-profile";
import type { AnalyticsRangeId } from "@/lib/dashboard/analytics-time";
import Link from "next/link";

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
  | "likes"
  | "saves"
  | "shares"
  | "comments";

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
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedFanId, setSelectedFanId] = useState<string | null>(null);
  const [fanProfile, setFanProfile] = useState<StudioFanProfile | null>(null);
  const [fanLoading, setFanLoading] = useState(false);
  const [fanError, setFanError] = useState<string | null>(null);

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  const activeRange = (searchParams.get("range") ?? data.window.id) as AnalyticsRangeId;

  useEffect(() => {
    if (!selectedFanId) {
      setFanProfile(null);
      setFanError(null);
      return;
    }
    let cancelled = false;
    setFanLoading(true);
    setFanError(null);
    const params = new URLSearchParams();
    params.set("range", activeRange);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    void fetch(`/api/studio/analytics/fans/${selectedFanId}?${params}`)
      .then(async (r) => {
        const json = (await r.json()) as StudioFanProfile & { error?: string };
        if (cancelled) return;
        if (!r.ok || json.error) {
          setFanError(json.error ?? "Could not load fan.");
          setFanProfile(null);
          return;
        }
        setFanProfile(json);
      })
      .catch((e) => {
        if (!cancelled) {
          setFanError(e instanceof Error ? e.message : "Network error");
          setFanProfile(null);
        }
      })
      .finally(() => {
        if (!cancelled) setFanLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedFanId, activeRange, searchParams]);

  function applyRange(range: AnalyticsRangeId, from?: string, to?: string) {
    const params = new URLSearchParams();
    params.set("range", range);
    if (range === "custom" && from) params.set("from", from);
    if (range === "custom" && to) params.set("to", to);
    setFetchError(null);
    startTransition(() => {
      router.push(`/studio/analytics?${params.toString()}`);
      void fetch(`/api/studio/analytics?${params.toString()}`)
        .then(async (r) => {
          const json = (await r.json()) as StudioAnalytics & { error?: string };
          if (!r.ok) {
            throw new Error(json.error ?? `Analytics failed (${r.status})`);
          }
          setData(json);
        })
        .catch((e: unknown) => {
          setFetchError(
            e instanceof Error ? e.message : "Failed to refresh analytics",
          );
        });
    });
  }

  const maxWeekly = Math.max(1, ...(data.weeklyTrend ?? []).map((w) => w.count));

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

      {fetchError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {fetchError}
        </div>
      ) : null}

      {!data.revenue.earningsReady ? (
        <div className="rounded-xl border border-[#F5A623]/30 bg-[#F5A623]/10 px-4 py-3 text-sm text-[#F5A623]">
          Stream revenue requires the play earnings migration. Run{" "}
          <code className="text-[0.85em]">npm run db:apply:artist-os</code>{" "}
          (with <code className="text-[0.85em]">SUPABASE_DB_URL</code> in{" "}
          <code className="text-[0.85em]">.env.local</code>) or paste{" "}
          <code className="text-[0.85em]">
            supabase/migrations/20260830_artist_play_earnings_bootstrap.sql
          </code>{" "}
          in Supabase SQL Editor. Stream counts work; revenue shows 0 until
          applied.
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
        <button
          type="button"
          onClick={() => {
            const lines = [
              "metric,value",
              `streams_all_time,${data.overview.totalStreamsAllTime}`,
              `streams_in_range,${data.overview.streamsInRange}`,
              `revenue_all_time_xof,${data.overview.totalRevenueXof}`,
              `revenue_in_range_xof,${data.overview.revenueInRangeXof}`,
              `streams_xof,${data.revenue.streamsXof}`,
              `downloads_xof,${data.revenue.downloadsXof}`,
              `merch_xof,${data.revenue.merchXof}`,
              `tips_xof,${data.revenue.tipsXof}`,
              `tickets_xof,${data.revenue.ticketsXof}`,
              `dsp_releases_live,${data.delivery?.liveCount ?? 0}`,
            ];
            const blob = new Blob([lines.join("\n")], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `rect-analytics-${data.window.id}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="rounded-full border border-white/20 px-3 py-1.5 text-[0.65rem] font-medium text-white/55 hover:border-[#1DB954]/40"
        >
          Export CSV
        </button>
      </section>

      {/* Delivery / Taali */}
      <section>
        <SectionTitle>Delivery · Taali / DSPs</SectionTitle>
        {!data.delivery?.ready ? (
          <EmptyState text="Run 20260831_artist_os_delivery_suite.sql to track DSP releases here." />
        ) : (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                label="Releases"
                value={String(data.delivery.total)}
                sub={
                  data.delivery.taaliLive ? "Taali live" : "Demo / queued mode"
                }
              />
              <StatCard
                label="Live on DSPs"
                value={String(data.delivery.liveCount)}
                sub="Only after Taali confirms"
                accent
              />
            </div>
            {data.delivery.releases.length === 0 ? (
              <EmptyState text="No DSP releases yet — create one in Studio → Delivery." />
            ) : (
              <ul className="space-y-2">
                {data.delivery.releases.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.08] px-4 py-2.5 text-sm"
                  >
                    <span>
                      {r.title}
                      <span className="ml-2 text-xs text-white/35">
                        {r.status}
                        {r.releaseDate ? ` · ${r.releaseDate}` : ""}
                      </span>
                    </span>
                    {r.smartLinkSlug ? (
                      <Link
                        href={`/r/${r.smartLinkSlug}`}
                        className="text-xs text-[#1DB954] hover:underline"
                      >
                        /r/{r.smartLinkSlug}
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/studio/delivery"
              className="inline-block text-sm text-[#1DB954] hover:underline"
            >
              Open Delivery suite →
            </Link>
          </div>
        )}
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
            <table className="w-full min-w-[1100px] text-left text-sm">
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
                  <SortTh label="Saves" k="saves" sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
                  <SortTh label="Shares" k="shares" sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
                  <SortTh label="Comments" k="comments" sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
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
                    <td className="px-3 py-3 text-xs text-white/35">—</td>
                    <td className="px-3 py-3 tabular-nums">{song.likes}</td>
                    <td className="px-3 py-3 tabular-nums">{song.saves}</td>
                    <td className="px-3 py-3 tabular-nums">{song.shares}</td>
                    <td className="px-3 py-3 tabular-nums">{song.comments}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[0.65rem] text-white/30">
          Completion % averages listened seconds per credited play (requires{" "}
          <code className="text-[0.9em]">20260830_plays_listened_secs.sql</code>
          ). Skip rate is not tracked yet.
        </p>
      </section>

      {/* Audience */}
      <section>
        <SectionTitle>Audience</SectionTitle>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/45">
              Listener countries
            </h3>
            {data.audience.countries.length === 0 ? (
              <p className="mt-3 text-sm text-white/35">
                No listener location data in range.
              </p>
            ) : (
              <CountryMap countries={data.audience.countries} />
            )}
          </div>

          <div className="space-y-4">
            <MiniList title="Top listener cities" items={data.audience.cities.map((c) => `${c.name} · ${c.count}`)} empty="No city data" />
            <MiniList
              title="Follower cities"
              items={data.audience.followerCities.map((c) => `${c.name} · ${c.count}`)}
              empty="No follower city data yet"
            />
            <MiniList
              title="Tour demand (fan requests)"
              items={data.audience.tourDemand.map(
                (d) =>
                  `${d.city}${d.place ? ` · ${d.place}` : ""} · ${d.requestCount} req · ${d.uniqueFans} fans`,
              )}
              empty="No city requests yet — fans request from your portal"
            />
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
          <StatCard label="Downloads" value={`${data.revenue.downloadsXof.toLocaleString()} XOF`} sub="Paid track downloads via JOKO" />
          <StatCard label="Merch" value={`${data.revenue.merchInRangeXof.toLocaleString()} XOF`} sub={data.revenue.merchReady ? `All time ${data.revenue.merchXof}` : "Run merch migration"} />
          <StatCard label="Fan club" value={`${data.revenue.fanClubXof.toLocaleString()} XOF`} sub={data.overview.fanClubReady ? `${data.overview.fanClubMembers} members` : "Create tiers in Portal"} />
          <StatCard label="Tickets (FEKK)" value={`${data.revenue.ticketsXof.toLocaleString()} XOF`} sub={`In range ${data.revenue.ticketsInRangeXof.toLocaleString()} XOF`} />
          <StatCard label="Tips" value={`${data.revenue.tipsInRangeXof.toLocaleString()} XOF`} sub={data.revenue.tipsReady ? `All time ${data.revenue.tipsXof}` : "Tips table missing"} />
          <StatCard label="This month" value={`${data.revenue.monthTotalXof.toLocaleString()} XOF`} accent />
        </div>
        <p className="mt-3 text-sm text-white/45">
          All time total:{" "}
          <span className="font-semibold text-[#1DB954]">
            {data.revenue.allTimeXof.toLocaleString()} XOF
          </span>
        </p>
        {data.revenue.payouts.length === 0 ? (
          <EmptyState text="No JOKO payouts recorded yet. Request a payout from Studio → Wallet." />
        ) : (
          <ul className="mt-4 space-y-2">
            {data.revenue.payouts.map((p, i) => (
              <li
                key={`${p.date}-${i}`}
                className="flex justify-between rounded-lg border border-white/[0.08] px-4 py-2.5 text-sm"
              >
                <span>
                  {p.amountXof.toLocaleString()} XOF
                  <span className="ml-2 text-xs text-white/35">{p.status}</span>
                </span>
                <span className="text-xs text-white/40">
                  {p.date ? new Date(p.date).toLocaleDateString() : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
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
          <LineChart data={data.weeklyTrend ?? []} max={maxWeekly} />
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
            <p className="mt-1 text-[0.65rem] text-white/30">
              Tap a fan for favorites, spends, and purchase history.
            </p>
            <ul className="mt-3 space-y-2">
              {data.engagement.topFans.map((fan) => {
                const selected = selectedFanId === fan.listenerId;
                return (
                  <li key={fan.listenerId}>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedFanId(selected ? null : fan.listenerId)
                      }
                      className={`flex w-full items-center justify-between rounded-lg border px-4 py-2.5 text-left transition ${
                        selected
                          ? "border-[#1DB954]/45 bg-[#1DB954]/10"
                          : "border-white/[0.08] hover:border-white/20"
                      }`}
                    >
                      <span className="text-sm">{fan.displayName}</span>
                      <span className="text-xs tabular-nums text-white/45">
                        {fan.plays} plays
                        {fan.likes > 0 ? ` · ${fan.likes} likes` : ""}
                        {fan.tipsXof > 0 ? ` · ${fan.tipsXof} XOF tips` : ""}
                        {" · score "}
                        {fan.score}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {selectedFanId ? (
              <div className="mt-4 rounded-xl border border-[#1DB954]/25 bg-[#1DB954]/[0.06] p-4">
                {fanLoading ? (
                  <p className="text-sm text-white/40">Loading fan…</p>
                ) : fanError ? (
                  <p className="text-sm text-[#F5A623]">{fanError}</p>
                ) : fanProfile ? (
                  <FanDrillDown
                    profile={fanProfile}
                    onClose={() => setSelectedFanId(null)}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 text-sm text-white/35">No fan activity in this range yet.</p>
        )}

        <EmptyState text="Fan club growth requires active members — create tiers in Portal." />
        {data.engagement.followerGrowth.length > 0 ? (
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/45">
              Follower growth
            </h3>
            <BarChart data={data.engagement.followerGrowth.slice(-14)} max={Math.max(1, ...data.engagement.followerGrowth.map((d) => d.count))} compact />
          </div>
        ) : null}
        {data.engagement.fanClubGrowth.length > 0 ? (
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/45">
              Fan club growth
            </h3>
            <BarChart data={data.engagement.fanClubGrowth} max={Math.max(1, ...data.engagement.fanClubGrowth.map((d) => d.count))} compact />
          </div>
        ) : null}
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

function FanDrillDown({
  profile,
  onClose,
}: {
  profile: StudioFanProfile;
  onClose: () => void;
}) {
  const place = [profile.city, profile.country].filter(Boolean).join(" · ");
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold">{profile.displayName}</p>
          <p className="mt-0.5 text-xs text-white/45">
            {place || "Location unknown"}
            {profile.isFollower
              ? ` · Follower${
                  profile.followsSince
                    ? ` since ${new Date(profile.followsSince).toLocaleDateString()}`
                    : ""
                }`
              : " · Not following"}
            {" · "}
            {profile.window.label}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-white/40 hover:text-white/70"
        >
          Close
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniStat label="Plays" value={String(profile.plays)} />
        <MiniStat label="Likes" value={String(profile.likes)} />
        <MiniStat label="Tips" value={`${profile.tipsXof.toLocaleString()} XOF`} />
        <MiniStat
          label="Spend"
          value={`${profile.spendXof.toLocaleString()} XOF`}
        />
      </div>

      <div>
        <h4 className="text-[0.65rem] font-semibold uppercase tracking-wider text-white/40">
          Favorite tracks
        </h4>
        {profile.favoriteTracks.length === 0 ? (
          <p className="mt-2 text-sm text-white/35">No plays or likes in this range.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {profile.favoriteTracks.map((t) => (
              <li
                key={t.trackId}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <Link
                  href={`/songs/${t.trackId}`}
                  className="min-w-0 truncate hover:text-[#1DB954]"
                >
                  {t.title}
                </Link>
                <span className="shrink-0 text-xs tabular-nums text-white/40">
                  {t.plays} plays
                  {t.likes > 0 ? ` · ${t.likes} likes` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h4 className="text-[0.65rem] font-semibold uppercase tracking-wider text-white/40">
          Purchases & tips
        </h4>
        {profile.purchases.length === 0 ? (
          <p className="mt-2 text-sm text-white/35">No purchases in this range.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {profile.purchases.map((p, i) => (
              <li
                key={`${p.kind}-${p.at}-${i}`}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="min-w-0 truncate">
                  <span className="text-white/35">{p.kind.replace("_", " ")}</span>
                  {" · "}
                  {p.title}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-white/40">
                  {p.amountXof.toLocaleString()} XOF
                  {p.at
                    ? ` · ${new Date(p.at).toLocaleDateString()}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2">
      <p className="text-[0.6rem] uppercase tracking-wider text-white/35">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
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

function CountryMap({
  countries,
}: {
  countries: { name: string; count: number; pct: number }[];
}) {
  const maxPct = Math.max(1, ...countries.map((c) => c.pct));
  return (
    <div className="mt-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {countries.map((c) => {
          const intensity = 0.25 + (c.pct / maxPct) * 0.75;
          return (
            <div
              key={c.name}
              className="rounded-lg border border-white/[0.08] px-3 py-2.5"
              style={{
                backgroundColor: `rgba(29, 185, 84, ${intensity * 0.35})`,
              }}
              title={`${c.name}: ${c.count} listeners · ${c.pct}%`}
            >
              <p className="truncate text-sm font-medium">{c.name}</p>
              <p className="mt-0.5 text-xs tabular-nums text-white/50">
                {c.count} · {c.pct}%
              </p>
            </div>
          );
        })}
      </div>
      <ul className="mt-4 space-y-2">
        {countries.map((c) => (
          <li key={`bar-${c.name}`}>
            <div className="flex justify-between text-xs">
              <span className="text-white/60">{c.name}</span>
              <span className="tabular-nums text-white/40">{c.count}</span>
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
    </div>
  );
}

function LineChart({
  data,
  max,
}: {
  data: { weekStart: string; label: string; count: number }[];
  max: number;
}) {
  if (data.length === 0) {
    return (
      <p className="mt-4 text-sm text-white/35">No weekly stream data yet.</p>
    );
  }

  const width = 640;
  const height = 160;
  const padX = 8;
  const padY = 24;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const step = data.length > 1 ? innerW / (data.length - 1) : 0;

  const points = data.map((w, i) => {
    const x = padX + i * step;
    const y = padY + innerH - (w.count / max) * innerH;
    return { x, y, ...w };
  });

  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-40 w-full min-w-[320px]"
        role="img"
        aria-label="Week by week stream trend"
      >
        <polyline
          fill="none"
          stroke="#1DB954"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={polyline}
        />
        {points.map((p) => (
          <g key={p.weekStart}>
            <circle cx={p.x} cy={p.y} r="3.5" fill="#1DB954" />
            <text
              x={p.x}
              y={height - 4}
              textAnchor="middle"
              className="fill-white/35 text-[9px]"
            >
              {p.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
