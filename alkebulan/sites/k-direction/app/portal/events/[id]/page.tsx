import { saveEvent } from "@/lib/portal-actions";
import { getPrisma } from "@/lib/db";
import { toDatetimeLocal } from "@/lib/catalog";
import { notFound } from "next/navigation";

export const metadata = { title: "Edit event" };

export default async function EditEventPage({
  params,
}: PageProps<"/portal/events/[id]">) {
  const { id } = await params;
  const event =
    id === "new" ? null : await getPrisma().event.findUnique({ where: { id } });
  if (id !== "new" && !event) {
    notFound();
  }

  return (
    <div>
      <h1 className="font-display text-5xl tracking-[0.1em] uppercase">
        {event ? "Edit event" : "Add event"}
      </h1>
      <form action={saveEvent} className="mt-8 grid max-w-xl gap-4">
        {event ? <input type="hidden" name="id" value={event.id} /> : null}
        <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
          Title
          <input name="title" required defaultValue={event?.title ?? ""} className="normal-case border border-white/30 bg-transparent px-3 py-2" />
        </label>
        <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
          Slug
          <input name="slug" defaultValue={event?.slug ?? ""} className="normal-case border border-white/30 bg-transparent px-3 py-2" />
        </label>
        <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
          Starts
          <input
            name="startsAt"
            type="datetime-local"
            required
            defaultValue={toDatetimeLocal(event?.startsAt)}
            className="normal-case border border-white/30 bg-transparent px-3 py-2"
          />
        </label>
        <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
          Venue
          <input name="venue" defaultValue={event?.venue ?? ""} className="normal-case border border-white/30 bg-transparent px-3 py-2" />
        </label>
        <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
          City
          <input name="city" defaultValue={event?.city ?? ""} className="normal-case border border-white/30 bg-transparent px-3 py-2" />
        </label>
        <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
          Joko ticket URL
          <input
            name="ticketUrl"
            type="url"
            placeholder="https://"
            defaultValue={event?.ticketUrl ?? ""}
            className="normal-case border border-white/30 bg-transparent px-3 py-2"
          />
        </label>
        <p className="text-sm text-white/60">
          Buyers pay on Joko, not here. Paste the Joko page for this show.
        </p>
        <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
          Description
          <textarea name="description" rows={5} defaultValue={event?.description ?? ""} className="normal-case border border-white/30 bg-transparent px-3 py-2" />
        </label>
        <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
          Photo
          <input name="image" type="file" accept="image/*" className="normal-case" />
        </label>
        <label className="flex items-center gap-2 text-sm uppercase tracking-[0.14em]">
          <input name="published" type="checkbox" defaultChecked={event?.published ?? true} />
          Published
        </label>
        <button className="justify-self-start bg-lime px-6 py-3 font-display text-2xl text-ink uppercase">
          Save
        </button>
      </form>
    </div>
  );
}
