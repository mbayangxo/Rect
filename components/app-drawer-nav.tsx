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
  showArtistStudio?: boolean;
  inboxUnread?: number;
  artistInboxUnread?: number;
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
 * Drawer mirrors the 4 main tabs — destinations nest under Home / Search / Library / You.
 */
export function AppDrawerNav({
  displayName,
  showArtistStudio = false,
  inboxUnread = 0,
  artistInboxUnread = 0,
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
        items={[
          { href: "/dashboard", label: "Home feed" },
          { href: "/discover", label: "Discover · live & trending" },
        ]}
        onNavigate={onNavigate}
      />

      <Section
        title="Search"
        items={[
          { href: "/search", label: "Search" },
          { href: "/radio", label: "Wave" },
          { href: "/charts", label: "Standings" },
          { href: "/new", label: "New releases" },
          { href: "/new-wave", label: "New Wave mix" },
          { href: "/genres", label: "Genres" },
          { href: "/places", label: "Places" },
          { href: "/languages", label: "Languages" },
        ]}
        onNavigate={onNavigate}
      />

      <Section
        title="Library"
        items={[
          { href: "/library", label: "Saved songs" },
          { href: "/playlists", label: "Your mixes" },
          { href: "/journal", label: "Listening journal" },
          { href: "/following", label: "Following" },
          { href: "/tips", label: "Tips" },
        ]}
        onNavigate={onNavigate}
      />

      <Section
        title="You"
        items={[
          { href: "/profile", label: "Profile & settings" },
          {
            href: "/hearing-aid",
            label: "Hearing Aid",
            badge: inboxUnread,
          },
          { href: "/messages", label: "Messages" },
          { href: "/profile/credits", label: "Play credits" },
          ...(showArtistStudio
            ? [
                { href: "/studio", label: "Artist studio" },
                {
                  href: "/artist/inbox",
                  label: "Artist inbox",
                  badge: artistInboxUnread,
                },
              ]
            : [{ href: "/for-artists", label: "Become an artist" }]),
        ]}
        onNavigate={onNavigate}
      />
    </>
  );
}
