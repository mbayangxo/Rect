"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  {
    href: "/dashboard",
    label: "Home",
    match: (p: string) =>
      p === "/dashboard" || p === "/" || p.startsWith("/discover"),
    icon: "⌂",
  },
  {
    href: "/search",
    label: "Search",
    match: (p: string) =>
      p.startsWith("/search") ||
      p.startsWith("/radio") ||
      p.startsWith("/charts") ||
      p.startsWith("/new") ||
      p.startsWith("/parties") ||
      p.startsWith("/genres") ||
      p.startsWith("/places") ||
      p.startsWith("/languages"),
    icon: "⌕",
  },
  {
    href: "/library",
    label: "Library",
    match: (p: string) =>
      p.startsWith("/library") ||
      p.startsWith("/playlists") ||
      p.startsWith("/journal") ||
      p.startsWith("/following") ||
      p.startsWith("/tips"),
    icon: "☰",
  },
  {
    href: "/profile",
    label: "You",
    match: (p: string) =>
      p.startsWith("/profile") ||
      p.startsWith("/inbox") ||
      p.startsWith("/hearing-aid") ||
      p.startsWith("/messages"),
    icon: "●",
  },
] as const;

/** Paths that show the Spotify-style 4-tab bar (RECT Music only — not RECT Artist). */
export function usesAppBottomNav(pathname: string) {
  if (pathname.startsWith("/studio") || pathname.startsWith("/for-artists")) {
    return false;
  }
  return TABS.some((t) => t.match(pathname));
}

export function AppBottomNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav className="app-bottom-nav" aria-label="Main">
      {TABS.map((tab) => {
        const on = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`app-bottom-ni${on ? " on" : ""}`}
          >
            <span className="app-bottom-ico" aria-hidden>
              {tab.icon}
            </span>
            <span className="app-bottom-lbl">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
