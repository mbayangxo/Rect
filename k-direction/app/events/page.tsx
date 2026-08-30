import type { Metadata } from "next";
import { PageFrame } from "@/components/page-frame";
import { formatDate, getPublishedEvents } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Events",
};

export default async function EventsPage() {
  const events = await getPublishedEvents();

  return (
    <PageFrame tone="lime">
      <h1 className="font-display text-6xl tracking-[0.12em] uppercase sm:text-8xl">
        Events
      </h1>
      {events.length === 0 ? (
        <p className="mt-8 max-w-lg text-lg">No events are scheduled right now.</p>
      ) : (
        <ul className="mt-10 grid max-w-2xl gap-6">
          {events.map((event) => (
            <li key={event.id} className="border-[6px] border-ink bg-ink p-6 text-white">
              <p className="text-sm uppercase tracking-[0.16em] text-lime">
                {formatDate(event.startsAt)}
              </p>
              <h2 className="mt-2 font-display text-4xl tracking-[0.08em] uppercase">
                {event.title}
              </h2>
              {event.venue ? <p className="mt-2 text-white/80">{event.venue}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </PageFrame>
  );
}
