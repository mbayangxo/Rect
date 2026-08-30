import Link from "next/link";
import { deleteEvent } from "@/lib/portal-actions";
import { getPrisma } from "@/lib/db";
import { formatDate } from "@/lib/catalog";

export const metadata = { title: "Events" };

export default async function PortalEventsPage() {
  const events = await getPrisma().event.findMany({ orderBy: { startsAt: "desc" } });
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-5xl tracking-[0.1em] uppercase">Events</h1>
        <Link href="/portal/events/new" className="bg-lime px-4 py-2 font-display text-ink uppercase">
          Add event
        </Link>
      </div>
      <p className="mt-3 max-w-xl text-white/70">
        Ticket sales go through Joko. Paste a Joko URL on each event. This site does not checkout.
      </p>
      <ul className="mt-8 grid gap-4">
        {events.map((event) => (
          <li key={event.id} className="flex flex-wrap items-center justify-between gap-3 border border-white/15 p-4">
            <div>
              <p className="font-display text-2xl uppercase">{event.title}</p>
              <p className="text-sm text-white/60">{formatDate(event.startsAt)}</p>
            </div>
            <div className="flex gap-3">
              <Link href={`/portal/events/${event.id}`} className="text-lime uppercase">
                Edit
              </Link>
              <form action={deleteEvent}>
                <input type="hidden" name="id" value={event.id} />
                <button className="uppercase text-pink">Remove</button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
