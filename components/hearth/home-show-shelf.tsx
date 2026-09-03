"use client";

import Link from "next/link";
import type { NewWaveShow } from "@/lib/dashboard/new-wave-shows";

type Props = {
  kicker: string;
  title: string;
  seeAllHref?: string;
  seeAllLabel?: string;
  shows: NewWaveShow[];
};

/** Horizontal rail of Wave radio shows (New Wave). */
export function HomeShowShelf({
  kicker,
  title,
  seeAllHref,
  seeAllLabel = "See all →",
  shows,
}: Props) {
  if (shows.length === 0) return null;

  return (
    <section className="home-shelf" aria-label={title}>
      <div className="home-shelf-head">
        <div>
          <p className="home-shelf-kicker">{kicker}</p>
          <h2 className="home-shelf-title">{title}</h2>
        </div>
        {seeAllHref ? (
          <Link href={seeAllHref} className="home-shelf-more">
            {seeAllLabel}
          </Link>
        ) : null}
      </div>
      <ul className="home-shelf-rail">
        {shows.map((s) => (
          <li key={s.id} className="home-shelf-item">
            <Link href={s.href} className="home-shelf-card">
              <span
                className="home-shelf-art"
                style={
                  s.cover_url
                    ? { backgroundImage: `url(${s.cover_url})` }
                    : undefined
                }
              >
                {s.kind === "live" ? (
                  <span className="home-shelf-play" style={{ fontSize: "0.55rem" }}>
                    LIVE
                  </span>
                ) : (
                  <span className="home-shelf-play">⌁</span>
                )}
              </span>
              <span className="home-shelf-copy">
                <span className="home-shelf-name">{s.title}</span>
                <span className="home-shelf-sub">{s.subtitle}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
