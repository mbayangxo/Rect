import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PageFrame } from "@/components/page-frame";
import { formatDate, getPublishedEvents, getSettings } from "@/lib/catalog";
import { jokoTicketHref } from "@/lib/joko";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Events",
};

export default async function EventsPage() {
  const [events, settings] = await Promise.all([getPublishedEvents(), getSettings()]);

  return (
    <PageFrame tone="lime">
      <h1 className="font-display text-6xl tracking-[0.12em] uppercase sm:text-8xl">
        Events
      </h1>
      <p className="mt-4 max-w-xl text-lg">
        Tickets are sold on Joko. This site does not take payment.
      </p>
      {events.length === 0 ? (
        <p className="mt-8 max-w-lg text-lg">No events are scheduled right now.</p>
      ) : (
        <ul className="mt-10 grid max-w-2xl gap-6">
          {events.map((event) => (
            <li key={event.id}>
              <Link href={`/events/${event.slug}`} className="block border-[6px] border-ink bg-ink p-6 text-white">
                {event.image ? (
                  <Image
                    src={event.image}
                    alt=""
                    width={800}
                    height={500}
                    className="mb-4 aspect-[16/9] w-full object-cover"
                  />
                ) : null}
                <p className="text-sm uppercase tracking-[0.16em] text-lime">
                  {formatDate(event.startsAt)}
                </p>
                <h2 className="mt-2 font-display text-4xl tracking-[0.08em] uppercase">
                  {event.title}
                </h2>
                {event.venue ? <p className="mt-2 text-white/80">{event.venue}</p> : null}
                {jokoTicketHref(event.ticketUrl, settings.jokoUrl) ? (
                  <p className="mt-3 font-display text-lg uppercase text-lime">Buy on Joko</p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageFrame>
  );
}
