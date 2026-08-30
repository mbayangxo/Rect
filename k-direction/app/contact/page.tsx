import type { Metadata } from "next";
import { ContactForm } from "@/components/contact-form";
import { PageFrame } from "@/components/page-frame";
import { getSettings } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contact",
};

export default async function ContactPage() {
  const settings = await getSettings();

  return (
    <PageFrame>
      <h1 className="text-center font-display text-6xl tracking-[0.16em] text-white/70 uppercase sm:text-8xl">
        Reach out
      </h1>
      <div className="mx-auto mt-10 grid max-w-2xl gap-3 text-center font-display text-2xl tracking-[0.08em] uppercase sm:text-3xl">
        <p>
          Bookings:{" "}
          <a className="text-lime hover:text-pink" href={`mailto:${settings.bookingsEmail}`}>
            {settings.bookingsEmail}
          </a>
        </p>
        <p>
          Inquiries:{" "}
          <a className="text-lime hover:text-pink" href={`mailto:${settings.inquiriesEmail}`}>
            {settings.inquiriesEmail}
          </a>
        </p>
      </div>
      <div className="mx-auto mt-12 max-w-xl">
        <ContactForm />
      </div>
    </PageFrame>
  );
}
