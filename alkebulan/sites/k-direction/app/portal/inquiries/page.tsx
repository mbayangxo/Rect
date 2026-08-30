import { markInquiryRead } from "@/lib/portal-actions";
import { getPrisma } from "@/lib/db";
import { formatDate } from "@/lib/catalog";
import { getSettings } from "@/lib/catalog";

export const metadata = { title: "Inquiries" };

export default async function InquiriesPage() {
  const [inquiries, settings] = await Promise.all([
    getPrisma().inquiry.findMany({ orderBy: { createdAt: "desc" } }),
    getSettings(),
  ]);

  return (
    <div>
      <h1 className="font-display text-5xl tracking-[0.1em] uppercase">Inquiries</h1>
      <p className="mt-3 max-w-xl text-white/70">
        Contact form messages land here. Destination setting: {settings.inquiryDestination}.
        Personal email copy: {settings.inquiriesEmail}.
      </p>
      <ul className="mt-8 grid gap-4">
        {inquiries.map((inquiry) => (
          <li key={inquiry.id} className="border border-white/15 p-4">
            <p className="font-display text-xl uppercase">
              {inquiry.firstName} {inquiry.lastName}
            </p>
            <p className="text-sm text-white/60">
              {inquiry.email} · {formatDate(inquiry.createdAt)}
              {inquiry.readAt ? " · read" : " · new"}
            </p>
            <p className="mt-3 whitespace-pre-wrap text-white/90">{inquiry.message}</p>
            {!inquiry.readAt ? (
              <form action={markInquiryRead} className="mt-3">
                <input type="hidden" name="id" value={inquiry.id} />
                <button className="text-sm uppercase text-lime">Mark read</button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
