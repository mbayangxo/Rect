"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { nav } from "@/content/site";
import { Logo } from "@/components/logo";

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openFor, setOpenFor] = useState(pathname);
  if (openFor !== pathname) {
    setOpenFor(pathname);
    setOpen(false);
  }

  return (
    <header className="sticky top-0 z-50 bg-ink text-white">
      <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Logo />
        <nav className="hidden flex-wrap items-center justify-end gap-2 lg:flex" aria-label="Primary">
          {nav.map((item) => {
            const current =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={`px-3 py-1.5 font-display text-lg tracking-[0.14em] uppercase transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime ${
                  current
                    ? "bg-pink text-ink"
                    : "bg-lime text-ink hover:bg-pink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          className="font-display text-lg tracking-[0.16em] uppercase text-lime lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>
      {open ? (
        <nav
          id="mobile-nav"
          className="grid gap-2 border-t border-white/10 px-4 py-4 lg:hidden"
          aria-label="Mobile"
        >
          {nav.map((item) => {
            const current =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={`px-3 py-3 text-center font-display text-2xl tracking-[0.14em] uppercase ${
                  current ? "bg-pink text-ink" : "bg-lime text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </header>
  );
}
