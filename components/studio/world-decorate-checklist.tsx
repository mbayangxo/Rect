import Link from "next/link";
import type { StudioPortalProfile } from "@/lib/studio/require-artist";
import type { PortalRelease } from "@/lib/dashboard/portal-releases";

type Props = {
  profile: StudioPortalProfile;
  worlds: PortalRelease[];
  artistId: string;
};

type Check = { id: string; label: string; done: boolean; href?: string };

/**
 * Decorate my World — readiness checklist so artists finish likeness + worlds.
 */
export function WorldDecorateChecklist({
  profile,
  worlds,
  artistId,
}: Props) {
  const published = worlds.filter((w) => w.published);
  const withMedia = worlds.filter((w) => w.media.length > 0 || w.coverUrl);

  const checks: Check[] = [
    {
      id: "likeness",
      label: "Upload your likeness (avatar photo)",
      done: Boolean(profile.avatarUrl),
      href: "#world-likeness",
    },
    {
      id: "banner",
      label: "Add a World banner",
      done: Boolean(profile.bannerUrl),
      href: "#world-banner",
    },
    {
      id: "bio",
      label: "Write a short bio",
      done: Boolean(profile.artistBio?.trim()),
      href: "#studio-profile",
    },
    {
      id: "places",
      label: "Pick places & genres",
      done: profile.countries.length > 0 && profile.genres.length > 0,
      href: "#studio-profile",
    },
    {
      id: "world",
      label: "Publish at least one portal world",
      done: published.length > 0,
      href: "#portal-worlds",
    },
    {
      id: "photos",
      label: "Add photos or video to a world",
      done: withMedia.length > 0,
      href: "#portal-worlds",
    },
  ];

  const doneCount = checks.filter((c) => c.done).length;
  const ready = doneCount === checks.length;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.2em] text-[var(--rect)]">
            Decorate my World
          </p>
          <h2 className="mt-1 font-[family-name:var(--font-syne)] text-lg font-semibold">
            {ready ? "World looks ready" : "Finish your World"}
          </h2>
          <p className="mt-1 text-sm text-white/45">
            Likeness, banner, and portal worlds fans enter from your page.
          </p>
        </div>
        <p className="text-sm tabular-nums text-white/50">
          {doneCount}/{checks.length}
        </p>
      </div>
      <ul className="mt-4 space-y-2">
        {checks.map((c) => (
          <li key={c.id}>
            <a
              href={c.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                c.done
                  ? "text-white/40 line-through"
                  : "text-white/80 hover:bg-white/[0.04]"
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] ${
                  c.done
                    ? "bg-[var(--rect)]/25 text-[var(--rect)]"
                    : "border border-white/20 text-white/30"
                }`}
                aria-hidden
              >
                {c.done ? "✓" : ""}
              </span>
              {c.label}
            </a>
          </li>
        ))}
      </ul>
      <Link
        href={`/artists/${artistId}`}
        className="mt-4 inline-block text-sm text-[var(--rect)] hover:underline"
      >
        Preview live World →
      </Link>
    </section>
  );
}
