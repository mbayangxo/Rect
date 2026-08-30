import { saveSettings } from "@/lib/portal-actions";
import { getSettings } from "@/lib/catalog";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const settings = await getSettings();
  return (
    <div>
      <h1 className="font-display text-5xl tracking-[0.1em] uppercase">Settings</h1>
      <form action={saveSettings} className="mt-8 grid max-w-xl gap-4">
        <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
          Name
          <input name="name" defaultValue={settings.name} className="normal-case border border-white/30 bg-transparent px-3 py-2" />
        </label>
        <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
          Legal
          <input name="legal" defaultValue={settings.legal} className="normal-case border border-white/30 bg-transparent px-3 py-2" />
        </label>
        <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
          Mission
          <textarea name="mission" rows={3} defaultValue={settings.mission} className="normal-case border border-white/30 bg-transparent px-3 py-2" />
        </label>
        <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
          Bookings email
          <input name="bookingsEmail" defaultValue={settings.bookingsEmail} className="normal-case border border-white/30 bg-transparent px-3 py-2" />
        </label>
        <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
          Personal / inquiries email
          <input name="inquiriesEmail" defaultValue={settings.inquiriesEmail} className="normal-case border border-white/30 bg-transparent px-3 py-2" />
        </label>
        <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
          Contact form goes to
          <select name="inquiryDestination" defaultValue={settings.inquiryDestination} className="normal-case border border-white/30 bg-ink px-3 py-2">
            <option value="portal">Portal only</option>
            <option value="email">Personal email only</option>
            <option value="both">Portal and personal email</option>
          </select>
        </label>
        <p className="text-sm text-white/60">
          Messages are always stored in the portal so nothing is lost. Email copies need a mail
          provider on Vercel later. Until then, use the portal inbox.
        </p>
        <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
          Kebu URL
          <input name="kebuUrl" type="url" defaultValue={settings.kebuUrl ?? ""} className="normal-case border border-white/30 bg-transparent px-3 py-2" />
        </label>
        <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
          Joko tickets URL
          <input
            name="jokoUrl"
            type="url"
            placeholder="https://"
            defaultValue={settings.jokoUrl ?? ""}
            className="normal-case border border-white/30 bg-transparent px-3 py-2"
          />
        </label>
        <p className="text-sm text-white/60">
          People buy event tickets on Joko. This site never takes payment. Paste the Joko home or
          events page here. Each event can still override with its own Joko listing.
        </p>
        <button className="justify-self-start bg-lime px-6 py-3 font-display text-2xl text-ink uppercase">
          Save
        </button>
      </form>
    </div>
  );
}
