import Link from "next/link";
import { logoutPortal } from "@/lib/portal-actions";

const links = [
  { href: "/portal", label: "Home" },
  { href: "/portal/artists", label: "Artists" },
  { href: "/portal/news", label: "Blog" },
  { href: "/portal/events", label: "Events" },
  { href: "/portal/jobs", label: "Jobs" },
  { href: "/portal/applications", label: "Applications" },
  { href: "/portal/inquiries", label: "Inquiries" },
  { href: "/portal/settings", label: "Settings" },
];

export function PortalNav() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-ink px-4 py-3">
      <p className="font-display text-2xl tracking-[0.12em] text-lime">Kebu · K-Direction</p>
      <nav className="flex flex-wrap gap-2" aria-label="Portal">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="bg-lime px-2 py-1 font-display text-sm tracking-[0.12em] text-ink uppercase hover:bg-pink"
          >
            {link.label}
          </Link>
        ))}
        <Link
          href="/"
          className="border border-white/30 px-2 py-1 font-display text-sm tracking-[0.12em] uppercase"
        >
          View site
        </Link>
        <form action={logoutPortal}>
          <button className="px-2 py-1 font-display text-sm tracking-[0.12em] uppercase text-pink">
            Log out
          </button>
        </form>
      </nav>
    </header>
  );
}
