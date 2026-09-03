"use client";

import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";

type LinkItem = {
  href: string;
  label: string;
  badge?: number;
};

type Props = {
  displayName: string;
  inboxUnread?: number;
  onNavigate?: () => void;
};

function Section({
  title,
  items,
  onNavigate,
}: {
  title: string;
  items: LinkItem[];
  onNavigate?: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="dash-dr-section">
      <p className="dash-dr-section-title">{title}</p>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="dash-dmi"
          onClick={onNavigate}
        >
          <span>
            {item.label}
            {item.badge && item.badge > 0 ? ` (${item.badge})` : ""}
          </span>
          <span aria-hidden>›</span>
        </Link>
      ))}
    </div>
  );
}

/**
 * Slim consumer drawer — RECT Music only.
 * RECT Artist is a separate site entered via /for-artists (not nested here).
 * Wave = radio. New Wave = new radio shows. New Sounds = music launches.
 * Hearing Aids = podcasts (coming). Inbox = social notifications.
 */
export function AppDrawerNav({
  displayName,
  inboxUnread = 0,
  onNavigate,
}: Props) {
  return (
    <>
      <div className="dash-dr-user">
        <p className="dash-dr-name">{displayName}</p>
        <SignOutButton />
      </div>

      <Section
        title="Home"
        items={[{ href: "/dashboard", label: "Home" }]}
        onNavigate={onNavigate}
      />

      <Section
        title="Search"
        items={[
          { href: "/search", label: "Search & browse" },
          { href: "/radio", label: "Wave · radio" },
          { href: "/new-wave", label: "New Wave · shows" },
          { href: "/new-sounds", label: "New Sounds" },
        ]}
        onNavigate={onNavigate}
      />

      <Section
        title="Library"
        items={[
          { href: "/library", label: "Liked & saved" },
          { href: "/playlists", label: "Your mixes" },
          { href: "/following", label: "Following" },
        ]}
        onNavigate={onNavigate}
      />

      <Section
        title="You"
        items={[
          { href: "/profile", label: "Profile" },
          {
            href: "/inbox",
            label: "Inbox",
            badge: inboxUnread,
          },
          { href: "/messages", label: "Messages" },
        ]}
        onNavigate={onNavigate}
      />

      <div className="dash-dr-section">
        <p className="dash-dr-section-title">Artists</p>
        <Link
          href="/for-artists"
          className="dash-dmi"
          onClick={onNavigate}
        >
          <span>RECT Artist (separate site)</span>
          <span aria-hidden>›</span>
        </Link>
      </div>
    </>
  );
}
