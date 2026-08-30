import Link from "next/link";
import { getPrisma } from "@/lib/db";

export const metadata = { title: "Portal" };

export default async function PortalHome() {
  const prisma = getPrisma();
  const [artists, posts, events, jobs, apps, inquiries] = await Promise.all([
    prisma.artist.count(),
    prisma.newsPost.count(),
    prisma.event.count(),
    prisma.job.count(),
    prisma.jobApplication.count(),
    prisma.inquiry.count({ where: { readAt: null } }),
  ]);

  const cards = [
    { href: "/portal/artists", label: "Artists", value: artists },
    { href: "/portal/news", label: "Blog posts", value: posts },
    { href: "/portal/events", label: "Events", value: events },
    { href: "/portal/jobs", label: "Jobs", value: jobs },
    { href: "/portal/applications", label: "Applications", value: apps },
    { href: "/portal/inquiries", label: "New inquiries", value: inquiries },
  ];

  return (
    <div>
      <h1 className="font-display text-5xl tracking-[0.1em] uppercase">Dashboard</h1>
      <p className="mt-3 max-w-xl text-white/70">
        This is K-Direction’s Kebu portal. Edit the public site from here.
      </p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <li key={card.label}>
            <Link href={card.href} className="block border border-white/15 p-5 hover:border-lime">
              <p className="font-display text-4xl text-lime">{card.value}</p>
              <p className="mt-1 uppercase tracking-[0.14em]">{card.label}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
