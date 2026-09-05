import Link from "next/link";
import type { LivePresenceItem } from "@/lib/dashboard/live-presence";

type Props = {
  items: LivePresenceItem[];
};

/** Trending live presence — Live Rooms + official RECT Lives. */
export function LiveNowStrip({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="mb-8" aria-label="Live right now">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-red-400">
            Live right now
          </p>
          <h2 className="mt-1 text-sm font-medium text-white/80">
            Live Rooms & RECT Live
          </h2>
        </div>
      </div>
      <ul className="flex gap-3 overflow-x-auto pb-1">
        {items.map((r) => (
          <li key={r.id} className="w-56 shrink-0">
            <Link
              href={r.href}
              className="block rounded-xl border border-red-500/25 bg-red-500/[0.06] p-3 transition hover:border-red-400/50"
            >
              <div className="flex items-center gap-2">
                <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-white/15 bg-white/5">
                  {r.artist_avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.artist_avatar}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.artist_name}</p>
                  <p className="truncate text-[11px] text-white/40">{r.title}</p>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1 font-semibold text-red-300">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                  {r.kind === "rect_live" ? "RECT LIVE" : "LIVE"} ·{" "}
                  {r.modeLabel}
                </span>
                <span className="tabular-nums text-white/40">
                  {r.viewer_count}
                </span>
              </div>
              {r.place ? (
                <p className="mt-1 truncate text-[10px] text-white/30">
                  {r.place}
                </p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
