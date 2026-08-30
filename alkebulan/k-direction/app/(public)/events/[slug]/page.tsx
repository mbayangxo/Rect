import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { PageFrame } from "@/components/page-frame";
import { formatDate, getEvent } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/events/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEvent(slug);
  return { title: event?.title ?? "Event" };
}

export default async function EventPage({
  params,
}: PageProps<"/events/[slug]">) {
  const { slug } = await params;
  const event = await getEvent(slug);
  if (!event || !event.published) {
    notFound();
  }

  return (
    <PageFrame tone="lime">
      {event.image ? (
        <Image
          src={event.image}
          alt=""
          width={1200}
          height={700}
          className="mb-8 aspect-[16/9] w-full max-w-3xl object-cover"
        />
      ) : null}
      <p className="font-display text-lg tracking-[0.16em] uppercase">
        {formatDate(event.startsAt)}
      </p>
      <h1 className="mt-2 font-display text-6xl tracking-[0.08em] uppercase sm:text-8xl">
        {event.title}
      </h1>
      {event.venue || event.city ? (
        <p className="mt-4 text-lg">
          {[event.venue, event.city].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      {event.description ? (
        <p className="mt-6 max-w-xl text-lg whitespace-pre-wrap">{event.description}</p>
      ) : null}
      {event.ticketUrl ? (
        <p className="mt-8">
          <a
            href={event.ticketUrl}
            className="inline-block bg-ink px-8 py-3 font-display text-2xl tracking-[0.12em] text-lime uppercase"
            target="_blank"
            rel="noreferrer"
          >
            Buy tickets on Joko
          </a>
        </p>
      ) : (
        <p className="mt-8 text-lg">Tickets will be listed on Joko when they go on sale.</p>
      )}
    </PageFrame>
  );
}
