"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RectLogo } from "@/components/rect-logo";

type NavItem = { href: string; label: string; short: string };
type NavSection = { title: string; items: NavItem[] };

const SECTIONS: NavSection[] = [
  {
    title: "Catalog",
    items: [
      { href: "/studio/upload", label: "Upload", short: "Upload" },
      { href: "/studio/tracks", label: "Tracks", short: "Tracks" },
      { href: "/studio/portal", label: "Portal", short: "Portal" },
    ],
  },
  {
    title: "Delivery",
    items: [
      { href: "/studio/delivery", label: "Releases · DSP", short: "DSP" },
    ],
  },
  {
    title: "Money",
    items: [
      { href: "/studio/wallet", label: "Wallet", short: "Wallet" },
      { href: "/studio/accounting", label: "Accounting", short: "Books" },
      { href: "/studio/store", label: "Store", short: "Store" },
      { href: "/studio/tours", label: "Tours", short: "Tours" },
    ],
  },
  {
    title: "Insights",
    items: [
      { href: "/studio/analytics", label: "Analytics", short: "Stats" },
    ],
  },
  {
    title: "Presence",
    items: [
      { href: "/studio/live", label: "Live Room", short: "Live" },
      { href: "/studio/rect-live", label: "RECT Live", short: "Pro" },
    ],
  },
];

const FLAT = SECTIONS.flatMap((s) => s.items);

type Props = {
  displayName: string;
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function StudioNav({ displayName }: Props) {
  const pathname = usePathname() ?? "";

  return (
    <>
      <aside className="hidden w-56 shrink-0 border-r border-white/10 bg-[#030a05] md:flex md:flex-col">
        <div className="border-b border-white/10 px-5 py-5">
          <Link href="/studio/upload">
            <RectLogo size={32} showWordmark />
          </Link>
          <p className="mt-3 text-[0.65rem] font-medium uppercase tracking-[0.24em] text-[#1DB954]">
            Artist OS
          </p>
          <p className="mt-1 truncate text-sm text-white/50">{displayName}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <p className="mb-1 px-3 text-[0.55rem] font-semibold uppercase tracking-[0.2em] text-white/30">
                {section.title}
              </p>
              <div className="flex flex-col gap-0.5">
                {section.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                        active
                          ? "bg-[#1DB954]/15 text-[#1DB954]"
                          : "text-white/55 hover:bg-white/[0.04] hover:text-white"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
          <Link
            href="/dashboard"
            className="mt-auto rounded-lg border border-white/10 px-3 py-2.5 text-sm text-white/45 hover:border-white/20 hover:text-white"
          >
            ← Back to RECT SOUND
          </Link>
        </nav>
      </aside>

      <nav
        aria-label="Artist OS"
        className="fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t border-white/10 bg-[#030a05]/95 backdrop-blur-md md:hidden"
      >
        {FLAT.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-[3.5rem] shrink-0 flex-col items-center px-1 py-2.5 text-[0.55rem] font-medium ${
                active ? "text-[#1DB954]" : "text-white/45"
              }`}
            >
              <span>{item.short}</span>
            </Link>
          );
        })}
        <Link
          href="/dashboard"
          className="flex min-w-[3.5rem] shrink-0 flex-col items-center px-1 py-2.5 text-[0.55rem] font-medium text-white/35"
        >
          <span>RECT</span>
        </Link>
      </nav>
    </>
  );
}
