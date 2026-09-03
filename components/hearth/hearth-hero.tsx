"use client";

import Link from "next/link";

type Props = {
  displayName: string;
  liveCount?: number;
  inboxUnread?: number;
  creditBalance?: number;
  creditsReady?: boolean;
};

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name || "there";
}

function timeGreeting(name: string) {
  const h = new Date().getHours();
  const who = firstName(name);
  if (h < 12) return `Good morning, ${who}`;
  if (h < 18) return `Good afternoon, ${who}`;
  return `Good evening, ${who}`;
}

/** Clean Home hero — greeting + one line. Destinations live in Search / Library / You. */
export function HearthHero({
  displayName,
  liveCount = 0,
  inboxUnread = 0,
  creditBalance = 0,
  creditsReady = false,
}: Props) {
  return (
    <section className="hearth-hero hearth-hero-clean" aria-label="Home">
      <div className="hearth-hero-noise" aria-hidden />
      <div className="hearth-hero-orb hearth-hero-orb-a" aria-hidden />

      <p className="hearth-hero-eyebrow">Home</p>
      <h1 className="hearth-hero-title">{timeGreeting(displayName)}</h1>
      <p className="hearth-hero-scene">
        {liveCount > 0
          ? `${liveCount} live right now. Press play when you want music.`
          : "Press play when you want music. Browse below."}
      </p>

      <div className="hearth-stat-row">
        {creditsReady ? (
          <Link href="/profile/credits" className="hearth-stat">
            <span className="hearth-stat-val">{creditBalance}</span>
            <span className="hearth-stat-lbl">plays left</span>
          </Link>
        ) : null}
        {inboxUnread > 0 ? (
          <Link href="/hearing-aid" className="hearth-stat hearth-stat-warm">
            <span className="hearth-stat-val">{inboxUnread}</span>
            <span className="hearth-stat-lbl">updates</span>
          </Link>
        ) : null}
        {liveCount > 0 ? (
          <Link href="/discover" className="hearth-stat hearth-stat-live">
            <span className="hearth-stat-val">{liveCount}</span>
            <span className="hearth-stat-lbl">live</span>
          </Link>
        ) : null}
      </div>
    </section>
  );
}
