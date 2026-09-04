import Link from "next/link";
import { requireStudioArtist } from "@/lib/studio/require-artist";

export const dynamic = "force-dynamic";

const LINKS = [
  { href: "/studio/upload", label: "Upload", hint: "New track" },
  { href: "/studio/tracks", label: "Tracks", hint: "Your catalog" },
  { href: "/studio/portal", label: "World", hint: "Decorate your portal" },
  { href: "/studio/delivery", label: "DSP Delivery", hint: "Via Taali" },
  { href: "/studio/label", label: "RECT Label", hint: "Roster · mutual accept" },
  { href: "/studio/analytics", label: "Analytics", hint: "Listeners & plays" },
  { href: "/studio/wallet", label: "Wallet", hint: "JOKO payouts" },
  { href: "/studio/accounting", label: "Accounting", hint: "Monthly books" },
  { href: "/studio/store", label: "Store", hint: "Merch" },
  { href: "/studio/tours", label: "Tours", hint: "Events & tickets" },
  { href: "/studio/live", label: "Live Room", hint: "Go live" },
  { href: "/studio/rect-live", label: "RECT Live", hint: "Pro stage" },
  { href: "/parties", label: "Listening parties", hint: "Host a room" },
] as const;

/** Artist Studio hub — mobile “More” tab lands here. */
export default async function StudioIndexPage() {
  const { displayName } = await requireStudioArtist("/studio");

  return (
    <>
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-[var(--rect)]">
        RECT Artist
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight">
        {displayName}
      </h1>
      <p className="mt-2 max-w-xl text-sm text-white/45">
        Separate from RECT Music. Delivery to Spotify / Apple goes through Taali
        — a separate distribution rail.
      </p>
      <ul className="mt-8 grid gap-2 sm:grid-cols-2">
        {LINKS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 transition hover:border-[var(--rect)]/35"
            >
              <span>
                <span className="block text-sm font-medium text-white">
                  {item.label}
                </span>
                <span className="text-xs text-white/40">{item.hint}</span>
              </span>
              <span className="text-white/30" aria-hidden>
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
