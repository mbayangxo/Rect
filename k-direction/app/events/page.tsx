import type { Metadata } from "next";
import { PageFrame } from "@/components/page-frame";

export const metadata: Metadata = {
  title: "Events",
};

export default function EventsPage() {
  return (
    <PageFrame tone="lime">
      <h1 className="font-display text-6xl tracking-[0.12em] uppercase sm:text-8xl">
        Events
      </h1>
      <p className="mt-8 max-w-lg text-lg">
        No events are scheduled right now.
      </p>
    </PageFrame>
  );
}
