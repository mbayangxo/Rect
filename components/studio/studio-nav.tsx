"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RectLogo } from "@/components/rect-logo";

const NAV = [
  { href: "/studio/upload", label: "Upload", short: "Upload" },
  { href: "/studio/tracks", label: "Tracks", short: "Tracks" },
  { href: "/studio/analytics", label: "Analytics", short: "Stats" },
  { href: "/studio/portal", label: "Portal", short: "Portal" },
] as const;

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
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-[#1DB954]/15 text-[#1DB954]"
                    : "text-white/55 hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
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
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/10 bg-[#030a05]/95 backdrop-blur-md md:hidden"
      >
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center py-2.5 text-[0.65rem] font-medium ${
                active ? "text-[#1DB954]" : "text-white/45"
              }`}
            >
              <span>{item.short}</span>
            </Link>
          );
        })}
        <Link
          href="/dashboard"
          className="flex flex-1 flex-col items-center py-2.5 text-[0.65rem] font-medium text-white/35"
        >
          <span>RECT</span>
        </Link>
      </nav>
    </>
  );
}
